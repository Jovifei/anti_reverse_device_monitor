import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { placeholderSnFromDeviceId } from '@/src/domain/device-identity'
import type { IotDevice } from '@/src/adapters/iot-api/types'

const deviceEntrySchema = z.object({
  sn: z.string().min(1).optional(),
  device_id: z.string().min(1),
  product_id: z.string().min(1).optional(),
  collection: z.string().min(1).optional(),
  label: z.string().optional(),
  // 来自 IoT 平台的设备名（nickname）与在线状态（online）；均为可选，旧注册表可不含。
  nickname: z.string().optional(),
  online: z.boolean().optional()
})

const registrySchema = z.object({
  version: z.literal(1),
  devices: z.array(deviceEntrySchema).default([])
})

export type DeviceRegistryEntry = z.infer<typeof deviceEntrySchema>
export type DeviceRegistry = z.infer<typeof registrySchema>

export { isPlaceholderSn, placeholderSnFromDeviceId } from '@/src/domain/device-identity'

export function resolveDeviceSn(entry: Pick<DeviceRegistryEntry, 'sn' | 'device_id'>): string {
  const sn = entry.sn?.trim()
  return sn ? sn : placeholderSnFromDeviceId(entry.device_id)
}

export function collectionForEntry(entry: DeviceRegistryEntry, fallbackProductId?: string): string | null {
  if (entry.collection?.trim()) return entry.collection.trim()
  const productId = entry.product_id?.trim() || fallbackProductId?.trim()
  return productId ? `device_log_${productId}` : null
}

export function resolveDeviceRegistryPath(root = process.cwd()): { path: string; mode: 'local' | 'example' } {
  const localPath = path.join(root, process.env.DEVICES_REGISTRY_PATH?.trim() || path.join('config', 'devices.json'))
  if (fs.existsSync(localPath)) return { path: localPath, mode: 'local' }
  return { path: path.join(root, 'config', 'devices.example.json'), mode: 'example' }
}

export function loadDeviceRegistry(root = process.cwd()): { registry: DeviceRegistry; path: string; mode: 'local' | 'example' } {
  const target = resolveDeviceRegistryPath(root)
  const raw = JSON.parse(fs.readFileSync(target.path, 'utf8'))
  const parsed = registrySchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`Invalid device registry at ${target.path}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`)
  }
  return { registry: parsed.data, path: target.path, mode: target.mode }
}

export function mergeDeviceIdsIntoRegistry(
  existing: DeviceRegistry,
  deviceIds: string[],
  defaults: { product_id?: string; collection?: string } = {}
): DeviceRegistry {
  const byId = new Map(existing.devices.map((item) => [item.device_id, item]))
  for (const deviceId of deviceIds) {
    if (!deviceId || byId.has(deviceId)) continue
    byId.set(deviceId, {
      device_id: deviceId,
      product_id: defaults.product_id,
      collection: defaults.collection
    })
  }
  return { version: 1, devices: [...byId.values()].sort((a, b) => a.device_id.localeCompare(b.device_id)) }
}

/**
 * 将 IoT 平台设备列表合并进既有注册表。
 *
 * 行为：
 * - 保留 IoT 列表里所有设备（以 device.id 作为 device_id）。
 * - 已存在的 device_id：更新 nickname / online（nickname 永远取 IoT 最新值），
 *   但 Excel 已 apply 过的 SN 优先保留，不被 IoT 的 sn 覆盖。
 * - 默认【保留】IoT 列表里不存在的旧 device_id，避免误删；仅当 prune=true 时才删除。
 *   即便 prune=true，也会保留人工 Excel 映射过的项（带 label），避免误删人工维护的 SN 映射。
 */
export function mergeIotListIntoRegistry(
  existing: DeviceRegistry,
  iotDevices: IotDevice[],
  defaults: { product_id?: string; collection?: string; label?: string } = {},
  prune = false
): DeviceRegistry {
  const byId = new Map(existing.devices.map((item) => [item.device_id, { ...item }]))

  for (const device of iotDevices) {
    if (!device.id) continue
    const current = byId.get(device.id)
    if (current) {
      // 已存在：保留 Excel 的 SN，更新 IoT 的 nickname / online。
      byId.set(device.id, {
        ...current,
        nickname: device.nickname?.trim() || current.nickname,
        online: device.online ?? current.online
      })
    } else {
      byId.set(device.id, {
        sn: device.sn && device.sn.trim() ? device.sn : placeholderSnFromDeviceId(device.id),
        device_id: device.id,
        product_id: device.productId?.trim() || defaults.product_id,
        collection: defaults.collection || (device.productId ? `device_log_${device.productId}` : undefined),
        label: defaults.label,
        nickname: device.nickname?.trim() || undefined,
        online: device.online
      })
    }
  }

  // 默认保留旧项（不删）；仅显式 prune 才删除 IoT 列表里不存在的旧 device_id。
  if (prune) {
    const iotIds = new Set(iotDevices.map((device) => device.id).filter((id): id is string => Boolean(id)))
    for (const id of [...byId.keys()]) {
      const entry = byId.get(id)
      if (!entry) continue
      // 仅删除「不在 IoT 列表」且「非 Excel 人工映射（无 label）」的项，
      // 避免 prune 误删人工维护的 SN 映射。
      if (!iotIds.has(id) && !entry.label) byId.delete(id)
    }
  }

  const devices: DeviceRegistryEntry[] = [...byId.values()].sort((a, b) => a.device_id.localeCompare(b.device_id))
  return { version: 1, devices }
}
