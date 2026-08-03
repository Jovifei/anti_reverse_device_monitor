import { describe, expect, it } from 'vitest'
import { resolveTooltipTimestamp } from '@/src/components/telemetry-chart-tooltip'

describe('resolveTooltipTimestamp', () => {
  it('ignores empty day-night series and uses axisValue / real series time', () => {
    const july30 = Date.parse('2026-07-30T04:00:00.000Z')
    const ms = resolveTooltipTimestamp([
      { seriesName: '昼夜背景', seriesType: 'line', value: [] },
      {
        seriesName: '家庭负载功率',
        seriesType: 'line',
        axisValue: july30,
        value: ['2026-07-30T04:00:00.000Z', 1200]
      }
    ])
    expect(ms).toBe(july30)
  })

  it('parses ISO string timestamps instead of falling back to now', () => {
    const iso = '2026-07-30T10:15:30.000Z'
    const ms = resolveTooltipTimestamp([
      { seriesName: '电网功率', seriesType: 'line', value: [iso, 42] }
    ])
    expect(ms).toBe(Date.parse(iso))
  })

  it('returns null when no usable timestamp exists', () => {
    expect(resolveTooltipTimestamp([{ seriesName: '昼夜背景', seriesType: 'line', value: [] }])).toBeNull()
  })
})
