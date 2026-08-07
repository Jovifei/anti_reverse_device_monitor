import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DeviceService } from '@/src/services/device-service'
import type { DeviceRegistry } from '@/src/adapters/source-db/device-registry'

/**
 * 「近 7 日新上线（增量在线）」口径：
 * Mongo 活跃列表（近 7 天有上报 / 平台在线）中、IoT 注册表未标记 online===true（或注册表完全无记录）的设备。
 * 注册表没有注册时间字段，因此该口径是「Mongo 活跃集合」与「注册表已知在线集合」的差集。
 */

const MIN = 60_000
const DAY = 24 * 60 * MIN

function at(offsetMs: number): Date {
  return new Date(Date.now() + offsetMs)
}

const mockRegistry: DeviceRegistry = {
  version: 1,
  devices: [
    // 注册表已知在线 + Mongo 活跃 → 不算新上线
    { device_id: 'd_known_online', sn: 'SN_KNOWN_ONLINE', online: true },
    // 注册表 online=false + Mongo 近 7 天有上报 → 新上线
    { device_id: 'd_new_offline_flag', sn: 'SN_NEW_A', online: false },
    // 注册表无 online 字段 + Mongo 近 7 天有上报 → 新上线
    { device_id: 'd_new_no_flag', sn: 'SN_NEW_B' },
    // 注册表 online=false 且 Mongo 无数据 → stale-offline，不算新上线
    { device_id: 'd_stale', sn: 'SN_STALE', online: false }
  ]
}

/** Mongo dashboard 记录：包含一台注册表完全没有的设备（SN_GHOST）。 */
function dashboardRecord(deviceSn: string, options: { platformOnline: boolean; lastReportedAt: Date | null }) {
  return {
    id: Math.abs(hashCode(deviceSn)),
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

function hashCode(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return hash
}

const mockDashboardRecords = [
  dashboardRecord('SN_KNOWN_ONLINE', { platformOnline: true, lastReportedAt: at(-5 * MIN) }),
  dashboardRecord('SN_NEW_A', { platformOnline: true, lastReportedAt: at(-10 * MIN) }),
  dashboardRecord('SN_NEW_B', { platformOnline: false, lastReportedAt: at(-2 * DAY) }),
  dashboardRecord('SN_GHOST', { platformOnline: true, lastReportedAt: at(-1 * MIN) }),
  // 超过 7 天未上报且平台离线 → 不进入 activeItems
  dashboardRecord('SN_STALE', { platformOnline: false, lastReportedAt: at(-(9 * DAY)) })
]

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
  }
}))

describe('DeviceService.listDevices 近7日新上线（增量在线）', () => {
  let service: DeviceService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new DeviceService()
  })

  it('newlyOnlineCount = Mongo 活跃且不在注册表已知在线集合中的设备数（含注册表无记录者）', async () => {
    const result = await service.listDevices({})
    // 活跃集合：SN_KNOWN_ONLINE / SN_NEW_A / SN_NEW_B / SN_GHOST（SN_STALE 9 天前上报且离线，被排除）
    expect(result.summary.activeTotal).toBe(4)
    // 差集：SN_NEW_A + SN_NEW_B + SN_GHOST
    expect(result.summary.newlyOnlineCount).toBe(3)
  })

  it('注册表已标记 online=true 的活跃设备不计入 newlyOnlineCount', async () => {
    const result = await service.listDevices({})
    const knownOnlineActive = mockRegistry.devices.filter((device) => device.online === true).length
    expect(result.summary.activeTotal - result.summary.newlyOnlineCount).toBe(knownOnlineActive)
  })

  it('summary 口径与列表筛选无关（不同 status 下 newlyOnlineCount 一致）', async () => {
    const defaultResult = await service.listDevices({})
    const allResult = await service.listDevices({ status: 'all' })
    const newlyResult = await service.listDevices({ status: 'newly-online' })
    expect(allResult.summary.newlyOnlineCount).toBe(defaultResult.summary.newlyOnlineCount)
    expect(newlyResult.summary.newlyOnlineCount).toBe(defaultResult.summary.newlyOnlineCount)
  })

  it('status=newly-online 仅返回 classifyStatus=active 且注册表 online !== true 的设备', async () => {
    const result = await service.listDevices({ status: 'newly-online' })
    expect(result.items.every((item) => item.classifyStatus === 'active' && item.online !== true)).toBe(true)
    expect(result.items.map((item) => item.deviceSn).sort()).toEqual(['SN_NEW_A', 'SN_NEW_B'])
    // 列表由注册表并集构建，注册表无记录的 SN_GHOST 只计数、不出列（与其它 activeItems 类计数卡片一致）。
    expect(result.items.some((item) => item.deviceSn === 'SN_GHOST')).toBe(false)
    expect(result.total).toBe(2)
  })

  it('status=newly-online 不包含注册表已在线设备与 7 日以上离线设备', async () => {
    const result = await service.listDevices({ status: 'newly-online' })
    expect(result.items.some((item) => item.deviceSn === 'SN_KNOWN_ONLINE')).toBe(false)
    expect(result.items.some((item) => item.deviceSn === 'SN_STALE')).toBe(false)
  })

  it('newly-online 与关键字搜索可叠加', async () => {
    const result = await service.listDevices({ status: 'newly-online', q: 'new_a' })
    expect(result.items.map((item) => item.deviceSn)).toEqual(['SN_NEW_A'])
  })

  it('newly-online 是 active 视图的子集', async () => {
    const activeResult = await service.listDevices({ status: 'active' })
    const newlyResult = await service.listDevices({ status: 'newly-online' })
    const activeSns = new Set(activeResult.items.map((item) => item.deviceSn))
    expect(newlyResult.items.every((item) => activeSns.has(item.deviceSn))).toBe(true)
    expect(newlyResult.total).toBeLessThanOrEqual(activeResult.total)
  })
})
