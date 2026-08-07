import { describe, expect, it, vi, beforeEach } from 'vitest'
import { classifyDeviceStatus, DeviceService } from '@/src/services/device-service'
import { loadDeviceRegistry } from '@/src/adapters/source-db/device-registry'
import type { DeviceRegistry } from '@/src/adapters/source-db/device-registry'

// --- 纯函数：7 日分类边界 ---

const MIN = 60_000
const DAY = 24 * 60 * MIN

function at(offsetMs: number): Date {
  return new Date(Date.now() + offsetMs)
}

describe('classifyDeviceStatus (7 日分类)', () => {
  it('边界1: Mongo 近 1h 上报 → active', () => {
    expect(classifyDeviceStatus({ lastReportedAt: at(-1 * MIN), online: false })).toBe('active')
  })

  it('边界2: IoT online=true 但 Mongo 无数据 → active', () => {
    expect(classifyDeviceStatus({ lastReportedAt: null, online: true })).toBe('active')
  })

  it('边界3: Mongo 3 天内有上报（当前离线）→ active', () => {
    expect(classifyDeviceStatus({ lastReportedAt: at(-3 * DAY), online: false })).toBe('active')
  })

  it('边界4: Mongo 7 天 +1 分钟前上报 → stale-offline', () => {
    expect(classifyDeviceStatus({ lastReportedAt: at(-(7 * DAY + MIN)), online: false })).toBe('stale-offline')
  })

  it('边界5: Mongo 正好 7 天前上报（包含边界）→ active', () => {
    expect(classifyDeviceStatus({ lastReportedAt: at(-7 * DAY), online: false })).toBe('active')
  })

  it('边界6: IoT online 缺失(undefined) 但 Mongo 有近期上报 → active', () => {
    expect(classifyDeviceStatus({ lastReportedAt: at(-2 * DAY) })).toBe('active')
  })

  it('补充: IoT online 缺失 且 Mongo 无数据 → stale-offline', () => {
    expect(classifyDeviceStatus({ lastReportedAt: null })).toBe('stale-offline')
  })

  it('补充: IoT online=false 且 Mongo 无数据 → stale-offline', () => {
    expect(classifyDeviceStatus({ lastReportedAt: null, online: false })).toBe('stale-offline')
  })
})

// --- listDevices 集成：注册表并集 + 计数 ---

const mockRegistry: DeviceRegistry = {
  version: 1,
  devices: [
    { device_id: 'd_online', sn: 'SN_ONLINE', online: true },
    { device_id: 'd_recent', sn: 'SN_RECENT', online: false },
    { device_id: 'd_stale', sn: 'SN_STALE', online: false }
  ]
}

vi.mock('@/src/adapters/source-db/device-registry', () => ({
  loadDeviceRegistry: vi.fn(() => ({ registry: mockRegistry, path: 'config/devices.json', mode: 'local' as const })),
  resolveDeviceSn: (entry: { sn?: string; device_id: string }) => entry.sn ?? `PLACEHOLDER-${entry.device_id}`
}))

vi.mock('@/src/repositories/device-repository', () => ({
  DeviceRepository: class {
    // 无 Mongo 数据：聚焦测试注册表并集与 classifyStatus 透传。
    async findDashboardRecords() {
      return [] as never
    }
  }
}))

describe('DeviceService.listDevices 7 日分类集成', () => {
  let service: DeviceService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new DeviceService()
  })

  it('registryTotal 反映注册表总条数', async () => {
    const result = await service.listDevices({})
    expect(result.summary.registryTotal).toBe(mockRegistry.devices.length)
  })

  it('每个 item 都带 classifyStatus', async () => {
    const result = await service.listDevices({})
    expect(result.items.length).toBe(mockRegistry.devices.length)
    for (const item of result.items) {
      expect(['active', 'stale-offline']).toContain(item.classifyStatus)
    }
  })

  it('staleOfflineCount 统计正确（IoT offline 且无 Mongo 数据 → stale-offline）', async () => {
    const result = await service.listDevices({})
    const expectedStale = mockRegistry.devices.filter((d) => d.online !== true).length
    expect(result.summary.staleOfflineCount).toBe(expectedStale)
    const onlineItem = result.items.find((i) => i.deviceSn === 'SN_ONLINE')
    expect(onlineItem?.classifyStatus).toBe('active')
    const staleItem = result.items.find((i) => i.deviceSn === 'SN_STALE')
    expect(staleItem?.classifyStatus).toBe('stale-offline')
  })

  it('status=stale-offline 仅返回 stale-offline 设备', async () => {
    const result = await service.listDevices({ status: 'stale-offline' })
    expect(result.items.every((i) => i.classifyStatus === 'stale-offline')).toBe(true)
    expect(result.total).toBe(mockRegistry.devices.filter((d) => d.online !== true).length)
  })
})
