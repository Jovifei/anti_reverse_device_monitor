import { describe, expect, it } from 'vitest'
import {
  buildReverseFlowIntervals,
  summarizeDeviceSustainedReverse,
  summarizeSustainedReverseFlow
} from '@/src/domain/sustained-reverse-flow'

describe('sustained reverse flow (>40 minutes)', () => {
  const windowEnd = new Date('2026-08-04T12:00:00.000Z')

  it('detects a closed reverse interval longer than 40 minutes', () => {
    const intervals = buildReverseFlowIntervals(
      [
        { reportedAt: new Date('2026-08-04T10:00:00.000Z'), valueNumber: -100 },
        { reportedAt: new Date('2026-08-04T10:20:00.000Z'), valueNumber: -80 },
        { reportedAt: new Date('2026-08-04T10:45:00.000Z'), valueNumber: 10 }
      ],
      'A',
      windowEnd
    )
    expect(intervals).toHaveLength(1)
    expect(intervals[0]?.durationMinutes).toBe(45)
    expect(summarizeSustainedReverseFlow(intervals).hasSustainedReverse).toBe(true)
  })

  it('ignores reverse bursts shorter than 40 minutes', () => {
    const intervals = buildReverseFlowIntervals(
      [
        { reportedAt: new Date('2026-08-04T10:00:00.000Z'), valueNumber: -50 },
        { reportedAt: new Date('2026-08-04T10:15:00.000Z'), valueNumber: 5 }
      ],
      'B',
      windowEnd
    )
    expect(summarizeSustainedReverseFlow(intervals).hasSustainedReverse).toBe(false)
  })

  it('summarizes per-device rows across phases', () => {
    const summary = summarizeDeviceSustainedReverse(
      [
        { metricKey: 'active_power_ct1', valueNumber: -1, reportedAt: new Date('2026-08-04T09:00:00.000Z') },
        { metricKey: 'active_power_ct1', valueNumber: 1, reportedAt: new Date('2026-08-04T09:50:00.000Z') },
        { metricKey: 'active_power_ct3', valueNumber: -2, reportedAt: new Date('2026-08-04T11:00:00.000Z') },
        { metricKey: 'active_power_ct3', valueNumber: 2, reportedAt: new Date('2026-08-04T11:10:00.000Z') }
      ],
      windowEnd
    )
    expect(summary).toEqual({
      hasSustainedReverse: true,
      maxDurationMinutes: 50,
      phases: ['A']
    })
  })
})
