import { describe, expect, it } from 'vitest'
import { deviceIdentityLabel, deviceSnPrimaryLabel, deviceSnSecondaryLabel } from '@/src/domain/device-identity'
import { shardTimeRange } from '@/src/adapters/source-db/time-shards'

describe('device-identity', () => {
  it('never surfaces device_id in interactive labels', () => {
    expect(deviceSnPrimaryLabel('GC2001000000252', '69c4e61a495848939ee23928')).toBe('GC2001000000252')
    expect(deviceSnSecondaryLabel('GC2001000000252', '69c4e61a495848939ee23928')).toBeNull()
    expect(deviceIdentityLabel('GC2001000000457', '69c4e417495848939eb67a46')).toBe('GC2001000000457')
  })

  it('keeps placeholder SN visible without revealing device_id', () => {
    expect(deviceSnPrimaryLabel('unknown-69c4e61a', '69c4e61a495848939ee23928')).toBe('unknown-69c4e61a')
    expect(deviceSnSecondaryLabel('unknown-69c4e61a', '69c4e61a495848939ee23928')).toMatch(/正式 SN/)
  })
})

describe('shardTimeRange', () => {
  it('splits a large window into descending shards', () => {
    const from = new Date('2025-08-03T00:00:00.000Z')
    const to = new Date('2025-08-04T00:00:00.000Z')
    const shards = shardTimeRange(from, to, 6 * 60 * 60 * 1000)
    expect(shards.length).toBe(4)
    expect(shards[0].to.toISOString()).toBe(to.toISOString())
    expect(shards.at(-1)?.from.toISOString()).toBe(from.toISOString())
  })
})
