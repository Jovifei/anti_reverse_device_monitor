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
  hasSustainedReverse: boolean
  sustainedReverseMaxMinutes: number | null
  sustainedReversePhases: Array<'A' | 'B' | 'C'>
  /** Near-7d inverter fault other than PV1/PV2 undervoltage / PV voltage abnormal. */
  hasRecentInverterFault: boolean
  offlineMinutes: number | null
  offlineAlert: boolean
  todayEnergy: string
  /** Aggregate micro-inverter generation: generating | idle (online, not generating) | offline */
  inverterGenerationStatus: 'generating' | 'idle' | 'offline'
  inverterGenerationLabel: string
  runtimeState: string
  limitState: string
  sub1gState: string
  wifiSignal: string
}
