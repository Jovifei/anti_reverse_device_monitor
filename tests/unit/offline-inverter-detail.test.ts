import { describe, expect, it } from 'vitest'
import { buildInverterViewModelFromDevice, hasInverterDetailData } from '@/src/export/offline/build-inverter-view-model'
import type { OfflineDeviceViewModel, OfflineInverterCard } from '@/src/export/offline/types'

const reportedCard = {
  index: 1,
  sn: '—',
  title: '微型逆变器 1：—',
  phaseLabel: '—',
  statusLabel: '离线',
  statusVariant: 'offline',
  workState: '—',
  generating: '否',
  antiReverse: '—',
  generationEnabled: '—',
  power: '112 W',
  pv1: '119 W',
  pv2: '—',
  todayEnergy: '0.7 kWh',
  totalEnergy: '153.54 kWh',
  todayDuration: '11 h',
  temperature: '—',
  packetLoss: '3 %',
  softwareVersion: '—',
  hardwareVersion: '—',
  latestFault: 'PV1 输入欠压',
  faultHex: '0x00400C00',
  charts: { power: [], temperature: [], energy: [], packetLoss: [] }
} satisfies OfflineInverterCard

const noDataCard = { ...reportedCard, index: 8, statusVariant: 'unknown' as const, power: '—', pv1: '—', todayEnergy: '—', totalEnergy: '—', packetLoss: '—' }

const device = {
  deviceSn: 'GC2001000000190',
  sourceLabel: '本地 Excel 快照',
  sub1gVersion: '—',
  lastReportedAt: '2026/07/24 16:13:39'
} as OfflineDeviceViewModel

describe('retained CT inverter detail coverage', () => {
  it('creates a detail view from every inverter card that has actual telemetry', () => {
    expect(hasInverterDetailData(reportedCard)).toBe(true)
    expect(hasInverterDetailData(noDataCard)).toBe(false)
    const detail = buildInverterViewModelFromDevice(device, reportedCard)
    expect(detail.deviceSn).toBe('GC2001000000190')
    expect(detail.power).toBe('112 W')
    expect(detail.offlineWindows[0]?.text).toContain('最后上报')
  })
})
