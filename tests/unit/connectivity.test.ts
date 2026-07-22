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
  })

  it('keeps a trailing offline interval open until the query end', () => {
    const result = summarizeInverterOnlineStates([{ at: new Date('2026-07-14T00:10:00.000Z'), value: 2 }, { at: new Date('2026-07-14T00:30:00.000Z'), value: 1 }], start, end)
    expect(result.isOnline).toBe(false)
    expect(result.currentOfflineMinutes).toBe(30)
    expect(result.offlineWindows).toHaveLength(1)
  })
})
