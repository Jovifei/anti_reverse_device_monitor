import { describe, expect, it } from 'vitest'
import { getRetentionDays } from '@/scripts/cleanup-retention'

describe('retention configuration', () => {
  it('defaults to seven days and refuses non-positive values', () => {
    expect(getRetentionDays(undefined)).toBe(7)
    expect(getRetentionDays('0')).toBe(1)
    expect(getRetentionDays('not-a-number')).toBe(7)
  })
})
