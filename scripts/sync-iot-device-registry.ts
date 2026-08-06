/**
 * 同步造梦者 IoT 平台设备列表 → config/devices.json（设备注册表）。
 *
 * 替掉人工维护 Excel（config/device-sn-map.xlsx）的 SN 映射层，
 * 直接调 IoT `getDevices` 自动建立 device_id ↔ SN ↔ nickname 三元映射。
 *
 * 用法：
 *   npm run devices:sync-iot                 # 默认写入 config/devices.json
 *   npm run devices:sync-iot -- --dry-run    # 只打印 diff，不写文件
 *   npm run devices:sync-iot -- --output <path>   # 指定输出路径
 *   npm run devices:sync-iot -- --product-id <id> # 覆盖品类
 *   npm run devices:sync-iot -- --size <n>        # 覆盖每页大小
 *   npm run devices:sync-iot -- --prune           # 删除 IoT 列表里不存在的旧项
 *
 * 默认行为：保留 IoT 列表里所有设备，更新已存在项的 nickname/online，
 * 并保留 Excel 已 apply 过的 SN；IoT 不在的旧 device_id 默认【保留】，不删除。
 * --prune 时删除 IoT 列表里不存在的旧项，但仍保留人工 Excel 映射过的项（带 label）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadLocalEnvironment } from '@/src/adapters/source-db/config'
import {
  loadDeviceRegistry,
  mergeIotListIntoRegistry,
  type DeviceRegistry
} from '@/src/adapters/source-db/device-registry'
import { listAllDevices, loadIotConfig } from '@/src/adapters/iot-api/iot-client'

const DEFAULT_PRODUCT_ID = '689adc659f04ec32f7642fbb'
const DEFAULT_SIZE = 100

/** 判断是否存在某个无值 CLI flag。 */
function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

/** 读取某个带值 CLI flag 的值。 */
function flagValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

type SyncReport = {
  status: 'ok' | 'dry-run' | 'error'
  total: number
  pages: number
  added: number
  updated: number
  removed: number
  durationMs: number
  output: string
  warnings: string[]
}

async function main(): Promise<void> {
  const startedAt = Date.now()
  loadLocalEnvironment()

  const dryRun = hasFlag('--dry-run')
  const prune = hasFlag('--prune')
  const productId = flagValue('--product-id')?.trim() || process.env.MONGODB_PRODUCT_ID?.trim() || DEFAULT_PRODUCT_ID
  const size = Math.max(1, Number(flagValue('--size') || process.env.DREAM_MAKER_IOT_PAGE_SIZE || DEFAULT_SIZE) || DEFAULT_SIZE)
  const outputArg = flagValue('--output')

  // Token 缺失时此处会抛出明确错误：Set DREAM_MAKER_IOT_TOKEN in .env.local
  const config = loadIotConfig()

  const root = process.cwd()

  // 载入既有注册表（不存在则视为空）。
  let existing: DeviceRegistry = { version: 1, devices: [] }
  try {
    existing = loadDeviceRegistry(root).registry
  } catch {
    existing = { version: 1, devices: [] }
  }

  const warnings: string[] = []
  let pages = 0
  const iotDevices = await listAllDevices(
    {
      productId,
      size,
      onPage: (info) => {
        pages = Math.max(pages, info.page)
      },
      onWarning: (message) => warnings.push(message)
    },
    config
  )

  const merged = mergeIotListIntoRegistry(
    existing,
    iotDevices,
    { product_id: productId, collection: `device_log_${productId}` },
    prune
  )

  // 计算 diff 计数。
  const existingById = new Map(existing.devices.map((item) => [item.device_id, item]))
  let added = 0
  let updated = 0
  for (const device of merged.devices) {
    const prev = existingById.get(device.device_id)
    if (!prev) {
      added += 1
    } else if (prev.nickname !== device.nickname || prev.online !== device.online) {
      updated += 1
    }
  }
  const removed = existing.devices.filter(
    (item) => !merged.devices.some((device) => device.device_id === item.device_id)
  ).length

  const outputPath = outputArg ? path.resolve(root, outputArg) : path.join(root, 'config', 'devices.json')

  const report: SyncReport = {
    status: dryRun ? 'dry-run' : 'ok',
    total: iotDevices.length,
    pages,
    added,
    updated,
    removed,
    durationMs: Date.now() - startedAt,
    output: outputPath,
    warnings
  }

  if (dryRun) {
    // dry-run：只打印 diff 预览，不写文件。
    const preview = merged.devices.slice(0, 20).map((device) => ({
      device_id: device.device_id,
      sn: device.sn,
      nickname: device.nickname ?? null,
      online: device.online ?? null
    }))
    console.log(JSON.stringify({ ...report, preview }, null, 2))
    return
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
