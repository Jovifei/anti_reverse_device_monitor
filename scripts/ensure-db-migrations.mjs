/**
 * Apply pending Prisma SQL migrations to a pre-existing SQLite DB that was
 * created with `db push` (no _prisma_migrations history). Existing schemas
 * are baselined only after their migration-specific structure is verified.
 */
import { createHash, randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'prisma', 'migrations')

function checksum(sql) {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex')
}

async function listMigrationFolders() {
  const entries = await readdir(migrationsDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

async function ensureMigrationsTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )
  `)
}

async function appliedNames(prisma) {
  const rows = await prisma.$queryRawUnsafe('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL')
  return new Set(rows.map((row) => row.migration_name))
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`
}

async function hasTables(prisma, tableNames) {
  const rows = await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type = 'table'")
  const present = new Set(rows.map((row) => String(row.name)))
  return tableNames.every((name) => present.has(name))
}

async function hasColumns(prisma, tableName, columnNames) {
  const rows = await prisma.$queryRawUnsafe(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
  const present = new Set(rows.map((row) => String(row.name)))
  return columnNames.every((name) => present.has(name))
}

async function hasIndex(prisma, tableName, expectedColumns, unique) {
  const indexes = await prisma.$queryRawUnsafe(`PRAGMA index_list(${quoteIdentifier(tableName)})`)
  for (const index of indexes) {
    if (Number(index.unique) !== Number(unique)) continue
    const columns = await prisma.$queryRawUnsafe(`PRAGMA index_info(${quoteIdentifier(String(index.name))})`)
    const columnNames = columns
      .sort((left, right) => Number(left.seq) - Number(right.seq))
      .map((column) => String(column.name))
    if (columnNames.length === expectedColumns.length && columnNames.every((name, index) => name === expectedColumns[index])) return true
  }
  return false
}

async function hasOldTelemetryUnique(prisma) {
  return hasIndex(prisma, 'Telemetry', ['deviceId', 'inverterId', 'metricKey', 'reportedAt'], true)
}

async function hasOldDeviceLatestUnique(prisma) {
  return hasIndex(prisma, 'DeviceLatest', ['deviceId', 'metricKey'], true)
}

async function matchesInitialSchema(prisma) {
  return (await hasTables(prisma, ['Device', 'InverterBinding', 'MetricDefinition', 'Telemetry', 'DeviceLatest', 'DeviceEvent', 'FaultEvent', 'ReverseFlowAlert', 'ImportBatch', 'SyncCheckpoint'])) &&
    (await hasColumns(prisma, 'Device', ['deviceSn', 'updatedAt'])) &&
    (await hasColumns(prisma, 'InverterBinding', ['deviceId', 'inverterIndex'])) &&
    (await hasColumns(prisma, 'Telemetry', ['deviceId', 'sourceRecordId'])) &&
    (await hasColumns(prisma, 'DeviceLatest', ['deviceId', 'metricKey'])) &&
    (await hasColumns(prisma, 'SyncCheckpoint', ['sourceName', 'sourceCursor']))
}

async function matchesMigrationSchema(prisma, name) {
  if (name === '0001_init') return matchesInitialSchema(prisma)
  if (name === '0002_add_inverter_phase_num') return hasColumns(prisma, 'InverterBinding', ['phaseNum'])
  if (name === '0003_source_sync_audit') {
    return (await hasColumns(prisma, 'Telemetry', ['sourceName'])) &&
      (await hasColumns(prisma, 'SyncCheckpoint', ['lastError', 'lastSuccessAt'])) &&
      (await hasTables(prisma, ['SyncBatch', 'SyncError'])) &&
      (await hasIndex(prisma, 'Telemetry', ['sourceName', 'reportedAt'], false))
  }
  if (name.includes('preserve_source_record_identity') || name.includes('remove_legacy_telemetry_natural_unique')) {
    return !(await hasOldTelemetryUnique(prisma)) &&
      await hasIndex(prisma, 'Telemetry', ['deviceId', 'inverterId', 'metricKey', 'reportedAt', 'sourceRecordId'], false)
  }
  if (name.includes('align_device_latest_index')) {
    return !(await hasOldDeviceLatestUnique(prisma)) &&
      await hasIndex(prisma, 'DeviceLatest', ['deviceId', 'metricKey'], false)
  }
  return false
}

async function main() {
  const prisma = new PrismaClient()
  try {
    await ensureMigrationsTable(prisma)
    const done = await appliedNames(prisma)
    const folders = await listMigrationFolders()

    for (const name of folders) {
      const sqlPath = path.join(migrationsDir, name, 'migration.sql')
      const sql = await readFile(sqlPath, 'utf8')
      if (done.has(name)) {
        console.log(`[migrate] skip ${name} (already applied)`)
        continue
      }

      if (await matchesMigrationSchema(prisma, name)) {
        console.log(`[migrate] mark ${name} (schema already matches)`)
      } else {
        console.log(`[migrate] apply ${name}`)
        // Split on semicolons carefully enough for our migration files.
        const statements = sql
          .split(/;\s*(?:\r?\n|$)/)
          .map((part) => part.trim())
          .filter(Boolean)
        for (const statement of statements) {
          await prisma.$executeRawUnsafe(statement)
        }
      }

      await prisma.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations"
          ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
         VALUES (?, ?, CURRENT_TIMESTAMP, ?, NULL, NULL, CURRENT_TIMESTAMP, 1)`,
        randomUUID(),
        checksum(sql),
        name
      )
      console.log(`[migrate] recorded ${name}`)
    }

    if (await hasOldTelemetryUnique(prisma)) {
      throw new Error('Old Telemetry unique index is still present after migrate')
    }
    console.log('[migrate] ok — Telemetry allows same-time multi sourceRecordId')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('[migrate] failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
