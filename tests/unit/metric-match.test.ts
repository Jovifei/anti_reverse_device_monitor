import { describe, expect, it } from 'vitest'
import { findLatestMetric, metricMatches } from '@/src/domain/monitoring'
import { resolveStatusLabel } from '@/src/domain/dictionaries'

describe('metricMatches / findLatestMetric for ct runtime state', () => {
  it('does not let limit_state match the short alias state', () => {
    expect(metricMatches('limit_state', ['ct_state', 'state'])).toBe(false)
    expect(metricMatches('sub1g_state', ['ct_state', 'state'])).toBe(false)
    expect(metricMatches('online_state', ['ct_state', 'state'])).toBe(false)
    expect(metricMatches('work_state', ['ct_state', 'state'])).toBe(false)
    expect(metricMatches('ct_state', ['ct_state', 'state'])).toBe(true)
    expect(metricMatches('state', ['ct_state', 'state'])).toBe(true)
    expect(metricMatches('ct.state', ['ct_state', 'state'])).toBe(true)
  })

  it('prefers real ct_state over other *state metrics when resolving 正常运行', () => {
    const rows = [
      { metricKey: 'limit_state', valueNumber: 1, valueText: null as string | null },
      { metricKey: 'sub1g_state', valueNumber: 1, valueText: null },
      { metricKey: 'ct_state', valueNumber: 4, valueText: null },
      { metricKey: 'state', valueNumber: 4, valueText: null }
    ]
    const latest = findLatestMetric(rows, ['ct_state', 'state'])
    expect(latest?.metricKey).toBe('ct_state')
    expect(resolveStatusLabel('ct_state', latest?.valueNumber)).toBe('正常运行')
  })

  it('falls back to exact state when ct_state is absent', () => {
    const rows = [
      { metricKey: 'limit_state', valueNumber: 1, valueText: null as string | null },
      { metricKey: 'state', valueNumber: 4, valueText: null }
    ]
    const latest = findLatestMetric(rows, ['ct_state', 'state'])
    expect(latest?.metricKey).toBe('state')
    expect(resolveStatusLabel('ct_state', latest?.valueNumber)).toBe('正常运行')
  })
})
