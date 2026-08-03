/**
 * Apply pending Prisma SQL migrations to a pre-existing SQLite DB that was
 * created with `db push` (no _prisma_migrations history). Safe to re-run.
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

async function hasOldTelemetryUnique(prisma) {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type='index' AND name='Telemetry_deviceId_inverterId_metricKey_reportedAt_key'"
  )
  return rows.length > 0
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

      // 0004 is required when the old natural unique still exists.
      if (name.includes('preserve_source_record_identity') && !(await hasOldTelemetryUnique(prisma))) {
        console.log(`[migrate] mark ${name} (schema already without old unique)`)
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
