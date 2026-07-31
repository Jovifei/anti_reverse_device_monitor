import { describe, expect, it } from 'vitest'
import { beijingSunriseSunsetMs, buildBeijingDayNightBands } from '@/src/domain/beijing-sun'

function beijingClock(ms: number) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  return fmt.format(new Date(ms))
}

describe('beijing sunrise/sunset', () => {
  it('matches published 2026-07-24 Beijing times around 05:05 / 19:35', () => {
    const sun = beijingSunriseSunsetMs(2026, 7, 24)
    expect(sun).not.toBeNull()
    expect(beijingClock(sun!.sunriseMs)).toBe('05:05')
    // Public tables vary by ~1–2 minutes (19:35–19:39); NOAA approx lands near 19:36.
    expect(['19:35', '19:36', '19:37']).toContain(beijingClock(sun!.sunsetMs))
  })

  it('builds alternating day/night mark areas for a 24h window', () => {
    const start = Date.UTC(2026, 6, 24, 0 - 8, 0, 0)
    const end = Date.UTC(2026, 6, 25, 0 - 8, 0, 0)
    const bands = buildBeijingDayNightBands(start, end)
    expect(bands.markAreaData.length).toBeGreaterThanOrEqual(2)
    expect(bands.sunriseLines.length).toBe(1)
    expect(bands.sunsetLines.length).toBe(1)
  })
})
