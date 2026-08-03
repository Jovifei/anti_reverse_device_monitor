import { describe, expect, it } from 'vitest'
import { parseDeviceListQuery, parseSnLookup } from '@/src/domain/validation'

describe('SN lookup validation', () => {
  it('allows a unique suffix and rejects unsafe input', () => {
    expect(parseSnLookup('252')).toBe('252')
    expect(() => parseSnLookup("252' OR 1=1")).toThrow()
  })
})

describe('device list query validation', () => {
  it('treats empty search q as absent so status filters can submit', () => {
    expect(parseDeviceListQuery({ q: '', status: 'online' })).toMatchObject({
      q: undefined,
      status: 'online',
      page: 1,
      pageSize: 20
    })
    expect(parseDeviceListQuery({ q: '   ', status: 'reverse' })).toMatchObject({
      q: undefined,
      status: 'reverse'
    })
    expect(parseDeviceListQuery({ q: undefined, status: 'all' })).toMatchObject({
      q: undefined,
      status: 'all'
    })
  })

  it('accepts inv-offline status filter', () => {
    expect(parseDeviceListQuery({ status: 'inv-offline' })).toMatchObject({
      status: 'inv-offline',
      page: 1,
      pageSize: 20
    })
  })
})
