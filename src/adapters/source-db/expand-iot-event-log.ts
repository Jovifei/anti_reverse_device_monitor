import type { MongoFieldMapping } from '@/src/adapters/source-db/mongo-field-mapping'
import type { SourceTelemetryRecord } from '@/src/adapters/source-db/types'

export type IotEventLogDocument = {
  _id?: { toString(): string } | string
  deviceId?: unknown
  sn?: unknown
  et?: unknown
  en?: unknown
  ec?: unknown
  t?: unknown
}

/**
 * Platform IoT console maps WiFi RSSI to Chinese「wifi信号强度」, but the
 * underlying event name is `P_0_0` (not `P_2_26`). Those rows live in
 * `iot_event_log_<productId>` and never appear in `device_log_*`.
 */
const IOT_EVENT_METRIC_KEYS: Record<string, { metricKey: string; siid: string; piid: string; inverterIndex: number | null }> = {
  '0_0': { metricKey: 'wifi_signal_strength', siid: '0', piid: '0', inverterIndex: null }
}

export function parseIotEventName(en: string): { siid: string; piid: string } | null {
  const match = /^P_(\d+)_(\d+)$/i.exec(en.trim())
  if (!match) return null
  return { siid: match[1], piid: match[2] }
}

function reportedAtFromEventTime(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // seconds vs ms
    const ms = value < 1e12 ? value * 1000 : value
    const parsed = new Date(ms)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

function resolveIotField(
  key: string,
  mapping: MongoFieldMapping
): { metricKey: string; siid: string; piid: string; inverterIndex: number | null } | null {
  const configured = mapping.fields[key]
  if (configured) {
    return {
      metricKey: configured.metricKey,
      siid: configured.siid,
      piid: configured.piid,
      inverterIndex: configured.inverterIndex
    }
  }
  return IOT_EVENT_METRIC_KEYS[key] ?? null
}

export function expandIotEventLogDocument(params: {
  document: IotEventLogDocument
  deviceSn: string
  mapping: MongoFieldMapping
}): SourceTelemetryRecord | null {
  const et = String(params.document.et ?? '').trim().toUpperCase()
  if (et && et !== 'DATA') return null

  const en = String(params.document.en ?? '').trim()
  const parsed = parseIotEventName(en)
  if (!parsed) return null

  const key = `${parsed.siid}_${parsed.piid}`
  const field = resolveIotField(key, params.mapping)
  if (!field) return null

  const reportedAt = reportedAtFromEventTime(params.document.t)
  if (!reportedAt) return null

  const docId =
    typeof params.document._id === 'string'
      ? params.document._id
      : params.document._id?.toString?.() ?? `${params.deviceSn}:${en}:${reportedAt.toISOString()}`

  return {
    sourceRecordId: `iot-event:${docId}:${en}`,
    deviceSn: params.deviceSn,
    sourceDeviceId: typeof params.document.deviceId === 'string' ? params.document.deviceId : undefined,
    siid: field.siid,
    piid: field.piid,
    inverterIndex: field.inverterIndex,
    reportedAt,
    receivedAt: reportedAt,
    value: params.document.ec as string | number | boolean | null,
    metricKey: field.metricKey
  }
}
