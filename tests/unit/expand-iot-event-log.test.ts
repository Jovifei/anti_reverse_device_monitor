import { describe, expect, it } from 'vitest'
import { expandIotEventLogDocument, parseIotEventName } from '@/src/adapters/source-db/expand-iot-event-log'
import type { MongoFieldMapping } from '@/src/adapters/source-db/mongo-field-mapping'

const mapping: MongoFieldMapping = {
  version: 1,
  timezone: 'Asia/Shanghai',
  fields: {
    '0_0': { metricKey: 'wifi_signal_strength', siid: '0', piid: '0', inverterIndex: null }
  }
}

describe('expand-iot-event-log', () => {
  it('parses P_siid_piid event names', () => {
    expect(parseIotEventName('P_0_0')).toEqual({ siid: '0', piid: '0' })
    expect(parseIotEventName('P_2_26')).toEqual({ siid: '2', piid: '26' })
    expect(parseIotEventName('wifi信号强度')).toBeNull()
  })

  it('maps P_0_0 DATA events to wifi_signal_strength', () => {
    const row = expandIotEventLogDocument({
      deviceSn: 'GC2001000000252',
      mapping,
      document: {
        _id: 'evt-1',
        deviceId: '69c4e61a495848939ee23928',
        sn: 'GC2001000000252',
        et: 'DATA',
        en: 'P_0_0',
        ec: 80,
        t: '2026-08-03T05:14:55.955Z'
      }
    })

    expect(row).toMatchObject({
      sourceRecordId: 'iot-event:evt-1:P_0_0',
      deviceSn: 'GC2001000000252',
      sourceDeviceId: '69c4e61a495848939ee23928',
      metricKey: 'wifi_signal_strength',
      siid: '0',
      piid: '0',
      inverterIndex: null,
      value: 80
    })
    expect(row?.reportedAt.toISOString()).toBe('2026-08-03T05:14:55.955Z')
  })

  it('ignores non-DATA or unmapped events', () => {
    expect(
      expandIotEventLogDocument({
        deviceSn: 'x',
        mapping,
        document: { et: 'ONLINE', en: 'P_0_0', ec: 1, t: '2026-08-03T05:14:55.955Z' }
      })
    ).toBeNull()

    expect(
      expandIotEventLogDocument({
        deviceSn: 'x',
        mapping,
        document: { et: 'DATA', en: 'P_5_7', ec: 550, t: '2026-08-03T05:14:54.015Z' }
      })
    ).toBeNull()
  })
})
