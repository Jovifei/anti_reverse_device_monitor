export function toEpochMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? ms : Number.NaN
  }
  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value)
    if (Number.isFinite(asNumber)) return asNumber
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return Number.NaN
}

export type TooltipParam = {
  seriesName?: string
  seriesType?: string
  axisValue?: number | string
  value?: [number | string, number | null] | number | string | unknown[]
}

export function isTelemetryTooltipSeries(item: TooltipParam) {
  const name = item.seriesName ?? ''
  return item.seriesType === 'line' && name !== '昼夜背景' && !name.includes('·负')
}

/**
 * Prefer axisValue / real series timestamps.
 * Never fall back to Date.now() — that showed "today" when hovering historical points
 * (empty day-night series was list[0] and Number([])/undefined became NaN).
 */
export function resolveTooltipTimestamp(params: unknown): number | null {
  const list = (Array.isArray(params) ? params : [params]) as TooltipParam[]
  if (!list.length) return null

  const candidates: unknown[] = []
  for (const item of list) {
    if (item.axisValue !== undefined && item.axisValue !== null) candidates.push(item.axisValue)
  }
  for (const item of list) {
    if (!isTelemetryTooltipSeries(item)) continue
    if (Array.isArray(item.value)) candidates.push(item.value[0])
  }
  for (const item of list) {
    if (Array.isArray(item.value)) candidates.push(item.value[0])
  }

  for (const candidate of candidates) {
    const ms = toEpochMs(candidate)
    if (Number.isFinite(ms)) return ms
  }
  return null
}
