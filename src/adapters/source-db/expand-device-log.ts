import type { MongoFieldMapping } from '@/src/adapters/source-db/mongo-field-mapping'
import type { SourceTelemetryRecord } from '@/src/adapters/source-db/types'

export type DeviceLogDocument = {
  _id?: { toString(): string } | string
  device_id?: unknown
  time?: unknown
  data?: unknown
}

/** ess-smart-ct-v2 INV_PIID_* → monitor metricKey (SIID 4–11). */
const INV_PIID_METRIC_KEYS: Record<string, string> = {
  '1': 'online_state',
  '2': 'inverter_sn',
  '3': 'software_version',
  '4': 'sub1g_version',
  '5': 'product_model',
  '6': 'work_state',
  '7': 'inverter_power',
  '8': 'today_energy',
  '9': 'total_energy',
  '10': 'anti_reverse_enabled',
  '11': 'generation_enabled',
  '12': 'today_duration',
  '13': 'fault_param',
  '14': 'internal_temperature',
  '16': 'pv1_voltage',
  '17': 'pv1_current',
  '18': 'pv2_voltage',
  '19': 'pv2_current',
  '20': 'grid_voltage',
  '21': 'grid_frequency',
  '22': 'phase_num',
  '24': 'power_limit',
  '25': 'connection_point',
  '26': 'pv1_power',
  '27': 'pv2_power',
  '28': 'pv3_power',
  '29': 'pv4_power',
  '33': 'pv_num',
  '34': 'sub1g_address',
  '35': 'channel_index',
  '37': 'packet_loss_rate'
}

function asEpochSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
  }
  return null
}

export function reportedAtFromLogTime(timeSeconds: number): Date {
  return new Date(timeSeconds * 1000)
}

export function parseDataKey(key: string): { siid: string; piid: string } | null {
  const match = /^(\d+)_(\d+)$/.exec(key.trim())
  if (!match) return null
  return { siid: match[1], piid: match[2] }
}

function resolveField(
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

  const parsed = parseDataKey(key)
  if (!parsed) return null
  const siidNum = Number(parsed.siid)
  if (!Number.isInteger(siidNum) || siidNum < 4 || siidNum > 11) return null
  const metricKey = INV_PIID_METRIC_KEYS[parsed.piid]
  if (!metricKey) return null
  return {
    metricKey,
    siid: parsed.siid,
    piid: parsed.piid,
    inverterIndex: siidNum - 3
  }
}

export function expandDeviceLogDocument(params: {
  document: DeviceLogDocument
  deviceSn: string
  mapping: MongoFieldMapping
  receivedAt?: Date
}): SourceTelemetryRecord[] {
  const timeSeconds = asEpochSeconds(params.document.time)
  if (timeSeconds === null) return []
  const data = params.document.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return []

  const reportedAt = reportedAtFromLogTime(timeSeconds)
  const receivedAt = params.receivedAt ?? reportedAt
  const docId =
    typeof params.document._id === 'string'
      ? params.document._id
      : params.document._id?.toString?.() ?? `${params.deviceSn}:${timeSeconds}`

  const records: SourceTelemetryRecord[] = []
  for (const [rawKey, rawValue] of Object.entries(data as Record<string, unknown>)) {
    const key = rawKey.trim()
    const field = resolveField(key, params.mapping)
    if (!field) continue
    records.push({
      sourceRecordId: `${docId}:${key}`,
      deviceSn: params.deviceSn,
      sourceDeviceId: typeof params.document.device_id === 'string' ? params.document.device_id : undefined,
      siid: field.siid,
      piid: field.piid,
      inverterIndex: field.inverterIndex,
      reportedAt,
      receivedAt,
      value: rawValue as string | number | boolean | null,
      metricKey: field.metricKey
    })
  }
  return records
}
