import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function runPrismaPush(env: NodeJS.ProcessEnv) {
  const command = process.platform === 'win32'
    ? { file: 'cmd.exe', args: ['/d', '/s', '/c', 'npx prisma db push --skip-generate'] }
    : { file: 'npx', args: ['prisma', 'db', 'push', '--skip-generate'] }
  return spawnSync(command.file, command.args, { cwd: root, env, encoding: 'utf8' })
}

function runMigrationScript(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ['scripts/ensure-db-migrations.mjs'], { cwd: root, env, encoding: 'utf8' })
}

describe('ensure-db-migrations', () => {
  it('baselines a complete db-push schema and remains idempotent', async () => {
    const dataDirectory = path.join(root, 'data')
    await mkdir(dataDirectory, { recursive: true })
    const fixtureDirectory = await mkdtemp(path.join(dataDirectory, 'migration-regression-'))
    const databaseUrl = `file:../data/${path.basename(fixtureDirectory)}/device-monitor.db`
    const env = { ...process.env, APP_DATABASE_URL: databaseUrl }
    let prisma: PrismaClient | undefined

    try {
      const pushed = runPrismaPush(env)
      expect(pushed.status, `${pushed.stdout}\n${pushed.stderr}`).toBe(0)

      const first = runMigrationScript(env)
      expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0)
      expect(first.stdout).toContain('[migrate] mark 0001_init')
      expect(first.stdout).not.toContain('[migrate] apply 0001_init')

      prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
      const migrations = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
        'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name'
      )
      expect(migrations.map((row) => row.migration_name)).toEqual([
        '0001_init',
        '0002_add_inverter_phase_num',
        '0003_source_sync_audit',
        '0004_preserve_source_record_identity',
        '0005_align_device_latest_index',
        '0006_remove_legacy_telemetry_natural_unique'
      ])

      const second = runMigrationScript(env)
      expect(second.status, `${second.stdout}\n${second.stderr}`).toBe(0)
      expect(second.stdout).toContain('[migrate] skip 0001_init (already applied)')
      expect(second.stdout).toContain('[migrate] skip 0006_remove_legacy_telemetry_natural_unique (already applied)')
    } finally {
      await prisma?.$disconnect()
      await rm(fixtureDirectory, { recursive: true, force: true })
    }
  }, 30_000)
})
