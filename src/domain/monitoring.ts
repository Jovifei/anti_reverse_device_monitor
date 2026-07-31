import { resolveStatusLabel } from '@/src/domain/dictionaries'

export interface MetricRow {
  metricKey: string
  valueNumber: number | null
  valueText: string | null
  reportedAt: Date | string
}

export interface MetricDefinition {
  key: string
  label: string
  unit: string
  aliases: string[]
  color: string
  markNegative?: boolean
  /** ECharts step line: hold previous sample until next timestamp, then jump. */
  step?: 'start' | 'middle' | 'end'
}

/** Alarm red is reserved for rendered negative-power evidence, never a normal series identity. */
export const NEGATIVE_POWER_ALERT_COLOR = '#c92828'
export const NON_ALERT_CHART_FALLBACK_COLOR = '#2563eb'

const LEGACY_ALERT_SERIES_COLORS = new Set([
  '#c92828', '#dc2626', '#ef4444', '#e11d48', '#be123c', '#b91c1c', '#c33131'
])

export const CT_POWER_METRICS: MetricDefinition[] = [
  { key: 'load', label: '家庭负载功率', unit: 'W', aliases: ['load_power', 'ct.load_power'], color: '#1463d9' },
  { key: 'grid', label: '电网功率', unit: 'W', aliases: ['grid_power', 'ct.grid_power'], color: '#0d9488', markNegative: true },
  { key: 'generation', label: '微逆发电总功率', unit: 'W', aliases: ['inverter_total_power', 'total_generation_power', 'micro_total_power'], color: '#ea580c' },
  { key: 'ct-a', label: 'A相 CT 有功功率', unit: 'W', aliases: ['active_power_ct1', 'ct.active_power.phase_a'], color: '#A67C00', markNegative: true },
  { key: 'ct-b', label: 'B相 CT 有功功率', unit: 'W', aliases: ['active_power_ct2', 'ct.active_power.phase_b'], color: '#168449', markNegative: true },
  { key: 'ct-c', label: 'C相 CT 有功功率', unit: 'W', aliases: ['active_power_ct3', 'ct.active_power.phase_c'], color: '#1463d9', markNegative: true },
  { key: 'inv-a', label: 'A相微逆当前功率', unit: 'W', aliases: ['active_power_inv1', 'inverter_power_ct1'], color: '#65a30d' },
  { key: 'inv-b', label: 'B相微逆当前功率', unit: 'W', aliases: ['active_power_inv2', 'inverter_power_ct2'], color: '#7c3aed' },
  { key: 'inv-c', label: 'C相微逆当前功率', unit: 'W', aliases: ['active_power_inv3', 'inverter_power_ct3'], color: '#4f46e5' }
]

export const GRID_QUALITY_METRICS: MetricDefinition[] = [
  { key: 'voltage', label: '电网电压', unit: 'V', aliases: ['grid_voltage'], color: '#2563eb' },
  { key: 'frequency', label: '电网频率', unit: 'Hz', aliases: ['grid_frequency'], color: '#9333ea' }
]

export const INVERTER_POWER_METRICS: MetricDefinition[] = [
  { key: 'power', label: '发电总功率', unit: 'W', aliases: ['inverter_power', 'generation_power', 'total_power', 'power'], color: '#ea580c' },
  { key: 'pv1', label: 'PV1 功率', unit: 'W', aliases: ['pv1_power', 'pv1power'], color: '#1463d9' },
  { key: 'pv2', label: 'PV2 功率', unit: 'W', aliases: ['pv2_power', 'pv2power'], color: '#0d9488' }
]

export const INVERTER_TEMPERATURE_METRIC: MetricDefinition = {
  key: 'temperature',
  label: '内部温度',
  unit: '°C',
  aliases: ['internal_temperature', 'temperature', 'temp'],
  color: '#0f766e'
}

const CANONICAL_CHART_COLORS: Record<string, string> = Object.fromEntries(
  [
    ...CT_POWER_METRICS,
    ...GRID_QUALITY_METRICS,
    ...INVERTER_POWER_METRICS,
    INVERTER_TEMPERATURE_METRIC
  ].map((metric) => [metric.key, metric.color])
)

/**
 * Canonicalize chart series received from any source, including retained offline
 * review snapshots. A stale red series color must not turn normal telemetry into
 * an alert; actual negative values are rendered by a separate alert layer.
 */
export function chartSeriesDisplayColor(key: string, requestedColor: string) {
  const canonical = CANONICAL_CHART_COLORS[key]
  if (canonical) return canonical
  const normalized = requestedColor.trim().toLowerCase()
  return LEGACY_ALERT_SERIES_COLORS.has(normalized) ? NON_ALERT_CHART_FALLBACK_COLOR : requestedColor
}

export const CT_KPI_ALIASES = {
  todayEnergy: ['today_energy', 'today_generation_energy'],
  totalEnergy: ['total_energy', 'lifetime_energy', 'accumulated_energy'],
  todayDuration: ['today_generation_duration', 'today_duration', 'generation_duration'],
  state: ['ct_state', 'state'],
  limitState: ['limit_state'],
  sub1gState: ['sub1g_state'],
  workMode: ['work_mode']
}

