import statusDictionary from '@/config/status_dictionary.json'
import faultDictionary from '@/config/fault_dictionary.json'
import metricDictionary from '@/config/metric_dictionary.example.json'

export type StatusDictionaryKey = keyof typeof statusDictionary

export interface MetricDictionaryItem {
  metric_key: string
  siid: string | number
  piid: string | number
  identifier: string
  display_name: string
  data_kind: string
  value_type: string
  unit: string | null
  chart_group: string | null
  chart_enabled: boolean
  critical_rule?: {
    operator: string
    value: number
    severity: string
  }
  retention_days?: number
}

export const statusDictionaryMap = statusDictionary as Record<string, Record<string, string>>

export const faultDictionaryMap = faultDictionary as {
  type: string
  ui_rule: string
  bits: Record<string, string>
}

export const metricDefinitions =
  (metricDictionary as { metrics: MetricDictionaryItem[] }).metrics ?? []

export function resolveStatusLabel(
  dictName: string,
  rawValue: string | number | null | undefined
): string | null {
  if (rawValue === null || rawValue === undefined) {
    return null
  }

  const dict = statusDictionaryMap[dictName]
  if (!dict) {
    return String(rawValue)
  }

  return dict[String(rawValue)] ?? String(rawValue)
}

export function resolveFaultBitLabel(bitIndex: number): string {
  return faultDictionaryMap.bits?.[String(bitIndex)] ?? `Fault bit ${bitIndex}`
}

export function decodeMetricDefinitionsByIdentifier(identifier: string) {
  return metricDefinitions.find((item) => item.identifier === identifier)
}
