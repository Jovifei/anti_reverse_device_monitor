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

/** Align with connectivity offline threshold used by device/telemetry services. */
export const TELEMETRY_FRESHNESS_MS = 15 * 60 * 1000

export const WIFI_SIGNAL_ALIASES = ['wifi_signal_strength', 'wifi_rssi', 'wifi.signal', 'wifi_signal', '0_0']

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
    if (actual === normalizedAlias) return true
    // Multi-segment aliases may match a dotted suffix (`device.ct.state` ↔ `ct_state`).
    // Single-segment aliases (`state`, `power`) stay exact-only so `limit_state`
    // never resolves as runtime `state`.
    if (!normalizedAlias.includes('.')) return false
    return actual.endsWith(`.${normalizedAlias}`)
  })
}

export function numericValue(row: MetricRow | undefined): number | null {
  if (!row) return null
  if (row.valueNumber !== null && Number.isFinite(row.valueNumber)) return row.valueNumber
  if (row.valueText === null || row.valueText.trim() === '') return null
  const text = row.valueText.trim().toLowerCase()
  if (text === 'true' || text === 'on' || text === 'yes') return 1
  if (text === 'false' || text === 'off' || text === 'no') return 0
  const parsed = Number(text)
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

/** Default: break line if adjacent samples are more than 2 hours apart. */
export const CHART_TIME_GAP_BREAK_MS = 2 * 60 * 60 * 1000

/**
 * Insert null points so ECharts (`connectNulls: false`) does not draw
 * long diagonals across missing telemetry windows.
 */
export function breakChartTimeGaps(
  points: Array<[string, number | null]>,
  maxGapMs = CHART_TIME_GAP_BREAK_MS
): Array<[string, number | null]> {
  if (points.length === 0) return []
  const out: Array<[string, number | null]> = []
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (index > 0) {
      const previous = points[index - 1]
      const previousMs = new Date(previous[0]).getTime()
      const currentMs = new Date(point[0]).getTime()
      if (
        Number.isFinite(previousMs) &&
        Number.isFinite(currentMs) &&
        currentMs - previousMs > maxGapMs &&
        previous[1] !== null &&
        point[1] !== null
      ) {
        out.push([new Date(previousMs + 1).toISOString(), null])
      }
    }
    out.push(point)
  }
  return out
}

export function findLatestMetric<T extends MetricRow>(rows: T[], aliases: string[]) {
  const normalizedAliases = aliases.map((alias) => normalizedMetricKey(alias))
  const exact = rows.find((row) => normalizedAliases.includes(normalizedMetricKey(row.metricKey)))
  if (exact) return exact
  return rows.find((row) => metricMatches(row.metricKey, aliases))
}

export function formatDuration(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '—'
  if (minutes < 60) return `${Math.round(minutes)} 分钟`
  const hours = Math.floor(minutes / 60)
  const remaining = Math.round(minutes % 60)
  return `${hours} 小时 ${remaining} 分钟`
}

/** Split duration for UI emphasis on numeric parts. */
export function durationEmphasisParts(minutes: number | null | undefined): Array<{ kind: 'num' | 'text'; value: string }> {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return [{ kind: 'text', value: '—' }]
  }
  if (minutes < 60) {
    return [
      { kind: 'num', value: String(Math.round(minutes)) },
      { kind: 'text', value: ' 分钟' }
    ]
  }
  const hours = Math.floor(minutes / 60)
  const remaining = Math.round(minutes % 60)
  return [
    { kind: 'num', value: String(hours) },
    { kind: 'text', value: ' 小时 ' },
    { kind: 'num', value: String(remaining) },
    { kind: 'text', value: ' 分钟' }
  ]
}

/**
 * Offline window under a day heading: same calendar day → clock-only end;
 * cross-day → keep full end timestamp.
 */
