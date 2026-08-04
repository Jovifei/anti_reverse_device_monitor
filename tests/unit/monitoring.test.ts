import { describe, expect, it } from 'vitest'
import {
  breakChartTimeGaps,
  chartSeriesDisplayColor,
  CT_POWER_METRICS,
  displayInverterIdentity,
  displayPowerLimit,
  displaySwitch,
  durationEmphasisParts,
  formatOfflineWindowRange,
  formatTime,
  isGenerating,
  resolveInverterCardStatus
} from '@/src/domain/monitoring'

const row = (metricKey: string, valueNumber: number | null, valueText: string | null = null) => ({
  metricKey,
  valueNumber,
  valueText,
  reportedAt: new Date()
})

describe('real-time inverter generation state', () => {
  it('requires online state and positive output power', () => {
    expect(isGenerating(2, 1, 120)).toBe(true)
    expect(isGenerating(2, 1, 0)).toBe(false)
    expect(isGenerating(2, 1, 1)).toBe(false)
  })

  it('never reports offline or unknown state as generating', () => {
    expect(isGenerating(1, 1, 500)).toBe(false)
    expect(isGenerating(0, 1, 500)).toBe(false)
    expect(isGenerating(null, 1, 500)).toBe(false)
  })

  it('uses work state only when output is unavailable and online', () => {
    expect(isGenerating(2, 1, null)).toBe(true)
    expect(isGenerating(2, 2, null)).toBe(false)
  })
})

describe('resolveInverterCardStatus', () => {
  it('keeps firmware online_state when present', () => {
    expect(resolveInverterCardStatus({ onlineState: 2, paired: true, power: 0 }).variant).toBe('online')
    expect(resolveInverterCardStatus({ onlineState: 1, paired: true, power: 500 }).variant).toBe('offline')
  })

  it('falls back to power evidence instead of 无数据', () => {
    expect(resolveInverterCardStatus({ onlineState: null, paired: true, power: 120 })).toEqual({
      label: '有功率上报',
      variant: 'online'
    })
    expect(resolveInverterCardStatus({ onlineState: null, paired: true, power: null }).label).toBe('状态未上报')
  })
})

describe('displayInverterIdentity', () => {
  it('prefers binding then telemetry text', () => {
    expect(displayInverterIdentity('SN-BIND', row('inverter_sn', null, 'SN-TELE'))).toBe('SN-BIND')
    expect(displayInverterIdentity(null, row('inverter_sn', null, 'SN-TELE'))).toBe('SN-TELE')
    expect(displayInverterIdentity(undefined, undefined)).toBe('—')
  })
})

describe('inverter configuration display', () => {
  it('maps boolean switches and power limits to business units', () => {
    expect(displaySwitch(row('anti_reverse_enabled', 1))).toBe('开启')
    expect(displaySwitch(row('generation_enabled', 0))).toBe('关闭')
    expect(displaySwitch({ metricKey: 'anti_reverse_enabled', valueNumber: null, valueText: 'true', reportedAt: new Date() })).toBe('开启')
    expect(displaySwitch({ metricKey: 'generation_enabled', valueNumber: null, valueText: 'false', reportedAt: new Date() })).toBe('关闭')
    expect(displayPowerLimit(row('power_limit', 100))).toBe('100 W')
    expect(displayPowerLimit(row('power_limit', 0))).toBe('关闭')
  })
})

describe('wifi signal bars', () => {
  it('maps strength into 0-4 bars', async () => {
    const { wifiSignalBars } = await import('@/src/domain/monitoring')
    expect(wifiSignalBars(null)).toBe(0)
    expect(wifiSignalBars(10)).toBe(1)
    expect(wifiSignalBars(40)).toBe(2)
    expect(wifiSignalBars(60)).toBe(3)
    expect(wifiSignalBars(80)).toBe(4)
    expect(wifiSignalBars(-50)).toBe(4)
  })
})

describe('Sub1G status derivation', () => {
  it('prefers firmware raw sub1g_state labels', async () => {
    const { deriveCtSub1gStatus } = await import('@/src/domain/monitoring')
    expect(deriveCtSub1gStatus({ rawState: 4, hasPairedInverters: true }).label).toBe('通信正常')
    expect(deriveCtSub1gStatus({ rawState: 3, hasPairedInverters: true }).tone).toBe('warn')
  })

  it('derives CT status from paired/online inverters, not report freshness', async () => {
    const { deriveCtSub1gStatus } = await import('@/src/domain/monitoring')
    expect(
      deriveCtSub1gStatus({
        rawState: null,
        hasPairedInverters: true,
        hasOnlinePairedInverter: true
      }).label
    ).toBe('通信正常')
    expect(
      deriveCtSub1gStatus({
        rawState: null,
        hasPairedInverters: true,
        hasOnlinePairedInverter: false
      }).label
    ).toBe('配对设备已连接但通信不畅')
    expect(
      deriveCtSub1gStatus({
        rawState: null,
        hasPairedInverters: false,
        hasOnlinePairedInverter: false
      }).label
    ).toBe('模块未配对设备')
  })

  it('shows inverter Sub1G only when paired; offline means 通信不畅', async () => {
    const { deriveInverterSub1gStatus } = await import('@/src/domain/monitoring')
    expect(deriveInverterSub1gStatus({ onlineState: 2, paired: true })).toEqual({
      label: '通信正常',
      tone: 'ok'
    })
    expect(deriveInverterSub1gStatus({ onlineState: 1, paired: true })).toEqual({
      label: '配对设备已连接但通信不畅',
      tone: 'warn'
    })
    expect(deriveInverterSub1gStatus({ onlineState: 0, paired: false })).toBeNull()
    expect(deriveInverterSub1gStatus({ onlineState: 1, paired: false })).toBeNull()
    expect(deriveInverterSub1gStatus({ onlineState: null, paired: undefined })).toBeNull()
  })
})

