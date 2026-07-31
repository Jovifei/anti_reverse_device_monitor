import { describe, expect, it } from 'vitest'
import { expandDeviceLogDocument, parseDataKey } from '@/src/adapters/source-db/expand-device-log'
import type { MongoFieldMapping } from '@/src/adapters/source-db/mongo-field-mapping'

const mapping: MongoFieldMapping = {
  version: 1,
  timezone: 'Asia/Shanghai',
  fields: {
    '2_4': { metricKey: 'inverter_total_power', siid: '2', piid: '4', inverterIndex: null },
    '2_15': { metricKey: 'grid_power', siid: '2', piid: '15', inverterIndex: null },
    '2_24': { metricKey: 'pv1_power', siid: '2', piid: '24', inverterIndex: null }
  }
}

describe('expand-device-log', () => {
  it('parses siid_piid keys', () => {
    expect(parseDataKey('2_15')).toEqual({ siid: '2', piid: '15' })
    expect(parseDataKey('bad')).toBeNull()
  })

  it('expands mapped data fields into telemetry rows', () => {
    const records = expandDeviceLogDocument({
      deviceSn: 'GC2001000000457',
      mapping,
      document: {
        _id: 'doc-1',
        device_id: '6873af54827a07be5ffe7dfe',
        time: 1754236800,
        data: {
          '2_4': 1200,
          '2_15': -30,
          '99_9': 1
        }
      }
    })

    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({
      sourceRecordId: 'doc-1:2_4',
      deviceSn: 'GC2001000000457',
      sourceDeviceId: '6873af54827a07be5ffe7dfe',
      metricKey: 'inverter_total_power',
      value: 1200
    })
    expect(records[0].reportedAt.toISOString()).toBe(new Date(1754236800 * 1000).toISOString())
    expect(records.some((row) => row.metricKey === 'grid_power' && row.value === -30)).toBe(true)
  })

  it('auto-maps inverter SIID 4–11 when not listed in mapping file', () => {
    const records = expandDeviceLogDocument({
      deviceSn: 'GC2001000000252',
      mapping,
      document: {
        _id: 'doc-inv',
        time: 1754236800,
        data: {
          '4_1': 2,
          '4_7': 850.5,
          '5_26': 120,
          '2_4': 1
        }
      }
    })

    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metricKey: 'online_state', inverterIndex: 1, value: 2, siid: '4', piid: '1' }),
        expect.objectContaining({ metricKey: 'inverter_power', inverterIndex: 1, value: 850.5 }),
        expect.objectContaining({ metricKey: 'pv1_power', inverterIndex: 2, value: 120 }),
        expect.objectContaining({ metricKey: 'inverter_total_power', inverterIndex: null, value: 1 })
      ])
    )
  })

  it('returns empty when time or data is missing', () => {
    expect(expandDeviceLogDocument({ deviceSn: 'x', mapping, document: { data: { '2_4': 1 } } })).toEqual([])
    expect(expandDeviceLogDocument({ deviceSn: 'x', mapping, document: { time: 1, data: null } })).toEqual([])
  })
})
