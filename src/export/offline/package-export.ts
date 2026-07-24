import fs from 'node:fs/promises'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import { buildDeviceViewModel } from '@/src/export/offline/build-device-view-model'
import { buildInverterViewModel } from '@/src/export/offline/build-inverter-view-model'
import { buildOverviewViewModel } from '@/src/export/offline/build-overview-view-model'
import { loadEchartsMinJs } from '@/src/export/offline/echarts-asset'
import { safeFileToken } from '@/src/export/offline/html-utils'
import { renderOfflineHtmlDocument } from '@/src/export/offline/render-html'
import type { ExportCliOptions } from '@/src/export/offline/types'
import { DeviceService } from '@/src/services/device-service'
import { prisma } from '@/src/lib/prisma'

async function ensureCleanDir(dir: string) {
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

export async function writeZipArchive(zipPath: string, files: Array<{ name: string; data: Buffer }>) {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8')
    const compressed = deflateSync(file.data)
    const crc = crc32(file.data)
    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(file.data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    nameBuf.copy(local, 30)
    parts.push(local, compressed)

    const centralHeader = Buffer.alloc(46 + nameBuf.length)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0, 8)
    centralHeader.writeUInt16LE(8, 10)
    centralHeader.writeUInt16LE(0, 12)
    centralHeader.writeUInt16LE(0, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(compressed.length, 20)
    centralHeader.writeUInt32LE(file.data.length, 24)
    centralHeader.writeUInt16LE(nameBuf.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)
    nameBuf.copy(centralHeader, 46)
    central.push(centralHeader)
    offset += local.length + compressed.length
  }
  const centralDir = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralDir.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  await fs.mkdir(path.dirname(zipPath), { recursive: true })
  await fs.writeFile(zipPath, Buffer.concat([...parts, centralDir, end]))
}

async function listExportSns(options: ExportCliOptions): Promise<string[]> {
  if (options.sn) return [options.sn]
  if (options.all || options.demo) {
    const service = new DeviceService()
    const list = await service.listDevices({ page: '1', pageSize: '100' })
    return list.items.map((item) => item.deviceSn)
  }
  throw new Error('必须指定 --sn <SN> 或 --all')
}

export async function exportOfflineHtml(options: ExportCliOptions) {
  if (!options.singleFile && !options.bundle) {
    throw new Error('必须指定 --single-file 和/或 --bundle')
  }
  const outRoot = path.resolve(options.out)
  await fs.mkdir(outRoot, { recursive: true })
  const echartsSource = loadEchartsMinJs()
  const sns = await listExportSns(options)
  if (!sns.length) throw new Error('没有可导出的设备')

  const written: string[] = []
  const sourceOverride = options.sourceLabelOverride ?? (options.demo ? 'Demo SQLite' : options.excel ? 'Excel 导入' : undefined)
  const filePrefix = options.demo ? 'demo-device-' : 'device-'
  const deviceOptions = sns.map((sn) => ({
    sn,
    href: `./${filePrefix}${safeFileToken(sn)}.html`
  }))

  if (options.singleFile) {
    for (const sn of sns) {
      const vm = await buildDeviceViewModel(sn, options.days, {
        sourceLabelOverride: sourceOverride,
        deviceOptions
      })
      const fileName = `${filePrefix}${safeFileToken(vm.deviceSn)}.html`
      const filePath = path.join(outRoot, fileName)
      const html = renderOfflineHtmlDocument({
        vm,
        echartsSource,
        embedEcharts: true,
        title: options.title || vm.title
      })
      await fs.writeFile(filePath, html, 'utf8')
      written.push(filePath)
    }
  }

  let zipPath: string | null = null
  if (options.bundle) {
    const bundleDir = path.join(outRoot, 'bundle')
    await ensureCleanDir(bundleDir)
    const assetsDir = path.join(bundleDir, 'assets')
    await fs.mkdir(assetsDir, { recursive: true })
    await fs.writeFile(path.join(assetsDir, 'echarts.min.js'), echartsSource, 'utf8')

    const overview = await buildOverviewViewModel(options.days, { sourceLabelOverride: sourceOverride })
    const indexHtml = renderOfflineHtmlDocument({
      vm: overview,
      echartsSource,
      embedEcharts: false,
      echartsSrc: './assets/echarts.min.js',
      title: options.title || overview.title
    })
    await fs.writeFile(path.join(bundleDir, 'index.html'), indexHtml, 'utf8')
    written.push(path.join(bundleDir, 'index.html'))

    for (const sn of sns) {
      const deviceVm = await buildDeviceViewModel(sn, options.days, {
        sourceLabelOverride: sourceOverride,
        includeDetailLinks: true,
        deviceOptions
      })
      const deviceFile = `device-${safeFileToken(deviceVm.deviceSn)}.html`
      const deviceHtml = renderOfflineHtmlDocument({
        vm: deviceVm,
        echartsSource,
        embedEcharts: false,
        echartsSrc: './assets/echarts.min.js'
      })
      await fs.writeFile(path.join(bundleDir, deviceFile), deviceHtml, 'utf8')
      written.push(path.join(bundleDir, deviceFile))

      for (const inv of deviceVm.inverters) {
        if (inv.statusVariant === 'unknown' && inv.sn === '—' && inv.power === '—') continue
        try {
          const invVm = await buildInverterViewModel(deviceVm.deviceSn, inv.index, options.days, {
            sourceLabelOverride: sourceOverride
          })
          const invFile = `inverter-${safeFileToken(deviceVm.deviceSn)}-${inv.index}.html`
          const invHtml = renderOfflineHtmlDocument({
            vm: invVm,
            echartsSource,
            embedEcharts: false,
            echartsSrc: './assets/echarts.min.js'
          })
          await fs.writeFile(path.join(bundleDir, invFile), invHtml, 'utf8')
          written.push(path.join(bundleDir, invFile))
        } catch {
          // channel without binding/data: skip detail page
        }
      }
    }

    await fs.writeFile(
      path.join(bundleDir, 'README.txt'),
      ['防逆流设备离线 UI 包', '', '1. 解压本目录或 ZIP', '2. 双击 index.html', '3. 无需联网、无需 Next.js、无需数据库', ''].join('\n'),
      'utf8'
    )

    zipPath = path.join(outRoot, options.demo ? 'anti-reverse-device-ui-demo.zip' : 'anti-reverse-device-ui.zip')
    const zipFiles: Array<{ name: string; data: Buffer }> = []
    async function walk(dir: string, prefix: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        const rel = path.posix.join(prefix, entry.name.replace(/\\/g, '/'))
        if (entry.isDirectory()) await walk(full, rel)
        else zipFiles.push({ name: rel, data: await fs.readFile(full) })
      }
    }
    await walk(bundleDir, 'bundle')
    await writeZipArchive(zipPath, zipFiles)
    written.push(zipPath)
  }

  await prisma.$disconnect().catch(() => undefined)
  return { written, zipPath, deviceCount: sns.length }
}
