/**
 * Interactive UI identity helpers — operators only see SN.
 * Mongo device_id stays server-side (registry / productModel) and must not appear in labels.
 * Keep this module free of node:fs — it is imported by client components.
 */

export function placeholderSnFromDeviceId(deviceId: string): string {
  const prefix = deviceId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'unknown'
  return `unknown-${prefix}`
}

export function isPlaceholderSn(deviceSn: string): boolean {
  return deviceSn.startsWith('unknown-')
}

export function deviceSnPrimaryLabel(deviceSn: string, _sourceDeviceId?: string | null) {
  return deviceSn
}

export function deviceSnSecondaryLabel(deviceSn: string, _sourceDeviceId?: string | null) {
  if (isPlaceholderSn(deviceSn)) return '缺少正式 SN，请在服务端注册表补全映射后再同步'
  return null
}

export function deviceIdentityLabel(deviceSn: string, _sourceDeviceId?: string | null) {
  return deviceSn
}
