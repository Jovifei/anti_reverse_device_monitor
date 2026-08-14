import { describe, expect, it } from 'vitest'
import { mergeManualSnMapIntoRegistry, type DeviceRegistry } from '@/src/adapters/source-db/device-registry'

describe('mergeManualSnMapIntoRegistry', () => {
  it('preserves the full IoT registry while applying manual SN overrides', () => {
    const existing: DeviceRegistry = {
      version: 1,
      devices: [
        { device_id: 'iot-full-1', sn: 'GC-FULL-1', nickname: 'keep-name', online: true },
        { device_id: 'iot-full-2', sn: 'GC-FULL-2', nickname: 'keep-second', online: false }
      ]
    }
    const manual: DeviceRegistry = {
      version: 1,
      devices: [{ device_id: 'iot-full-1', sn: 'GC-MANUAL-1', label: 'anti-reverse-ct' }]
    }

    const merged = mergeManualSnMapIntoRegistry(existing, manual)

    expect(merged.devices).toHaveLength(2)
    expect(merged.devices.find((item) => item.device_id === 'iot-full-1')).toMatchObject({
      sn: 'GC-MANUAL-1',
      label: 'anti-reverse-ct',
      nickname: 'keep-name',
      online: true
    })
    expect(merged.devices.find((item) => item.device_id === 'iot-full-2')).toMatchObject({
      sn: 'GC-FULL-2',
      nickname: 'keep-second'
    })
  })
})
