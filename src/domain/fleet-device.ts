/** Fleet overview row — keep free of Node builtins (used by client table). */
export interface FleetDeviceItem {
  id: number
  deviceSn: string
  productModel: string | null
  platformOnline: boolean
  lastReportedAt: Date | null
  inverterCount: number
  onlineInverterCount: number
  offlineInverterIndexes: number[]
  hasOfflineInverter: boolean
  isOnline: boolean
  reverseFlow: boolean
  reverseFlowPhases: Array<'A' | 'B' | 'C'>
  reverseState: 'normal' | 'active' | 'unknown' | 'unknown-last-seen-reverse'
  /** Any negative CT phase-power sample in the latest seven-day window. */
  hasRecentReverse: boolean
  hasSustainedReverse: boolean
  sustainedReverseMaxMinutes: number | null
  sustainedReversePhases: Array<'A' | 'B' | 'C'>
  /** Near-7d inverter fault other than PV1/PV2 undervoltage / PV voltage abnormal. */
  hasRecentInverterFault: boolean
  offlineMinutes: number | null
  offlineAlert: boolean
  /** 7 日分类：近 7 日有上报数据 OR IoT 平台在线 → active；否则 stale-offline。 */
  classifyStatus: 'active' | 'stale-offline'
  /** 近 3 日有上报、且 7 日窗口更早 4 日无上报。 */
  isNewlyOnline: boolean
  /** 来自 IoT 注册表（config/devices.json）的当前在线状态。 */
  online?: boolean
  todayEnergy: string
  /** Aggregate micro-inverter generation: generating | idle (online, not generating) | offline */
  inverterGenerationStatus: 'generating' | 'idle' | 'offline'
  inverterGenerationLabel: string
  runtimeState: string
  limitState: string
  sub1gState: string
  wifiSignal: string
}

/**
 * Keep the fleet ordering stable while surfacing the most actionable devices
 * before pagination. Ties intentionally return 0 so registry order is kept.
 */
export function fleetDevicePriority(device: FleetDeviceItem): number {
  if (device.reverseState === 'active') return 0
  if (device.hasRecentReverse) return 1
  if (device.hasRecentInverterFault) return 2
  if (device.offlineAlert) return 3
  if (device.hasOfflineInverter) return 4
  if (device.isNewlyOnline) return 5
  if (device.classifyStatus === 'stale-offline') return 6
  return 7
}

export function compareFleetDevices(left: FleetDeviceItem, right: FleetDeviceItem): number {
  return fleetDevicePriority(left) - fleetDevicePriority(right)
}
