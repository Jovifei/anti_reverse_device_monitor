import { spawnSync } from 'node:child_process'
import { loadLocalEnvironment } from '@/src/adapters/source-db/config'

loadLocalEnvironment()
if (!process.env.APP_DATABASE_URL) {
  process.env.APP_DATABASE_URL = 'file:../data/device-monitor.db'
}

const result = spawnSync('npx', ['prisma', 'db', 'push', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: process.env
})
process.exit(result.status ?? 1)
