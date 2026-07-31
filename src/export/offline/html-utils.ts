import type { ChartPoint, OfflineChartSeries } from '@/src/export/offline/types'
import { EMPTY } from '@/src/export/offline/types'

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function safeFileToken(value: string): string {
  const cleaned = value.trim().replace(/[^A-Za-z0-9_-]+/g, '-')
  const collapsed = cleaned.replace(/-+/g, '-').replace(/^-|-$/g, '')
  return collapsed || 'device'
}

export function displayOrEmpty(value: string | null | undefined): string {
  if (value === null || value === undefined) return EMPTY
  const trimmed = String(value).trim()
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null' || trimmed === 'NaN') return EMPTY
  return trimmed
}

function calendarDayKey(iso: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.APP_TIMEZONE || 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(iso))
}

export function disconnectDailyResetPoints(points: Array<[string, number]>): ChartPoint[] {
  const result: ChartPoint[] = []
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (index > 0) {
      const previous = points[index - 1]
      const sameDay = calendarDayKey(point[0]) === calendarDayKey(previous[0])
      if (!sameDay && point[1] < previous[1]) {
        result.push([point[0], null])
      }
    }
    result.push([point[0], point[1]])
  }
  return result
}

export function withDailyResetSeries(series: OfflineChartSeries): OfflineChartSeries {
  if (!series.dailyReset) return series
  return {
    ...series,
    points: disconnectDailyResetPoints(
      series.points.filter((point): point is [string, number] => point[1] !== null && Number.isFinite(point[1]))
    )
  }
}

export function mapSourceLabel(sourceName: string | null | undefined, override?: string): string {
  if (override) return override
  const name = (sourceName || '').toLowerCase()
  if (!name) return '本地数据库'
  if (name.includes('demo') || name.includes('ui-demo')) return 'Demo SQLite'
  if (name.includes('excel')) return 'Excel 导入'
  if (name.includes('company') || name.includes('source') || name.includes('sync')) return '公司数据库同步'
  return '本地数据库'
}