export function formatOfflineWindowRange(
  startAt: Date | string,
  endAt: Date | string | null | undefined
): string {
  const startClock = formatClockTime(startAt)
  if (!endAt) return `${startClock} 至 持续中`
  if (formatDateOnly(startAt) === formatDateOnly(endAt)) {
    return `${startClock} 至 ${formatClockTime(endAt)}`
  }
  return `${startClock} 至 ${formatTime(endAt)}`
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

function appTimeZone() {
  return process.env.APP_TIMEZONE || 'Asia/Shanghai'
}

/** Calendar day label in app timezone, e.g. 2026/07/24. */
export function formatDateOnly(value: Date | string | null | undefined) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: appTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(parsed)
}

/** Clock time only in app timezone, e.g. 18:48:13. */
export function formatClockTime(value: Date | string | null | undefined) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: appTimeZone(),
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(parsed)
}

/**
 * Group items by local calendar day.
 * Day headings: newest calendar day first.
 * Within each day: chronological descending (24:00 → 00:00).
 */
export function groupByLocalDate<T>(items: T[], getAt: (item: T) => Date | string) {
  const buckets = new Map<string, T[]>()
  for (const item of items) {
    const key = formatDateOnly(getAt(item))
    if (key === '—') continue
    const list = buckets.get(key)
    if (list) list.push(item)
    else buckets.set(key, [item])
  }
  const toMs = (value: Date | string) => {
    const ms = new Date(value).getTime()
    return Number.isFinite(ms) ? ms : 0
  }
  return Array.from(buckets.entries())
    .map(([date, dayItems]) => ({
      date,
      items: [...dayItems].sort((a, b) => toMs(getAt(b)) - toMs(getAt(a)))
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function getInverterStatus(raw: number | null) {
  const label = resolveStatusLabel('inverter_online_state', raw) ?? '无数据'
  if (raw === 2) return { label, variant: 'online' as const }
  if (raw === 1) return { label, variant: 'offline' as const }
  if (raw === 0) return { label, variant: 'unpaired' as const }
  return { label, variant: 'unknown' as const }
}

/**
 * Card status when firmware omits online_state: prefer power evidence over a misleading「无数据」.
 * Does not invent firmware enum codes — only display fallbacks.
 */
export function resolveInverterCardStatus(params: {
  onlineState: number | null
  paired?: boolean
  power?: number | null
}): { label: string; variant: 'online' | 'offline' | 'unpaired' | 'unknown' } {
  if (params.paired === false) return getInverterStatus(0)
  if (params.onlineState !== null) return getInverterStatus(params.onlineState)
  if (params.power !== null && params.power !== undefined && Number.isFinite(params.power) && params.power > 1) {
    return { label: '有功率上报', variant: 'online' }
  }
  return { label: '状态未上报', variant: 'unknown' }
}

/** Prefer binding identity, then latest telemetry text/number. */
export function displayInverterIdentity(bindingValue: string | null | undefined, metricRow?: MetricRow) {
  const fromBinding = bindingValue?.trim()
  if (fromBinding) return fromBinding
  const text = metricRow?.valueText?.trim()
  if (text) return text
  const numeric = numericValue(metricRow)
  if (numeric !== null) return String(numeric)
  return '—'
}

export function getInverterWorkStatus(raw: number | null) {
  return resolveStatusLabel('inverter_work_state', raw) ?? '—'
}

export function displaySwitch(row: MetricRow | undefined) {
  const value = numericValue(row)
  if (value === 1) return '开启'
  if (value === 0) return '关闭'
  return displayValue(row)
}

/** WiFi RSSI 展示：优先数字，可附带简易格数。 */
export function displayWifiSignal(row: MetricRow | undefined) {
  const value = numericValue(row)
  if (value === null) {
    const text = row?.valueText?.trim()
    return text || '—'
  }
  return String(value)
}

export function wifiSignalBars(raw: number | null): 0 | 1 | 2 | 3 | 4 {
  if (raw === null || !Number.isFinite(raw)) return 0
  // 设备日志常见 0–100 强度；若是负 RSSI（dBm）则换算。
  const score = raw < 0 ? Math.max(0, Math.min(100, 2 * (raw + 100))) : raw
  if (score >= 75) return 4
  if (score >= 50) return 3
  if (score >= 25) return 2
  if (score > 0) return 1
  return 0
}

export type Sub1gStatusTone = 'ok' | 'warn' | 'muted'

/**
 * CT Sub1G 状态：优先固件上报的 sub1g_state；
 * 缺失时按配对/在线微逆推导（不用上报新鲜度——上报间隔可能很长）。
 */
export function deriveCtSub1gStatus(params: {
  rawState: number | null
  hasPairedInverters: boolean
  /** At least one paired inverter is currently online (online_state=2). */
  hasOnlinePairedInverter?: boolean
}): { label: string; tone: Sub1gStatusTone; raw: number | null } {
  if (params.rawState !== null) {
    const label = resolveStatusLabel('sub1g_state', params.rawState) ?? '—'
    const tone: Sub1gStatusTone = params.rawState === 4 ? 'ok' : params.rawState === 3 || params.rawState === 2 ? 'warn' : 'muted'
    return { label, tone, raw: params.rawState }
  }
  if (!params.hasPairedInverters) {
    return { label: '模块未配对设备', tone: 'muted', raw: 1 }
  }
  if (params.hasOnlinePairedInverter) {
    return { label: '通信正常', tone: 'ok', raw: 4 }
  }
  return { label: '配对设备已连接但通信不畅', tone: 'warn', raw: 3 }
}

/**
 * 微逆 Sub1G 状态：仅已配对通道显示。
 * - online_state=2 → 通信正常
 * - online_state=1 → 配对设备已连接但通信不畅（离线）
 * 不根据上报新鲜度判断（设备上报周期可能很长）。
 * 未配对 / 无数据 → null（UI 不渲染）。
 */
export function deriveInverterSub1gStatus(params: {
  onlineState: number | null
  paired?: boolean | null
}): { label: string; tone: Sub1gStatusTone } | null {
  if (params.paired !== true) return null
  if (params.onlineState === 0) return null
  if (params.onlineState === 2) return { label: '通信正常', tone: 'ok' }
  if (params.onlineState === 1) return { label: '配对设备已连接但通信不畅', tone: 'warn' }
  return null
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

/** 详情与卡片统一：遥测 phase_num 优先，binding.phaseNum 兜底。 */
export function resolveInverterPhaseLabel(rows: MetricRow[], bindingPhase?: string | number | null) {
  return displayInverterPhaseLabel(numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.phase)) ?? bindingPhase)
}

export function latestMetricReportedAt(rows: MetricRow[]) {
  let newest: Date | null = null
  for (const row of rows) {
    const at = new Date(row.reportedAt)
    if (Number.isNaN(at.getTime())) continue
    if (!newest || at > newest) newest = at
  }
  return newest
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

/** Fleet CT row: aggregate micro-inverter generation for the site. */
export type CtInverterGenerationStatus = 'generating' | 'idle' | 'offline'

/**
 * 发电：有在线微逆且 CT 侧总发电功率 > 1 W；
 * 未发电：有在线微逆但未检测到有效发电功率；
 * 离线：没有在线微逆。
 */
export function resolveCtInverterGenerationStatus(params: {
  onlineInverterCount: number
  generationPower: number | null
}): CtInverterGenerationStatus {
  if (params.onlineInverterCount <= 0) return 'offline'
  if (params.generationPower !== null && Number.isFinite(params.generationPower) && params.generationPower > 1) {
    return 'generating'
  }
  return 'idle'
}

export function ctInverterGenerationStatusLabel(status: CtInverterGenerationStatus) {
  if (status === 'generating') return '发电'
  if (status === 'idle') return '未发电'
  return '离线'
}
