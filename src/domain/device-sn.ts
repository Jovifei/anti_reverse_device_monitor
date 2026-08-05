/**
 * Pure SN helpers — safe for client components.
 * Do not import node:fs / device-registry here.
 */

export function placeholderSnFromDeviceId(deviceId: string): string {
  const prefix = deviceId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'unknown'
  return `unknown-${prefix}`
}

export function isPlaceholderSn(deviceSn: string): boolean {
  return deviceSn.startsWith('unknown-')
}
