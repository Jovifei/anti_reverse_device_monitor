import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HEAVY_FULL_REFRESH_MIN_MS,
  decideSoftRefresh,
  isHeavyMonitorRoute
} from '@/src/domain/soft-refresh-policy'

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
    pendingStaleMs: 60_000,
    dataStale: false,
    lastHeavyFullRefreshMs: 0,
    heavyFullRefreshMinMs: DEFAULT_HEAVY_FULL_REFRESH_MIN_MS
  }

  it('never stacks another refresh while pending — even after stale', () => {
    expect(decideSoftRefresh({ ...base, isPending: true, pendingMs: 10_000 }).action).toBe('skip')
    expect(decideSoftRefresh({ ...base, isPending: true, pendingMs: 90_000 })).toEqual({
      action: 'clear-stale-pending',
      reason: 'pending-stale'
    })
  })

  it('skips unchanged fingerprints on fleet', () => {
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

  it('notifies stale on heavy route when fingerprint changes but gate is closed', () => {
    const nowMs = 100_000
    expect(
      decideSoftRefresh({
        ...base,
        pathname: '/devices/SN1',
        fingerprint: 'new',
        lastFingerprint: 'old',
        nowMs,
        lastHeavyFullRefreshMs: nowMs - 60_000
      })
    ).toEqual({ action: 'notify-stale', reason: 'heavy-fingerprint-changed' })
  })

  it('does not auto-refresh heavy route on first fingerprint change when never refreshed', () => {
    const nowMs = 400_000
    expect(
      decideSoftRefresh({
        ...base,
        pathname: '/devices/SN1',
        fingerprint: 'new',
        lastFingerprint: 'old',
        nowMs,
        lastHeavyFullRefreshMs: 0
      })
    ).toEqual({ action: 'notify-stale', reason: 'heavy-fingerprint-changed' })
  })

  it('refreshes heavy route when fingerprint changes and gate is open', () => {
    const nowMs = 400_000
    expect(
      decideSoftRefresh({
        ...base,
        pathname: '/devices/SN1',
        fingerprint: 'new',
        lastFingerprint: 'old',
        nowMs,
        lastHeavyFullRefreshMs: nowMs - DEFAULT_HEAVY_FULL_REFRESH_MIN_MS
      })
    ).toEqual({ action: 'refresh', reason: 'heavy-fingerprint-gated' })
  })

  it('refreshes heavy route when already stale and gate opens later', () => {
    const nowMs = 400_000
    expect(
      decideSoftRefresh({
        ...base,
        pathname: '/devices/SN1/inverters/1',
        fingerprint: 'same',
        lastFingerprint: 'same',
        dataStale: true,
        nowMs,
        lastHeavyFullRefreshMs: nowMs - DEFAULT_HEAVY_FULL_REFRESH_MIN_MS
      })
    ).toEqual({ action: 'refresh', reason: 'heavy-stale-gated' })
  })

  it('waits on heavy stale when gate still closed', () => {
    const nowMs = 100_000
    expect(
      decideSoftRefresh({
        ...base,
        pathname: '/devices/SN1',
        fingerprint: 'same',
        lastFingerprint: 'same',
        dataStale: true,
        nowMs,
        lastHeavyFullRefreshMs: nowMs - 60_000
      })
    ).toEqual({ action: 'skip', reason: 'heavy-waiting-gate' })
  })
})
