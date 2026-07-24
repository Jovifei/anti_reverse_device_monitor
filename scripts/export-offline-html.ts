import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseExportArgs, printExportHelp } from '@/src/export/offline/cli'
import { withTempSqliteFromExcel } from '@/src/export/offline/excel-temp-import'
import { exportOfflineHtml } from '@/src/export/offline/package-export'

function toDbUrl(dbPath: string) {
  const absolute = path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath)
  return `file:${absolute.replace(/\\/g, '/')}`
}

async function ensureDemoSeed() {
  const demoDb = path.join(process.cwd(), 'data', 'demo-device-monitor.db')
  process.env.APP_DATABASE_URL = 'file:../data/demo-device-monitor.db'
  process.env.DEMO_DATABASE_FILE = 'demo-device-monitor.db'
  const seed = process.platform === 'win32'
    ? { file: 'cmd.exe', args: ['/d', '/s', '/c', 'npx tsx scripts/seed-demo.ts'] }
    : { file: 'npx', args: ['tsx', 'scripts/seed-demo.ts'] }
  execFileSync(seed.file, seed.args, { cwd: process.cwd(), env: process.env, stdio: 'inherit' })
  await fs.access(demoDb)
}

async function main() {
  let options
  try {
    options = parseExportArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    console.error(printExportHelp())
    process.exitCode = 1
    return
  }

  if (options.help) {
    console.log(printExportHelp())
    return
  }

  try {
    if (options.db) {
      process.env.APP_DATABASE_URL = toDbUrl(options.db)
    }

    if (options.demo && !options.excel) {
      await ensureDemoSeed()
      options.sourceLabelOverride = 'Demo SQLite'
      options.all = true
      if (!options.singleFile && !options.bundle) {
        options.singleFile = true
        options.bundle = true
      }
    }

    const runExport = async () => exportOfflineHtml(options)

    const result = options.excel
      ? await withTempSqliteFromExcel(options.excel, options.sn, async () => {
          options.sourceLabelOverride = 'Excel 导入'
          if (!options.sn) options.all = true
          return runExport()
        })
      : await runExport()

    console.log(JSON.stringify({ status: 'ok', deviceCount: result.deviceCount, written: result.written, zipPath: result.zipPath }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

main()
