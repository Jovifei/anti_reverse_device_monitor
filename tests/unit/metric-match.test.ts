import { describe, expect, it } from 'vitest'
import { findLatestMetric, metricMatches } from '@/src/domain/monitoring'
import { resolveStatusLabel } from '@/src/domain/dictionaries'

const metricRow = (metricKey: string, valueNumber: number, reportedAt = new Date('2026-07-31T00:00:00.000Z')) => ({
  metricKey,
  valueNumber,
  valueText: null as string | null,
  reportedAt
})

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
      metricRow('limit_state', 1),
      metricRow('sub1g_state', 1),
      metricRow('ct_state', 4),
      metricRow('state', 4)
    ]
    const latest = findLatestMetric(rows, ['ct_state', 'state'])
    expect(latest?.metricKey).toBe('ct_state')
    expect(resolveStatusLabel('ct_state', latest?.valueNumber)).toBe('正常运行')
  })

  it('falls back to exact state when ct_state is absent', () => {
    const rows = [
      metricRow('limit_state', 1),
      metricRow('state', 4)
    ]
    const latest = findLatestMetric(rows, ['ct_state', 'state'])
    expect(latest?.metricKey).toBe('state')
    expect(resolveStatusLabel('ct_state', latest?.valueNumber)).toBe('正常运行')
  })
})
