import { describe, expect, it } from 'vitest'
import { parseSnLookup } from '@/src/domain/validation'

describe('SN lookup validation', () => {
  it('allows a unique suffix and rejects unsafe input', () => {
    expect(parseSnLookup('252')).toBe('252')
    expect(() => parseSnLookup("252' OR 1=1")).toThrow()
  })
})
