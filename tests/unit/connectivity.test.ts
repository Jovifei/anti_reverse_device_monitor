import { describe, expect, it } from 'vitest'
import { summarizeInverterOnlineStates } from '@/src/services/telemetry-service'

const start = new Date('2026-07-14T00:00:00.000Z')
const end = new Date('2026-07-14T01:00:00.000Z')

describe('inverter online-state continuity', () => {
  it('uses value 2 as online and value 1 as offline', () => {
    const result = summarizeInverterOnlineStates([{ at: new Date('2026-07-14T00:10:00.000Z'), value: 1 }, { at: new Date('2026-07-14T00:20:00.000Z'), value: 2 }], start, end)
    expect(result.isOnline).toBe(true)
    expect(result.offlineMinutes).toBe(10)
    expect(result.transitions.map((item) => item.state)).toEqual(['offline', 'online'])
    expect(result.currentOnlineMinutes).toBe(40)
  })

  it('keeps a trailing offline interval open until the query end', () => {
    const result = summarizeInverterOnlineStates([{ at: new Date('2026-07-14T00:10:00.000Z'), value: 2 }, { at: new Date('2026-07-14T00:30:00.000Z'), value: 1 }], start, end)
    expect(result.isOnline).toBe(false)
    expect(result.currentOfflineMinutes).toBe(30)
    expect(result.offlineWindows).toHaveLength(1)
    expect(result.currentOnlineMinutes).toBeNull()
  })

  it('uses a baseline state at the window start and ignores repeated states', () => {
    const result = summarizeInverterOnlineStates([
      { at: new Date('2026-07-14T00:20:00.000Z'), value: 1 },
      { at: new Date('2026-07-14T00:40:00.000Z'), value: 2 }
    ], start, end, { at: new Date('2026-07-13T23:50:00.000Z'), value: 1 })
    expect(result.offlineWindows[0]).toMatchObject({ durationMinutes: 40 })
    expect(result.transitions.map((item) => item.state)).toEqual(['offline', 'online'])
  })
})
