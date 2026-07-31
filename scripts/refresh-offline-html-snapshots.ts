import fs from 'node:fs/promises'
import path from 'node:path'
import { loadEchartsMinJs } from '@/src/export/offline/echarts-asset'
import { extractEmbeddedOfflineViewModel } from '@/src/export/offline/embedded-view-model'
import { renderOfflineHtmlDocument } from '@/src/export/offline/render-html'
import { writeZipArchive } from '@/src/export/offline/zip-archive'

type Options = { dir: string; zip?: string }

function readOption(argv: string[], name: '--dir' | '--zip') {
  const index = argv.indexOf(name)
  const value = index >= 0 ? argv[index + 1] : undefined
  if (index >= 0 && (!value || value.startsWith('--'))) throw new Error(`${name} 缺少路径。`)
  return value
}

function parseOptions(argv: string[]): Options {
  const dir = readOption(argv, '--dir')
  if (!dir) throw new Error('必须指定 --dir <离线 HTML 目录>。')
  return { dir: path.resolve(dir), zip: readOption(argv, '--zip') ? path.resolve(readOption(argv, '--zip')!) : undefined }
}

async function writeBundleZip(bundleDir: string, zipPath: string) {
  const files: Array<{ name: string; data: Buffer }> = []
  async function walk(dir: string, prefix: string): Promise<void> {
    for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
      const full = path.join(dir, entry.name)
      const name = path.posix.join(prefix, entry.name)
      if (entry.isDirectory()) await walk(full, name)
      else files.push({ name, data: await fs.readFile(full) })
    }
  }
  await walk(bundleDir, 'bundle')
  await writeZipArchive(zipPath, files)
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const echartsSource = loadEchartsMinJs()
  const entries = (await fs.readdir(options.dir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^(index|device-.*|inverter-.*)\.html$/i.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
  if (!entries.length) throw new Error('目录中没有可刷新离线 HTML 页面。')

  const written: string[] = []
  const skipped: string[] = []
  for (const entry of entries) {
    const filePath = path.join(options.dir, entry.name)
    const existing = await fs.readFile(filePath, 'utf8')
    const vm = extractEmbeddedOfflineViewModel(existing)
    const legacyOverview = vm.kind === 'overview' && vm.items.some((item) => !('reverseState' in item))
    if (legacyOverview) {
      // This historical index predates the current overview contract. It has no
      // chart data, so leave it intact rather than inventing new status fields.
      skipped.push(filePath)
      continue
    }
    const externalEcharts = existing.match(/<script\s+src="([^"]*echarts[^\"]*)"><\/script>/i)?.[1]
    const html = renderOfflineHtmlDocument({
      vm,
      echartsSource,
      embedEcharts: !externalEcharts,
      echartsSrc: externalEcharts,
      title: vm.title
    })
    await fs.writeFile(filePath, html, 'utf8')
    written.push(filePath)
  }

  if (options.zip) await writeBundleZip(options.dir, options.zip)
  console.log(JSON.stringify({ status: 'pass', pages: written.length, skippedLegacyOverviewPages: skipped.length, zipPath: options.zip ?? null }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
