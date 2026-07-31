/** 北京天安门附近坐标；中国无夏令时，固定 UTC+8。 */
export const BEIJING_LAT = 39.9042
export const BEIJING_LON = 116.4074
export const BEIJING_TZ_OFFSET_HOURS = 8

/** 默认开启昼夜背景的曲线单位（功率/电量/温度/丢包率/电网质量）。 */
export const DAY_NIGHT_CHART_UNITS = new Set(['W', 'kWh', '°C', '%', 'V', 'Hz'])

export function seriesNeedsDayNightBands(units: Array<string | undefined | null>): boolean {
  return units.some((unit) => unit != null && DAY_NIGHT_CHART_UNITS.has(unit))
}

const DAY_MS = 86_400_000

function radians(deg: number) {
  return (deg * Math.PI) / 180
}

function degrees(rad: number) {
  return (rad * 180) / Math.PI
}

function beijingParts(ms: number) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  const map: Record<string, string> = {}
  for (const part of fmt.formatToParts(new Date(ms))) {
    if (part.type !== 'literal') map[part.type] = part.value
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day)
  }
}

/**
 * NOAA 近似算法：给定北京日历日，返回当日日出/日落的 UTC 毫秒时间戳。
 * 与公开表对照：2026-07-24 约 05:05 / 19:35（北京时间）。
 */
export function beijingSunriseSunsetMs(year: number, month: number, day: number) {
  const lat = BEIJING_LAT
  const lng = BEIJING_LON
  const timezone = BEIJING_TZ_OFFSET_HOURS

  const n1 = Math.floor((275 * month) / 9)
  const n2 = Math.floor((month + 9) / 12)
  const n3 = 1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3)
  const n = n1 - n2 * n3 + day - 30
  const lngHour = lng / 15

  const calc = (isSunrise: boolean) => {
    const t = isSunrise ? n + (6 - lngHour) / 24 : n + (18 - lngHour) / 24
    const mAnom = 0.9856 * t - 3.289
    let L = mAnom + 1.916 * Math.sin(radians(mAnom)) + 0.02 * Math.sin(radians(2 * mAnom)) + 282.634
    L = ((L % 360) + 360) % 360

    let ra = degrees(Math.atan(0.91764 * Math.tan(radians(L))))
    ra = ((ra % 360) + 360) % 360
    const lQuad = Math.floor(L / 90) * 90
    const raQuad = Math.floor(ra / 90) * 90
    ra = (ra + (lQuad - raQuad)) / 15

    const sinDec = 0.39782 * Math.sin(radians(L))
    const cosDec = Math.cos(Math.asin(sinDec))
    const cosH =
      (Math.cos(radians(90.833)) - sinDec * Math.sin(radians(lat))) / (cosDec * Math.cos(radians(lat)))
    if (cosH > 1 || cosH < -1) return null

    const H = isSunrise ? (360 - degrees(Math.acos(cosH))) / 15 : degrees(Math.acos(cosH)) / 15
    const T = H + ra - 0.06571 * t - 6.622
    let ut = ((T - lngHour) % 24 + 24) % 24
    let local = ut + timezone
    let dayOffset = 0
    if (local >= 24) {
      local -= 24
      dayOffset = 1
    } else if (local < 0) {
      local += 24
      dayOffset = -1
    }

    const hours = Math.floor(local)
    const minutesFloat = (local - hours) * 60
    const minutes = Math.floor(minutesFloat)
    const seconds = Math.round((minutesFloat - minutes) * 60)
    return Date.UTC(year, month - 1, day + dayOffset, hours - timezone, minutes, seconds)
  }

  const sunriseMs = calc(true)
  const sunsetMs = calc(false)
  if (sunriseMs === null || sunsetMs === null) return null
  return { sunriseMs, sunsetMs }
}

export type DayNightMarkArea = [{ xAxis: number; itemStyle: { color: string } }, { xAxis: number }]

