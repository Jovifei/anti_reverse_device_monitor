import { describe, expect, it } from 'vitest'
import { fleetLastKnownClass, fleetLastKnownTitle } from '@/src/domain/fleet-last-known'

describe('fleetLastKnown', () => {
  it('marks cells only when CT is offline', () => {
    expect(fleetLastKnownClass(true)).toBe('')
    expect(fleetLastKnownClass(false)).toBe('is-last-known')
  })

  it('builds last-known tooltip without rewriting values', () => {
    expect(fleetLastKnownTitle(true)).toBeUndefined()
    expect(fleetLastKnownTitle(true, '在线但是未发电')).toBe('在线但是未发电')
    expect(fleetLastKnownTitle(false)).toBe('最后已知值')
    expect(fleetLastKnownTitle(false, '在线但是未发电')).toBe('最后已知值 · 在线但是未发电')
  })
})
