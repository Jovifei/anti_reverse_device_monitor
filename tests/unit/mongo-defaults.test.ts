import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CT_PRODUCT_ID,
  defaultDeviceLogCollection,
  resolveMongoProductId,
  resolveMongoCollectionName
} from '@/src/adapters/source-db/mongo-defaults'

describe('mongo-defaults', () => {
  it('uses the fixed anti-reverse CT product id', () => {
    expect(DEFAULT_CT_PRODUCT_ID).toBe('689adc659f04ec32f7642fbb')
    expect(defaultDeviceLogCollection()).toBe('device_log_689adc659f04ec32f7642fbb')
  })

  it('falls back to default product and collection when env values are empty', () => {
    expect(resolveMongoProductId(undefined)).toBe(DEFAULT_CT_PRODUCT_ID)
    expect(resolveMongoProductId('')).toBe(DEFAULT_CT_PRODUCT_ID)
    expect(resolveMongoCollectionName({ collection: undefined, productId: undefined })).toBe(
      'device_log_689adc659f04ec32f7642fbb'
    )
    expect(resolveMongoCollectionName({ collection: 'device_log_custom', productId: undefined })).toBe(
      'device_log_custom'
    )
  })
})
