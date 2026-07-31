import fs from 'node:fs/promises'
import path from 'node:path'
import { loadEchartsMinJs } from '@/src/export/offline/echarts-asset'
import { extractEmbeddedOfflineViewModel } from '@/src/export/offline/embedded-view-model'
import { safeFileToken } from '@/src/export/offline/html-utils'
import { renderOfflineHtmlDocument } from '@/src/export/offline/render-html'
import type { OfflineDeviceViewModel, OfflineInverterViewModel, OfflineOverviewViewModel } from '@/src/export/offline/types'
import { writeZipArchive } from '@/src/export/offline/zip-archive'

type Options = {
  excel: string
  sn: string
  seedDir: string
  out: string
  days: number
}

function takeValue(argv: string[], index: number) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`参数 ${argv[index]} 缺少值。`)
  return value
}

function parseOptions(argv: string[]): Options {
  const options: Partial<Options> = {
    seedDir: 'artifacts/offline-ui/from-docs-data',
    out: 'artifacts/offline-ui/four-device-review',
    days: 7
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--excel') {
      options.excel = takeValue(argv, index)
      index += 1
    } else if (arg === '--sn') {
      options.sn = takeValue(argv, index)
      index += 1
    } else if (arg === '--seed-dir') {
      options.seedDir = takeValue(argv, index)
      index += 1
    } else if (arg === '--out') {
      options.out = takeValue(argv, index)
      index += 1
    } else if (arg === '--days') {
      options.days = Number(takeValue(argv, index))
      index += 1
    } else {
      throw new Error(`未知参数：${arg}`)
    }
  }
  if (!options.excel || !options.sn) {
    throw new Error('必须明确提供 --excel <本地文件> 与 --sn <设备 SN>。')
  }
  if (!Number.isInteger(options.days) || !options.days || options.days < 1 || options.days > 30) {
    throw new Error('--days 必须为 1 到 30 的整数。')
  }
  return options as Options
}

async function readEmbeddedModels(dir: string) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const models = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /^(device|inverter)-.*\.html$/i.test(entry.name))
      .map(async (entry) => ({
        fileName: entry.name,
        model: extractEmbeddedOfflineViewModel(await fs.readFile(path.join(dir, entry.name), 'utf8'))
      }))
  )
  return models
}

function deviceFileName(deviceSn: string) {
  return `device-${safeFileToken(deviceSn)}.html`
}

function inverterFileName(deviceSn: string, inverterIndex: number) {
  return `inverter-${safeFileToken(deviceSn)}-${inverterIndex}.html`
}

function buildOverview(devices: OfflineDeviceViewModel[]): OfflineOverviewViewModel {
  const staleAfterMs = 7 * 24 * 60 * 60 * 1000
  const items = devices.map((device) => {
    const lastAt = new Date(device.lastReportedAt.replaceAll('/', '-'))
    const elapsedMs = Number.isNaN(lastAt.getTime()) ? null : Math.max(0, Date.now() - lastAt.getTime())
    const offlineAlert = !device.ctOnline && (elapsedMs === null || elapsedMs < staleAfterMs)
    const reverseState = device.ctOnline
      ? (device.reverseNow ? 'active' as const : 'normal' as const)
      : (device.reverseNow ? 'unknown-last-seen-reverse' as const : 'unknown' as const)
    return {
      deviceSn: device.deviceSn,
      isOnline: device.ctOnline,
      lastReportedAt: device.lastReportedAt,
      offlineDuration: device.ctOnline ? '—' : device.ctStatusDuration,
      offlineAlert,
      reverseState,
      reversePhases: device.reversePhases.length ? device.reversePhases.join(' / ') : '—',
      todayEnergy: device.todayEnergy,
      runtimeState: device.ctState,
      limitState: device.limitState,
      sub1gState: device.sub1gState,
      wifiSignal: device.wifiSignal ?? '—',
      href: `./${deviceFileName(device.deviceSn)}`
    }
  })
  items.sort((left, right) => {
    const priority = (item: typeof left) => item.reverseState === 'active' ? 0 : item.offlineAlert ? 1 : item.isOnline ? 2 : 3
    return priority(left) - priority(right) || left.deviceSn.localeCompare(right.deviceSn)
  })
  return {
    kind: 'overview',
    title: '四设备离线审阅总览',
    sourceLabel: '本地 Excel 快照',
    items,
    summary: {
      activeTotal: items.length,
      onlineCtCount: items.filter((item) => item.isOnline).length,
      offlineCtCount: items.filter((item) => !item.isOnline).length,
      criticalReverseFlowCount: items.filter((item) => item.reverseState === 'active').length,
      actionableOfflineCount: items.filter((item) => item.offlineAlert).length,
      staleOfflineCount: items.filter((item) => !item.isOnline && !item.offlineAlert).length
    }
  }
}

