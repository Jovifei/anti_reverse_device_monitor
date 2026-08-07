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

  it('defaults status to active (近7天活跃设备) when absent', () => {
    expect(parseDeviceListQuery({})).toMatchObject({
      status: 'active',
      page: 1,
      pageSize: 20
    })
    expect(parseDeviceListQuery({ q: 'GC200' })).toMatchObject({
      q: 'GC200',
      status: 'active'
    })
  })

  it('accepts explicit active status filter', () => {
    expect(parseDeviceListQuery({ status: 'active' })).toMatchObject({
      status: 'active'
    })
  })

  it('accepts inv-offline status filter', () => {
    expect(parseDeviceListQuery({ status: 'inv-offline' })).toMatchObject({
      status: 'inv-offline',
      page: 1,
      pageSize: 20
    })
  })

  it('accepts sustained-reverse status filter', () => {
    expect(parseDeviceListQuery({ status: 'sustained-reverse' })).toMatchObject({
      status: 'sustained-reverse'
    })
  })

  it('accepts inv-fault status filter', () => {
    expect(parseDeviceListQuery({ status: 'inv-fault' })).toMatchObject({
      status: 'inv-fault'
    })
  })

  it('accepts newly-online status filter (近7日新上线/增量在线)', () => {
    expect(parseDeviceListQuery({ status: 'newly-online' })).toMatchObject({
      status: 'newly-online',
      page: 1,
      pageSize: 20
    })
    expect(parseDeviceListQuery({ q: '', status: 'newly-online' })).toMatchObject({
      q: undefined,
      status: 'newly-online'
    })
  })

  it('rejects unknown status values', () => {
    expect(() => parseDeviceListQuery({ status: 'newly-offline' })).toThrow()
  })
})
