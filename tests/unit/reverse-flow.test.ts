import { describe, expect, it } from 'vitest'
import { isReverseFlowPower } from '@/src/domain/monitoring'

describe('three-phase reverse-flow detection', () => {
  it.each(['A', 'B', 'C'])('marks %s phase negative active power as reverse flow', () => {
    expect(isReverseFlowPower({ metricKey: 'active_power', valueNumber: -0.01, valueText: null, reportedAt: new Date() })).toBe(true)
  })

  it('does not treat zero, positive, or missing values as reverse flow', () => {
    expect(isReverseFlowPower({ metricKey: 'active_power', valueNumber: 0, valueText: null, reportedAt: new Date() })).toBe(false)
    expect(isReverseFlowPower({ metricKey: 'active_power', valueNumber: 1, valueText: null, reportedAt: new Date() })).toBe(false)
    expect(isReverseFlowPower(undefined)).toBe(false)
  })
})
