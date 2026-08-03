/**
 * Apply config/device-sn-map.xlsx → config/devices.json (Mongo sync registry).
 *
 * Expected sheet columns (header row, case-insensitive):
 *   sn | device_id | product_id? | collection? | label?
 *
 * Missing product_id / collection fall back to MONGODB_PRODUCT_ID / MONGODB_COLLECTION
 * or the anti-reverse CT defaults used by existing devices.
 */
import fs from 'node:fs'
import path from 'node:path'
import { read, utils } from 'xlsx'
import { loadLocalEnvironment } from '@/src/adapters/source-db/config'
import type { DeviceRegistry, DeviceRegistryEntry } from '@/src/adapters/source-db/device-registry'

const DEFAULT_PRODUCT_ID = '689adc659f04ec32f7642fbb'
const DEFAULT_LABEL = 'anti-reverse-ct'

function cell(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const hit = Object.entries(row).find(([header]) => header.trim().toLowerCase() === key.toLowerCase())
    if (!hit) continue
    const value = hit[1]
    if (value === null || value === undefined) continue
    const text = String(value).trim()
    if (text) return text
  }
  return ''
}

function loadMap(filePath: string, defaults: { productId: string; collection: string; label: string }): DeviceRegistry {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Device SN map not found: ${filePath}`)
  }
  const workbook = read(fs.readFileSync(filePath), { type: 'buffer', cellDates: false })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error(`Excel has no sheets: ${filePath}`)
  const rows = utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' })
  const byId = new Map<string, DeviceRegistryEntry>()

  for (const [index, row] of rows.entries()) {
    const sn = cell(row, 'sn', 'device_sn', 'devicesn', '设备sn', '序列号')
    const deviceId = cell(row, 'device_id', 'deviceid', 'id', '设备id')
    if (!sn && !deviceId) continue
    if (!sn || !deviceId) {
      throw new Error(`Row ${index + 2}: both sn and device_id are required (got sn=${sn || '—'} device_id=${deviceId || '—'})`)
    }
    const productId = cell(row, 'product_id', 'productid', '产品id') || defaults.productId
    const collection =
      cell(row, 'collection', '集合') || defaults.collection || (productId ? `device_log_${productId}` : '')
    const label = cell(row, 'label', '备注', '名称') || defaults.label
    byId.set(deviceId, {
      sn,
      device_id: deviceId,
      product_id: productId || undefined,
      collection: collection || undefined,
      label: label || undefined
    })
  }

  const devices = [...byId.values()].sort((a, b) => (a.sn ?? '').localeCompare(b.sn ?? '') || a.device_id.localeCompare(b.device_id))
  if (devices.length === 0) {
    throw new Error(`No device rows found in ${filePath}`)
  }
  return { version: 1, devices }
}

function main() {
  loadLocalEnvironment()
  const root = process.cwd()
  const mapPath = path.resolve(root, process.env.DEVICES_SN_MAP_PATH?.trim() || path.join('config', 'device-sn-map.xlsx'))
  const outPath = path.resolve(root, process.env.DEVICES_REGISTRY_PATH?.trim() || path.join('config', 'devices.json'))
  const productId = process.env.MONGODB_PRODUCT_ID?.trim() || DEFAULT_PRODUCT_ID
  const collection = process.env.MONGODB_COLLECTION?.trim() || `device_log_${productId}`
  const registry = loadMap(mapPath, { productId, collection, label: DEFAULT_LABEL })

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')
  console.log(
    JSON.stringify(
      {
        status: 'ok',
        source: mapPath,
        output: outPath,
        deviceCount: registry.devices.length,
        sns: registry.devices.map((item) => item.sn)
      },
      null,
      2
    )
  )
}

main()