describe('inverter phase label', () => {
  it('maps phase_num 1/2/3 to A/B/C 相', async () => {
    const { displayInverterPhaseLabel } = await import('@/src/domain/monitoring')
    expect(displayInverterPhaseLabel(1)).toBe('A相')
    expect(displayInverterPhaseLabel('2')).toBe('B相')
    expect(displayInverterPhaseLabel(3)).toBe('C相')
    expect(displayInverterPhaseLabel(null)).toBe('—')
  })
})

describe('energy Wh to kWh display', () => {
  it('scales Wh readings by 1000 for kWh labels', async () => {
    const { displayEnergyKwh, whToKwh } = await import('@/src/domain/monitoring')
    expect(whToKwh(2368.07)).toBeCloseTo(2.36807, 5)
    expect(displayEnergyKwh(row('today_energy', 2368.07))).toBe('2.37 kWh')
    expect(displayEnergyKwh(row('total_energy', 266979.25))).toBe('266.98 kWh')
  })
})

describe('CT history chart alarm colors', () => {
  it('keeps normal phase and inverter curves out of alert red', () => {
    const regularPowerKeys = ['ct-a', 'ct-b', 'ct-c', 'inv-a', 'inv-b', 'inv-c']
    const colors = CT_POWER_METRICS.filter((item) => regularPowerKeys.includes(item.key)).map((item) => item.color)

    expect(colors).toEqual(['#A67C00', '#168449', '#1463d9', '#65a30d', '#7c3aed', '#4f46e5'])
    expect(colors).not.toContain('#c92828')
    expect(colors).not.toContain('#dc2626')
    expect(CT_POWER_METRICS.filter((item) => item.markNegative).map((item) => item.key)).toEqual(['grid', 'ct-a', 'ct-b', 'ct-c'])
  })

  it('overrides stale alert identity colors before normal chart rendering', () => {
    expect(chartSeriesDisplayColor('ct-a', '#dc2626')).toBe('#A67C00')
    expect(chartSeriesDisplayColor('inv-b', '#be123c')).toBe('#7c3aed')
    expect(chartSeriesDisplayColor('temperature', '#dc2626')).toBe('#0f766e')
    expect(chartSeriesDisplayColor('unknown-series', '#c92828')).toBe('#2563eb')
    expect(chartSeriesDisplayColor('unknown-series', '#0d9488')).toBe('#0d9488')
  })
})

describe('groupByLocalDate', () => {
  it('buckets by local day: newest day first, within-day descending', async () => {
    const { formatClockTime, formatDateOnly, groupByLocalDate } = await import('@/src/domain/monitoring')
    const items = [
      { at: '2026-07-24T11:01:19.000Z', label: 'b' },
      { at: '2026-07-25T01:10:29.000Z', label: 'c' },
      { at: '2026-07-24T10:48:13.000Z', label: 'a' }
    ]
    const groups = groupByLocalDate(items, (item) => item.at)
    expect(groups.map((group) => group.date)).toEqual([
      formatDateOnly(items[1].at),
      formatDateOnly(items[0].at)
    ])
    expect(groups[0].items.map((item) => item.label)).toEqual(['c'])
    expect(groups[1].items.map((item) => item.label)).toEqual(['b', 'a'])
    expect(formatClockTime(items[2].at)).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })
})

describe('formatOfflineWindowRange', () => {
  it('omits repeated date when start and end share a local day', () => {
    // 2026-08-02 00:05:25 / 00:22:35 Asia/Shanghai
    expect(formatOfflineWindowRange('2026-08-01T16:05:25.000Z', '2026-08-01T16:22:35.000Z')).toBe(
      '00:05:25 至 00:22:35'
    )
  })

  it('keeps full end timestamp across local days', () => {
    const end = '2026-08-02T16:22:35.000Z'
    expect(formatOfflineWindowRange('2026-08-01T16:05:25.000Z', end)).toBe(`00:05:25 至 ${formatTime(end)}`)
  })
})

describe('durationEmphasisParts', () => {
  it('marks minute count for emphasis', () => {
    expect(durationEmphasisParts(17)).toEqual([
      { kind: 'num', value: '17' },
      { kind: 'text', value: ' 分钟' }
    ])
  })
})
describe('breakChartTimeGaps', () => {
  it('inserts null between samples farther than maxGapMs', () => {
    const points = breakChartTimeGaps(
      [
        ['2026-07-28T10:00:00.000Z', 400],
        ['2026-07-28T10:30:00.000Z', 420],
        ['2026-08-03T10:00:00.000Z', 300]
      ],
      2 * 60 * 60 * 1000
    )
    expect(points).toHaveLength(4)
    expect(points[2][1]).toBeNull()
    expect(points[3]).toEqual(['2026-08-03T10:00:00.000Z', 300])
  })

  it('keeps dense samples continuous', () => {
    const points = breakChartTimeGaps([
      ['2026-07-28T10:00:00.000Z', 100],
      ['2026-07-28T10:10:00.000Z', 110],
      ['2026-07-28T10:20:00.000Z', 120]
    ])
    expect(points).toHaveLength(3)
    expect(points.every((point) => point[1] !== null)).toBe(true)
  })
})
