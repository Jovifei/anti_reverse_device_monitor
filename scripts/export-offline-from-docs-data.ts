import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

async function main() {
  const dataDir = path.join(process.cwd(), 'docs', 'data')
  const outDir = path.join(process.cwd(), 'artifacts', 'offline-ui', 'from-docs-data')
  const dbFile = 'preview-from-docs-data.db'
  const dbPath = path.join(process.cwd(), 'data', dbFile)
  await fs.mkdir(path.dirname(dbPath), { recursive: true })
  await fs.rm(dbPath, { force: true })
  await fs.writeFile(dbPath, '')
  process.env.APP_DATABASE_URL = `file:../data/${dbFile}`
  process.env.APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Shanghai'

  const prismaCommand =
    process.platform === 'win32'
      ? { file: 'cmd.exe', args: ['/d', '/s', '/c', 'npx prisma db push --skip-generate'] }
      : { file: 'npx', args: ['prisma', 'db', 'push', '--skip-generate'] }
  execFileSync(prismaCommand.file, prismaCommand.args, { cwd: process.cwd(), env: process.env, stdio: 'inherit' })

  const { importExcelToDatabase } = await import('@/src/export/offline/excel-temp-import')
  const { exportOfflineHtml } = await import('@/src/export/offline/package-export')
  const { prisma } = await import('@/src/lib/prisma')

  const files = (await fs.readdir(dataDir)).filter((name) => /\.xlsx?$/i.test(name))
  if (!files.length) throw new Error(`docs/data 下没有 Excel：${dataDir}`)
  for (const name of files) {
    const full = path.join(dataDir, name)
    const result = await importExcelToDatabase(full)
    console.log(JSON.stringify({ imported: name, ...result }))
  }

  const result = await exportOfflineHtml({
    all: true,
    days: 7,
    singleFile: true,
    bundle: true,
    out: outDir,
    sourceLabelOverride: 'Excel 导入',
    title: '设备日志离线预览'
  })
  await prisma.$disconnect().catch(() => undefined)
  console.log(JSON.stringify({ status: 'ok', outDir, written: result.written, zipPath: result.zipPath }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