async function writeBundleZip(bundleDir: string, zipPath: string) {
  const files: Array<{ name: string; data: Buffer }> = []
  async function walk(dir: string, prefix: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const full = path.join(dir, entry.name)
      const name = path.posix.join(prefix, entry.name)
      if (entry.isDirectory()) await walk(full, name)
      else files.push({ name, data: await fs.readFile(full) })
    }
  }
  await walk(bundleDir, 'bundle')
  await writeZipArchive(zipPath, files)
}

async function removeDeprecatedTelemetryRegisters(outDir: string) {
  const entries = await fs.readdir(outDir, { withFileTypes: true })
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /^reported-parameters-.*\.html$/i.test(entry.name))
      .map((entry) => fs.rm(path.join(outDir, entry.name), { force: true }))
  )
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const outDir = path.resolve(options.out)
  const seedDir = path.resolve(options.seedDir)
  await fs.access(options.excel)
  await fs.access(seedDir)
  await fs.mkdir(outDir, { recursive: true })
  await removeDeprecatedTelemetryRegisters(outDir)

  const embedded = await readEmbeddedModels(seedDir)
  const retainedDevices = embedded
    .filter((item): item is { fileName: string; model: OfflineDeviceViewModel } => item.model.kind === 'device')
    .map((item) => item.model)
  const retainedInverters = embedded
    .filter((item): item is { fileName: string; model: OfflineInverterViewModel } => item.model.kind === 'inverter')
    .map((item) => item.model)
  if (!retainedDevices.length) throw new Error('种子目录中没有可读取的设备离线页面。')
  if (retainedDevices.some((device) => device.deviceSn === options.sn)) {
    throw new Error(`种子目录已包含 ${options.sn}；拒绝重复合并。`)
  }

  const { withTempSqliteFromExcel } = await import('@/src/export/offline/excel-temp-import')
  const added = await withTempSqliteFromExcel(options.excel, options.sn, async () => {
    const [{ buildDeviceViewModel }, inverterBuilders] = await Promise.all([
      import('@/src/export/offline/build-device-view-model'),
      import('@/src/export/offline/build-inverter-view-model')
    ])
    const { buildInverterViewModel, buildInverterViewModelFromDevice, hasInverterDetailData } = inverterBuilders
    const device = await buildDeviceViewModel(options.sn, options.days, {
      sourceLabelOverride: 'Excel 导入',
      includeDetailLinks: true
    })
    const inverters: OfflineInverterViewModel[] = []
    for (const inverter of device.inverters) {
      try {
        inverters.push(
          await buildInverterViewModel(options.sn, inverter.index, options.days, {
            sourceLabelOverride: 'Excel 导入'
          })
        )
      } catch {
        // A card without a bound channel has no valid detail page to export.
      }
    }
    return { device, inverters, buildInverterViewModelFromDevice, hasInverterDetailData }
  })

  const retainedDerivedInverters = retainedDevices.flatMap((device) =>
    device.inverters
      .filter(added.hasInverterDetailData)
      .map((inverter) => added.buildInverterViewModelFromDevice(device, inverter))
  )
  const allInverterByFile = new Map<string, OfflineInverterViewModel>()
  for (const inverter of [...retainedDerivedInverters, ...retainedInverters, ...added.inverters]) {
    allInverterByFile.set(inverterFileName(inverter.deviceSn, inverter.inverterIndex), inverter)
  }
  const allInverters = [...allInverterByFile.values()]
  const availableInverterFiles = new Set(allInverters.map((inverter) => inverterFileName(inverter.deviceSn, inverter.inverterIndex)))
  const deviceOptions = [...retainedDevices, added.device]
    .map((device) => device.deviceSn)
    .sort((left, right) => left.localeCompare(right))
    .map((deviceSn) => ({ sn: deviceSn, href: `./${deviceFileName(deviceSn)}` }))
  const devices = [...retainedDevices, added.device]
    .map((device) => ({
      ...device,
      wifiSignal: device.wifiSignal ?? '—',
      deviceOptions,
      overviewHref: './index.html',
      inverters: device.inverters.map((inverter) => {
        const detailFile = inverterFileName(device.deviceSn, inverter.index)
        return { ...inverter, detailHref: availableInverterFiles.has(detailFile) ? `./${detailFile}` : undefined }
      })
    }))
    .sort((left, right) => left.deviceSn.localeCompare(right.deviceSn))
  const overview = buildOverview(devices)
  const echartsSource = loadEchartsMinJs()

  const bundleDir = path.join(outDir, 'bundle')
  const assetsDir = path.join(bundleDir, 'assets')
  await fs.rm(bundleDir, { recursive: true, force: true })
  await fs.mkdir(assetsDir, { recursive: true })
  await fs.writeFile(path.join(assetsDir, 'echarts.min.js'), echartsSource, 'utf8')
  const pages: Array<{ fileName: string; html: string }> = [
    {
      fileName: 'index.html',
      html: renderOfflineHtmlDocument({ vm: overview, echartsSource, embedEcharts: true, title: overview.title })
    }
  ]
  for (const device of devices) {
    pages.push({
      fileName: deviceFileName(device.deviceSn),
      html: renderOfflineHtmlDocument({ vm: device, echartsSource, embedEcharts: true, title: device.title })
    })
  }
  for (const inverter of allInverters) {
    pages.push({
      fileName: inverterFileName(inverter.deviceSn, inverter.inverterIndex),
      html: renderOfflineHtmlDocument({ vm: { ...inverter, deviceHref: `./${deviceFileName(inverter.deviceSn)}` }, echartsSource, embedEcharts: true, title: inverter.title })
    })
  }
  for (const page of pages) {
    await fs.writeFile(path.join(outDir, page.fileName), page.html, 'utf8')
    await fs.writeFile(
      path.join(bundleDir, page.fileName),
      page.fileName === 'index.html'
        ? renderOfflineHtmlDocument({ vm: overview, echartsSource, embedEcharts: false, echartsSrc: './assets/echarts.min.js', title: overview.title })
        : page.html.replace(`<script>${echartsSource}\n</script>`, '<script src="./assets/echarts.min.js"></script>'),
      'utf8'
    )
  }
  await fs.writeFile(
    path.join(bundleDir, 'README.txt'),
    '四设备离线审阅包\n\n双击 index.html 查看四台设备；无需联网、无需 Next.js、无需数据库。\n',
    'utf8'
  )
  const zipPath = path.join(outDir, 'anti-reverse-device-ui-four-device-review.zip')
  await writeBundleZip(bundleDir, zipPath)
  console.log(
    JSON.stringify(
      {
        status: 'ok',
        deviceCount: devices.length,
        deviceSns: devices.map((device) => device.deviceSn),
        outDir,
        zipPath
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
