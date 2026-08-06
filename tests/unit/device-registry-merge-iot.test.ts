import { describe, expect, it } from 'vitest'
import {
  mergeIotListIntoRegistry,
  resolveDeviceSn,
  type DeviceRegistry,
  type DeviceRegistryEntry
} from '@/src/adapters/source-db/device-registry'
import type { IotDevice } from '@/src/adapters/iot-api/types'

const EXISTING: DeviceRegistry = {
  version: 1,
  devices: [
    // Excel 已 apply 过的项：带正式 SN，应被保留
    { sn: 'GC-EXCEL-1', device_id: 'id-excel-1', product_id: 'prod', collection: 'device_log_prod', label: 'anti-reverse-ct' },
    // 仅占位 SN 的旧项
    { device_id: 'id-placeholder-1', product_id: 'prod' },
    // IoT 列表里不存在的旧项（默认应保留，避免误删）
    { sn: 'GC-OLD-1', device_id: 'id-old-1', product_id: 'prod' }
  ]
}

function iot(id: string, over: Partial<IotDevice> = {}): IotDevice {
  return { id, sn: `sn-${id}`, nickname: `nick-${id}`, online: true, productId: 'prod', ...over }
}

describe('mergeIotListIntoRegistry', () => {
  it('新增 IoT 列表里不存在的新设备', () => {
    const merged = mergeIotListIntoRegistry(EXISTING, [iot('id-new-1')], { product_id: 'prod' })
    const created = merged.devices.find((d) => d.device_id === 'id-new-1')
    expect(created).toBeDefined()
    expect(created?.sn).toBe('sn-id-new-1')
    expect(created?.nickname).toBe('nick-id-new-1')
    expect(created?.online).toBe(true)
  })

  it('更新已存在 device_id 的 nickname / online，但保留 Excel 的 SN', () => {
    const merged = mergeIotListIntoRegistry(
      EXISTING,
      [iot('id-excel-1', { nickname: 'new-nick', online: false, sn: 'sn-from-iot' })],
      { product_id: 'prod' }
    )
    const updated = merged.devices.find((d) => d.device_id === 'id-excel-1')
    expect(updated?.nickname).toBe('new-nick') // nickname 永远取 IoT 最新值
    expect(updated?.online).toBe(false)
    // Excel 已 apply 的 SN 优先保留，不被 IoT 的 sn 覆盖
    expect(updated?.sn).toBe('GC-EXCEL-1')
  })

  it('保留 IoT 列表里不存在的旧 device_id（默认不删）', () => {
    const merged = mergeIotListIntoRegistry(EXISTING, [iot('id-new-1')], { product_id: 'prod' })
    const keptOld = merged.devices.find((d) => d.device_id === 'id-old-1')
    expect(keptOld).toBeDefined()
    expect(keptOld?.sn).toBe('GC-OLD-1')
  })

  it('prune=true 时删除 IoT 列表里不存在的旧 device_id', () => {
    const merged = mergeIotListIntoRegistry(EXISTING, [iot('id-new-1')], { product_id: 'prod' }, true)
    expect(merged.devices.find((d) => d.device_id === 'id-old-1')).toBeUndefined()
    expect(merged.devices.find((d) => d.device_id === 'id-excel-1')).toBeDefined()
    expect(merged.devices.find((d) => d.device_id === 'id-new-1')).toBeDefined()
  })

  it('IoT 缺失 nickname 时保留既有 nickname', () => {
    const base: DeviceRegistry = { version: 1, devices: [{ device_id: 'id-1', nickname: 'keep-me' }] }
    const merged = mergeIotListIntoRegistry(base, [iot('id-1', { nickname: undefined })], {})
    expect(merged.devices.find((d) => d.device_id === 'id-1')?.nickname).toBe('keep-me')
  })

  it('输出注册表保持按 device_id 排序且 version=1', () => {
    const merged = mergeIotListIntoRegistry(EXISTING, [iot('id-new-1')], { product_id: 'prod' })
    expect(merged.version).toBe(1)
    const ids = merged.devices.map((d) => d.device_id)
    expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual(ids)
    // 既有项 resolveDeviceSn 行为不受影响
    const placeholder = merged.devices.find((d) => d.device_id === 'id-placeholder-1')
    expect(placeholder && resolveDeviceSn(placeholder).startsWith('unknown-')).toBe(true)
  })

  it('忽略 IoT 列表中缺失 id 的设备', () => {
    const bad: IotDevice = { sn: 'sn-bad', nickname: 'x' } // 无 id
    const merged = mergeIotListIntoRegistry({ version: 1, devices: [] }, [bad], {})
    expect(merged.devices).toHaveLength(0)
  })
})
