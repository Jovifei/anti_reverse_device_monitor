import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DeviceService } from '@/src/services/device-service'
import type { DeviceRegistry } from '@/src/adapters/source-db/device-registry'

const NOW = new Date('2026-08-09T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * DAY)
}

function hashCode(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0
  return Math.abs(hash)
}

function dashboardRecord(deviceSn: string, options: { platformOnline: boolean; lastReportedAt: Date | null }) {
  return {
    id: hashCode(deviceSn),
    deviceSn,
    productModel: null as string | null,
    platformOnline: options.platformOnline,
    lastReportedAt: options.lastReportedAt,
    latestRows: [] as Array<{ metricKey: string; valueNumber: number | null; valueText: string | null; reportedAt: Date }>,
    inverterBindings: [] as Array<{
      inverterIndex: number
      paired: boolean
      latestRows: Array<{ metricKey: string; valueNumber: number | null; valueText: string | null; reportedAt: Date }>
    }>
  }
}

const mockRegistry: DeviceRegistry = {
  version: 1,
  devices: [
    { device_id: 'd_continuous', sn: 'SN_CONTINUOUS', online: false },
    { device_id: 'd_recent', sn: 'SN_RECENT', online: true },
    { device_id: 'd_boundary', sn: 'SN_BOUNDARY', online: false },
    { device_id: 'd_stale', sn: 'SN_STALE', online: false }
  ]
}

const mockDashboardRecords = [
  dashboardRecord('SN_CONTINUOUS', { platformOnline: true, lastReportedAt: daysAgo(0.1) }),
  dashboardRecord('SN_RECENT', { platformOnline: true, lastReportedAt: daysAgo(0.1) }),
  dashboardRecord('SN_BOUNDARY', { platformOnline: false, lastReportedAt: daysAgo(1) }),
  dashboardRecord('SN_GHOST_CONTINUOUS', { platformOnline: true, lastReportedAt: daysAgo(0.1) }),
  dashboardRecord('SN_STALE', { platformOnline: false, lastReportedAt: daysAgo(9) })
]

const firstReportBySn = new Map([
  ['SN_CONTINUOUS', daysAgo(6)],
  ['SN_RECENT', daysAgo(2)],
  ['SN_BOUNDARY', daysAgo(3)],
  ['SN_GHOST_CONTINUOUS', daysAgo(4)]
])

vi.mock('@/src/adapters/source-db/device-registry', () => ({
  loadDeviceRegistry: vi.fn(() => ({ registry: mockRegistry, path: 'config/devices.json', mode: 'local' as const })),
  resolveDeviceSn: (entry: { sn?: string; device_id: string }) => entry.sn ?? `PLACEHOLDER-${entry.device_id}`
}))

vi.mock('@/src/repositories/device-repository', () => ({
  DeviceRepository: class {
    async findDashboardRecords() {
      return mockDashboardRecords as never
    }
  }
}))

vi.mock('@/src/repositories/telemetry-repository', () => ({
  TelemetryRepository: class {
    async listCtPhasePowerForDevices() {
      return [] as never
    }

    async listInverterFaultMasksForDevices() {
      return [] as never
    }

    async listFirstReportedAtForDevices({ deviceIds }: { deviceIds: number[] }) {
      return mockDashboardRecords.flatMap((record) => {
        const firstReportedAt = firstReportBySn.get(record.deviceSn)
        return firstReportedAt && deviceIds.includes(record.id) ? [{ deviceId: record.id, firstReportedAt }] : []
      })
    }
  }
}))

describe('DeviceService.listDevices 近7日新上线', () => {
  let service: DeviceService

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    service = new DeviceService()
  })

  it('只统计最近 3 日首次出现、且此前 4 日无上报的活跃设备', async () => {
    const result = await service.listDevices({})
    expect(result.summary.activeTotal).toBe(4)
    expect(result.summary.newlyOnlineCount).toBe(2)
  })

  it('连续 7 日有数据的设备不因 IoT 当前离线而误判为新上线', async () => {
    const result = await service.listDevices({ status: 'newly-online' })
    expect(result.items.some((item) => item.deviceSn === 'SN_CONTINUOUS')).toBe(false)
    expect(result.items.some((item) => item.deviceSn === 'SN_GHOST_CONTINUOUS')).toBe(false)
  })

  it('最近 3 日边界包含在新上线窗口内', async () => {
    const result = await service.listDevices({ status: 'newly-online' })
    expect(result.items.map((item) => item.deviceSn).sort()).toEqual(['SN_BOUNDARY', 'SN_RECENT'])
    expect(result.items.every((item) => item.classifyStatus === 'active' && item.isNewlyOnline)).toBe(true)
  })

  it('summary 口径不受列表筛选影响，并可叠加关键字', async () => {
    const defaultResult = await service.listDevices({})
    const allResult = await service.listDevices({ status: 'all' })
    const searched = await service.listDevices({ status: 'newly-online', q: 'recent' })
    expect(allResult.summary.newlyOnlineCount).toBe(defaultResult.summary.newlyOnlineCount)
    expect(searched.items.map((item) => item.deviceSn)).toEqual(['SN_RECENT'])
  })

  it('7 日以上离线设备不进入新上线视图', async () => {
    const result = await service.listDevices({ status: 'newly-online' })
    expect(result.items.some((item) => item.deviceSn === 'SN_STALE')).toBe(false)
  })
})
