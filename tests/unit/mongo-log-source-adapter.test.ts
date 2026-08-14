import { describe, expect, it } from 'vitest'
import { MongoLogSourceAdapter } from '@/src/adapters/source-db/mongo-log-source-adapter'
import type { MongoFieldMapping } from '@/src/adapters/source-db/mongo-field-mapping'

const mapping: MongoFieldMapping = {
  version: 1,
  timezone: 'UTC',
  fields: { '2_4': { metricKey: 'test_metric', siid: '2', piid: '4', inverterIndex: null } }
}

function createAdapter() {
  return new MongoLogSourceAdapter({
    enabled: true,
    sourceName: 'test-source',
    queryTimeoutMs: 1_000,
    uri: 'mongodb://localhost:27017',
    database: 'test',
    productId: 'product',
    collection: 'device_log_product',
    directConnection: true,
    authMechanism: 'SCRAM-SHA-1'
  })
}

describe('MongoLogSourceAdapter fair per-device pages', () => {
  it('uses a per-device aggregation cap and reports a capped device as hasMore', async () => {
    const calls: unknown[] = []
    const collection = {
      aggregate(pipeline: unknown[], options: unknown) {
        calls.push({ pipeline, options })
        return {
          async toArray() {
            return [
              { _id: 'doc-1', device_id: 'd1', time: 1_000, data: { '2_4': 1 }, __deviceCapped: true },
              { _id: 'doc-2', device_id: 'd2', time: 999, data: { '2_4': 2 }, __deviceCapped: false }
            ]
          }
        }
      }
    }
    const adapter = createAdapter()
    const queryWindow = (adapter as unknown as {
      queryWindow: (params: Record<string, unknown>) => Promise<{ records: unknown[]; hasMore: boolean }>
    }).queryWindow.bind(adapter)

    const result = await queryWindow({
      collection,
      deviceIds: ['d1', 'd2'],
      from: new Date(0),
      to: new Date(2_000_000),
      limit: 10,
      snByDeviceId: new Map([
        ['d1', 'SN-1'],
        ['d2', 'SN-2']
      ]),
      mapping
    })

    const pipeline = (calls[0] as { pipeline: Array<Record<string, Record<string, unknown>>> }).pipeline
    expect(pipeline.some((stage) => stage.$group)).toBe(true)
    expect(pipeline.some((stage) => stage.$project?.docs && JSON.stringify(stage.$project.docs).includes('30'))).toBe(true)
    expect(result.records).toHaveLength(2)
    expect(result.hasMore).toBe(true)
  })

  it('applies the same fair cap to WiFi event documents', async () => {
    const calls: unknown[] = []
    const collection = {
      aggregate(pipeline: unknown[], options: unknown) {
        calls.push({ pipeline, options })
        return {
          async toArray() {
            return [
              {
                _id: 'wifi-1',
                deviceId: 'd1',
                sn: 'SN-1',
                et: 'DATA',
                en: 'P_0_0',
                ec: 80,
                t: new Date('2026-08-14T00:00:00.000Z'),
                __deviceCapped: true
              }
            ]
          }
        }
      }
    }
    const adapter = createAdapter()
    const queryWifiWindow = (adapter as unknown as {
      queryIotWifiWindow: (params: Record<string, unknown>) => Promise<{ records: unknown[]; hasMore: boolean }>
    }).queryIotWifiWindow.bind(adapter)

    const result = await queryWifiWindow({
      collection,
      deviceIds: ['d1'],
      from: new Date('2026-08-13T00:00:00.000Z'),
      to: new Date('2026-08-14T01:00:00.000Z'),
      limit: 10,
      snByDeviceId: new Map([['d1', 'SN-1']]),
      mapping
    })

    const pipeline = (calls[0] as { pipeline: Array<Record<string, Record<string, unknown>>> }).pipeline
    expect(pipeline.some((stage) => stage.$group)).toBe(true)
    expect(result.records).toHaveLength(1)
    expect(result.hasMore).toBe(true)
  })
})