export type DayNightBandPlan = {
  markAreaData: DayNightMarkArea[]
  sunriseLines: Array<{ xAxis: number; name: string }>
  sunsetLines: Array<{ xAxis: number; name: string }>
}

export const DAY_BAND_COLOR = 'rgba(255, 236, 179, 0.38)'
export const NIGHT_BAND_COLOR = 'rgba(148, 163, 184, 0.32)'

function clipBand(a: number, b: number, start: number, end: number): [number, number] | null {
  const left = Math.max(a, start)
  const right = Math.min(b, end)
  if (!(right > left)) return null
  return [left, right]
}

/** 按北京日出日落，为时间轴生成昼/夜背景区间。 */
export function buildBeijingDayNightBands(rangeStartMs: number, rangeEndMs: number): DayNightBandPlan {
  if (!(rangeEndMs > rangeStartMs)) {
    return { markAreaData: [], sunriseLines: [], sunsetLines: [] }
  }

  const markAreaData: DayNightMarkArea[] = []
  const sunriseLines: Array<{ xAxis: number; name: string }> = []
  const sunsetLines: Array<{ xAxis: number; name: string }> = []

  const first = beijingParts(rangeStartMs - DAY_MS)
  const last = beijingParts(rangeEndMs + DAY_MS)
  let cursor = Date.UTC(first.year, first.month - 1, first.day, 12 - BEIJING_TZ_OFFSET_HOURS)
  const endCursor = Date.UTC(last.year, last.month - 1, last.day, 12 - BEIJING_TZ_OFFSET_HOURS)

  let previousSunset: number | null = null

  while (cursor <= endCursor) {
    const parts = beijingParts(cursor)
    const sun = beijingSunriseSunsetMs(parts.year, parts.month, parts.day)
    if (!sun) {
      cursor += DAY_MS
      continue
    }

    if (previousSunset !== null) {
      const night = clipBand(previousSunset, sun.sunriseMs, rangeStartMs, rangeEndMs)
      if (night) {
        markAreaData.push([{ xAxis: night[0], itemStyle: { color: NIGHT_BAND_COLOR } }, { xAxis: night[1] }])
      }
    } else {
      const night = clipBand(rangeStartMs, sun.sunriseMs, rangeStartMs, rangeEndMs)
      if (night) {
        markAreaData.push([{ xAxis: night[0], itemStyle: { color: NIGHT_BAND_COLOR } }, { xAxis: night[1] }])
      }
    }

    const day = clipBand(sun.sunriseMs, sun.sunsetMs, rangeStartMs, rangeEndMs)
    if (day) {
      markAreaData.push([{ xAxis: day[0], itemStyle: { color: DAY_BAND_COLOR } }, { xAxis: day[1] }])
    }

    if (sun.sunriseMs >= rangeStartMs && sun.sunriseMs <= rangeEndMs) {
      sunriseLines.push({ xAxis: sun.sunriseMs, name: '日出' })
    }
    if (sun.sunsetMs >= rangeStartMs && sun.sunsetMs <= rangeEndMs) {
      sunsetLines.push({ xAxis: sun.sunsetMs, name: '日落' })
    }

    previousSunset = sun.sunsetMs
    cursor += DAY_MS
  }

  if (previousSunset !== null) {
    const night = clipBand(previousSunset, rangeEndMs, rangeStartMs, rangeEndMs)
    if (night) {
      markAreaData.push([{ xAxis: night[0], itemStyle: { color: NIGHT_BAND_COLOR } }, { xAxis: night[1] }])
    }
  }

  return { markAreaData, sunriseLines, sunsetLines }
}

export function visibleSeriesTimeRange(pointsLists: Array<Array<[string, number | null]>>) {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const points of pointsLists) {
    for (const [at] of points) {
      const t = new Date(at).getTime()
      if (!Number.isFinite(t)) continue
      if (t < min) min = t
      if (t > max) max = t
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  return { startMs: min, endMs: max }
}
