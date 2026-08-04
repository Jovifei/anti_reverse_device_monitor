import { describe, expect, it } from 'vitest'
import { decideSoftRefresh, isHeavyMonitorRoute } from '@/src/domain/soft-refresh-policy'

describe('isHeavyMonitorRoute', () => {
  it('treats fleet list as light and device/inverter pages as heavy', () => {
    expect(isHeavyMonitorRoute('/devices')).toBe(false)
    expect(isHeavyMonitorRoute('/devices/')).toBe(false)
    expect(isHeavyMonitorRoute('/devices/GC2001000000038')).toBe(true)
    expect(isHeavyMonitorRoute('/devices/GC2001000000038/inverters/1')).toBe(true)
  })
})

describe('decideSoftRefresh', () => {
  const base = {
    pathname: '/devices',
    fingerprint: 'a',
    lastFingerprint: 'b',
    isPending: false,
    pendingMs: 0,
    nowMs: 100_000,
    lastStartedMs: 0,
    cooldownMs: 30_000,
    pendingStaleMs: 60_000
  }

  it('never stacks another refresh while pending — even after stale', () => {
    expect(decideSoftRefresh({ ...base, isPending: true, pendingMs: 10_000 }).action).toBe('skip')
    expect(decideSoftRefresh({ ...base, isPending: true, pendingMs: 90_000 })).toEqual({
      action: 'clear-stale-pending',
      reason: 'pending-stale'
    })
  })

  it('skips heavy routes and unchanged fingerprints', () => {
    expect(decideSoftRefresh({ ...base, pathname: '/devices/SN1' }).action).toBe('skip')
    expect(decideSoftRefresh({ ...base, fingerprint: 'x', lastFingerprint: 'x' }).action).toBe('skip')
  })

  it('refreshes fleet list only when fingerprint changes', () => {
    expect(decideSoftRefresh({ ...base, fingerprint: 'new', lastFingerprint: 'old' })).toEqual({
      action: 'refresh',
      reason: 'fingerprint-changed'
    })
    expect(decideSoftRefresh({ ...base, fingerprint: 'first', lastFingerprint: null })).toEqual({
      action: 'seed-fingerprint',
      reason: 'first-fingerprint'
    })
  })
})