export const INVERTER_KPI_ALIASES = {
  onlineState: ['online_state'],
  workState: ['work_state'],
  generating: ['is_generating', 'generating_state', 'generation_state'],
  todayEnergy: ['today_energy', 'today_generation_energy'],
  totalEnergy: ['total_energy', 'lifetime_energy', 'accumulated_energy'],
  todayDuration: ['today_generation_duration', 'today_duration', 'generation_duration'],
  packetLoss: ['packet_loss_rate', 'packet_loss'],
  phase: ['phase_num'],
  connectionPoint: ['connection_point'],
  antiReverse: ['anti_reverse_enabled', 'anti_reverse_switch'],
  generationEnabled: ['generation_enabled', 'generation_switch'],
  powerLimit: ['power_limit', 'limit_power']
}

function normalizedMetricKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '.')
}

export function metricMatches(metricKey: string, aliases: string[]) {
  const actual = normalizedMetricKey(metricKey)
  return aliases.some((alias) => {
    const normalizedAlias = normalizedMetricKey(alias)
    return actual === normalizedAlias || actual.endsWith(`.${normalizedAlias}`) || actual.endsWith(normalizedAlias)
  })
}

export function numericValue(row: MetricRow | undefined): number | null {
  if (!row) return null
  if (row.valueNumber !== null && Number.isFinite(row.valueNumber)) return row.valueNumber
  if (row.valueText === null || row.valueText.trim() === '') return null
  const parsed = Number(row.valueText)
  return Number.isFinite(parsed) ? parsed : null
}

export function isReverseFlowPower(row: MetricRow | undefined) {
  const value = numericValue(row)
  return value !== null && value < 0
}

export function displayValue(row: MetricRow | undefined, unit = '') {
  const numeric = numericValue(row)
  if (numeric !== null) return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(numeric)}${unit ? ` ${unit}` : ''}`
  if (row?.valueText && row.valueText.trim()) return `${row.valueText}${unit ? ` ${unit}` : ''}`
  return '—'
}

/** 原始遥测电量为 Wh，展示统一换算为 kWh（÷1000）。 */
export function whToKwh(valueWh: number) {
  return valueWh / 1000
}

export function displayEnergyKwh(row: MetricRow | undefined) {
  const numeric = numericValue(row)
  if (numeric !== null) {
    return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(whToKwh(numeric))} kWh`
  }
  if (row?.valueText && row.valueText.trim()) return `${row.valueText} kWh`
  return '—'
}

export function scaleEnergyPointsWhToKwh(points: Array<[string, number]>): Array<[string, number]> {
  return points.map(([at, value]) => [at, whToKwh(value)])
}

export function findLatestMetric<T extends MetricRow>(rows: T[], aliases: string[]) {
  return rows.find((row) => metricMatches(row.metricKey, aliases))
}

export function formatDuration(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '—'
  if (minutes < 60) return `${Math.round(minutes)} 分钟`
  const hours = Math.floor(minutes / 60)
  const remaining = Math.round(minutes % 60)
  return `${hours} 小时 ${remaining} 分钟`
}

export function formatTime(value: Date | string | null | undefined) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: process.env.APP_TIMEZONE || 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(parsed)
}

/** Month-day + time without year, for compact alarm timelines. */
export function formatTimeShort(value: Date | string | null | undefined) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: process.env.APP_TIMEZONE || 'Asia/Shanghai',
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(parsed)
}

export function getInverterStatus(raw: number | null) {
  const label = resolveStatusLabel('inverter_online_state', raw) ?? '无数据'
  if (raw === 2) return { label, variant: 'online' as const }
  if (raw === 1) return { label, variant: 'offline' as const }
  if (raw === 0) return { label, variant: 'unpaired' as const }
  return { label, variant: 'unknown' as const }
}

export function getInverterWorkStatus(raw: number | null) {
  return resolveStatusLabel('inverter_work_state', raw) ?? '—'
}

export function displaySwitch(row: MetricRow | undefined) {
  const value = numericValue(row)
  if (value === 1) return '\u5f00\u542f'
  if (value === 0) return '\u5173\u95ed'
  return displayValue(row)
}

/** 微逆所在相：1/2/3 → A/B/C 相，便于与 CT 三相对照。 */
export function displayInverterPhaseLabel(raw: string | number | null | undefined) {
  if (raw === null || raw === undefined || raw === '') return '—'
  const asNumber = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (asNumber === 1) return 'A相'
  if (asNumber === 2) return 'B相'
  if (asNumber === 3) return 'C相'
  const label = resolveStatusLabel('phase_num', raw)
  if (label === 'CT1相') return 'A相'
  if (label === 'CT2相') return 'B相'
  if (label === 'CT3相') return 'C相'
  return label ?? String(raw)
}

export function displayPowerLimit(row: MetricRow | undefined) {
  const value = numericValue(row)
  if (value === 0) return '\u5173\u95ed'
  if (value !== null) return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value)} W`
  return displayValue(row)
}

/** Real-time output is authoritative; status flags are only a fallback when output is missing. */
export function isGenerating(rawOnlineState: number | null, rawWorkState: number | null, rawPower?: number | null) {
  if (rawPower === undefined) return rawOnlineState === 2 && (rawWorkState === 1 || rawWorkState === 3)
  if (rawOnlineState !== 2) return false
  if (rawPower !== null && Number.isFinite(rawPower)) return rawPower > 1
  return rawWorkState === 1 || rawWorkState === 3
}
