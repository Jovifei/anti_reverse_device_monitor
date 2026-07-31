import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

const deviceEntrySchema = z.object({
  sn: z.string().min(1).optional(),
  device_id: z.string().min(1),
  product_id: z.string().min(1).optional(),
  collection: z.string().min(1).optional(),
  label: z.string().optional()
})

const registrySchema = z.object({
  version: z.literal(1),
  devices: z.array(deviceEntrySchema).default([])
})

export type DeviceRegistryEntry = z.infer<typeof deviceEntrySchema>
export type DeviceRegistry = z.infer<typeof registrySchema>

export function placeholderSnFromDeviceId(deviceId: string): string {
  const prefix = deviceId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'unknown'
  return `unknown-${prefix}`
}

export function isPlaceholderSn(deviceSn: string): boolean {
  return deviceSn.startsWith('unknown-')
}

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
