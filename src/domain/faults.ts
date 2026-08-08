import { faultDictionaryMap } from './dictionaries'

export interface DecodedFault {
  bit: number
  name: string
}

/** Fleet “近7天微逆故障” ignores PV undervoltage / PV voltage abnormal only. */
export const FLEET_IGNORED_INVERTER_FAULT_BITS = new Set([10, 11, 22])

export const FLEET_IGNORED_INVERTER_FAULT_NAMES = new Set(
  [...FLEET_IGNORED_INVERTER_FAULT_BITS]
    .map((bit) => faultDictionaryMap.bits?.[String(bit)])
    .filter((name): name is string => Boolean(name))
)

export function faultDisplayNames(faultMask: number | null | undefined): string[] | null {
  if (faultMask === null || faultMask === undefined || !Number.isFinite(faultMask)) return null
  const decoded = decodeFaultMask(faultMask)
  return decoded.length ? decoded.map((item) => item.name) : ['当前无故障']
}

export function decodeFaultMask(faultMask: number): DecodedFault[] {
  const bitEntries = Object.entries(faultDictionaryMap.bits ?? {})
  const active: DecodedFault[] = []

  for (let bit = 0; bit < 32; bit += 1) {
    const isActive = (faultMask >>> bit) % 2 === 1
    if (!isActive) {
      continue
    }

    const name = bitEntries.find(([index]) => Number(index) === bit)?.[1] ?? `Fault bit ${bit}`
    active.push({ bit, name })
  }

  return active
}

export function toHexMask(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(8, '0')}`
}

export function hasCriticalFault(faultMask: number): boolean {
  const faults = decodeFaultMask(faultMask)
  return faults.some(({ name }) =>
    /over|abnormal|under|frequency|overcurrent|overtemperature|islanding/i.test(name)
  )
}

/**
 * True when the mask has any active fault other than PV1/PV2 输入欠压 and PV 电压异常.
 * Used by the fleet “近7天微逆故障” filter.
 */
export function hasReportableInverterFault(faultMask: number | null | undefined): boolean {
  if (faultMask === null || faultMask === undefined || !Number.isFinite(faultMask)) return false
  const mask = Math.trunc(faultMask) >>> 0
  if (mask === 0) return false
  return decodeFaultMask(mask).some((item) => !FLEET_IGNORED_INVERTER_FAULT_BITS.has(item.bit))
}

/** Display helper: red-alert only for non-ignored fault names. */
export function isReportableInverterFaultName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed || trimmed === '当前无故障') return false
  return !FLEET_IGNORED_INVERTER_FAULT_NAMES.has(trimmed)
}

export function faultNameClassName(name: string): string {
  if (name === '当前无故障') return 'fault-clear'
  return isReportableInverterFaultName(name) ? 'fault-name is-alert' : 'fault-name is-soft'
}

export const RECENT_REPORTABLE_FAULT_HINT = '（7日内存在故障）'

/**
 * True if any recent fault-change left a non-ignored fault **active** (to side).
 * Recovery-only fromMask is ignored — otherwise unbind/clear noise triggers the 7-day hint.
 */
export function hadRecentReportableInverterFault(
  changes: Array<{
    eventType?: string
    toFaults?: string[]
    fromFaults?: string[]
    toMask?: number
    fromMask?: number
  }>
): boolean {
  return changes.some(
    (event) =>
      (event.toFaults ?? []).some((name) => isReportableInverterFaultName(name)) ||
      hasReportableInverterFault(event.toMask)
  )
}

/**
 * Append “（7日内存在故障）” when current labels are clear/soft-only,
 * but the 7-day change log had reportable faults.
 */
export function formatCurrentFaultLabel(name: string, recentReportableHint: boolean): string {
  if (!recentReportableHint || isReportableInverterFaultName(name)) return name
  return `${name}${RECENT_REPORTABLE_FAULT_HINT}`
}
