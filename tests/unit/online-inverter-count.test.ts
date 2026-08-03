import { describe, expect, it } from 'vitest'
import { formatOnlineInverterCountHtml, normalizeInverterCounts } from '@/src/domain/online-inverter-count'

describe('online inverter count display', () => {
  it('marks all-online when online equals total', () => {
    expect(normalizeInverterCounts(6, 6)).toEqual({ online: 6, total: 6, offline: 0, allOnline: true })
    expect(normalizeInverterCounts(5, 6).allOnline).toBe(false)
  })

  it('renders 6/6 both green when complete', () => {
    const html = formatOnlineInverterCountHtml(6, 6)
    expect(html).toContain('>6</span><span class="online-inverter-count-sep">/</span><span class="online-inverter-count-total is-ok">6<')
    expect(html).not.toContain('is-alert')
  })

  it('renders 5/6 with green online and red total when incomplete', () => {
    const html = formatOnlineInverterCountHtml(5, 6)
    expect(html).toContain('online-inverter-count-online is-ok">5<')
    expect(html).toContain('online-inverter-count-total is-alert">6<')
  })
})
