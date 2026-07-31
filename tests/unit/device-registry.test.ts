import { describe, expect, it } from 'vitest'
import {
  mergeDeviceIdsIntoRegistry,
  placeholderSnFromDeviceId,
  resolveDeviceSn,
  collectionForEntry
} from '@/src/adapters/source-db/device-registry'

describe('device-registry', () => {
  it('builds a stable placeholder SN from device_id', () => {
    expect(placeholderSnFromDeviceId('6873af54827a07be5ffe7dfe')).toBe('unknown-6873af54')
  })

  it('prefers registry SN when present', () => {
    expect(resolveDeviceSn({ sn: 'GC2001000000457', device_id: '6873af54827a07be5ffe7dfe' })).toBe('GC2001000000457')
    expect(resolveDeviceSn({ device_id: '6873af54827a07be5ffe7dfe' })).toBe('unknown-6873af54')
  })

  it('derives collection from product_id', () => {
    expect(collectionForEntry({ device_id: 'abc', product_id: '669f128f59b7727830b3b5fc' })).toBe(
      'device_log_669f128f59b7727830b3b5fc'
    )
  })

  it('merges newly discovered device ids without dropping mapped SN', () => {
    const merged = mergeDeviceIdsIntoRegistry(
      {
        version: 1,
        devices: [{ sn: 'GC1', device_id: 'id-1', product_id: 'prod' }]
      },
      ['id-1', 'id-2'],
      { product_id: 'prod' }
    )
    expect(merged.devices).toHaveLength(2)
    expect(merged.devices.find((item) => item.device_id === 'id-1')?.sn).toBe('GC1')
    expect(merged.devices.find((item) => item.device_id === 'id-2')?.product_id).toBe('prod')
  })
})
