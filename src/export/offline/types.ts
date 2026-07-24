export const EMPTY = '—'

export type ChartPoint = [string, number | null]

export interface OfflineChartSeries {
  key: string
  label: string
  unit: string
  color: string
  markNegative?: boolean
  dailyReset?: boolean
  points: ChartPoint[]
}

export interface OfflinePhaseCard {
  phase: 'A' | 'B' | 'C'
  powerText: string
  powerValue: number | null
  reverse: boolean
  series: OfflineChartSeries[]
  lastAlarmAt: string
}

export interface OfflineInverterCard {
  index: number
  sn: string
  statusLabel: string
  statusVariant: 'online' | 'offline' | 'unpaired' | 'unknown'
  workState: string
  generating: string
  power: string
  pv1: string
  pv2: string
  todayEnergy: string
  totalEnergy: string
  todayDuration: string
  temperature: string
  packetLoss: string
  softwareVersion: string
  hardwareVersion: string
  latestFault: string
  faultHex: string
  charts: {
    power: OfflineChartSeries[]
    temperature: OfflineChartSeries[]
    energy: OfflineChartSeries[]
  }
  detailHref?: string
}

export interface OfflineRecordItem {
  text: string
}

export interface OfflineDeviceViewModel {
  kind: 'device'
  title: string
  deviceSn: string
  sourceLabel: string
  timezone: string
  days: number
  lastReportedAt: string
  ctOnline: boolean
  ctStatusDuration: string
  isLastKnown: boolean
  reverseNow: boolean
  reversePhases: string[]
  reverseHeading: string
  reverseBadge: string
  activeAlertText: string
  phases: OfflinePhaseCard[]
  reverseAlerts: OfflineRecordItem[]
  ctState: string
  limitState: string
  sub1gState: string
  workMode: string
  loadPower: string
  gridPower: string
  inverterTotalPower: string
  todayEnergy: string
  todayDuration: string
  totalEnergy: string
  gridVoltage: string
  gridFrequency: string
  powerSeries: OfflineChartSeries[]
  gridSeries: OfflineChartSeries[]
  platformTransitions: OfflineRecordItem[]
  platformOfflineWindows: OfflineRecordItem[]
  inverters: OfflineInverterCard[]
  overviewHref?: string
}

export interface OfflineOverviewItem {
  deviceSn: string
  productModel: string
  isOnline: boolean
  lastReportedAt: string
  reverseFlow: boolean
  reversePhases: string
  href: string
}

export interface OfflineOverviewViewModel {
  kind: 'overview'
  title: string
  sourceLabel: string
  items: OfflineOverviewItem[]
  summary: { activeTotal: number; onlineCtCount: number; offlineCtCount: number; criticalReverseFlowCount: number }
}

export interface OfflineInverterViewModel {
  kind: 'inverter'
  title: string
  deviceSn: string
  inverterIndex: number
  inverterSn: string
  sourceLabel: string
  softwareVersion: string
  hardwareVersion: string
  sub1gVersion: string
  statusLabel: string
  statusVariant: 'online' | 'offline' | 'unpaired' | 'unknown'
  workState: string
  generating: string
  power: string
  pv1: string
  pv2: string
  todayEnergy: string
  totalEnergy: string
  todayDuration: string
  temperature: string
  packetLoss: string
  phase: string
  connectionPoint: string
  antiReverse: string
  generationEnabled: string
  powerLimit: string
  latestFault: string
  faultHex: string
  faultChanges: OfflineRecordItem[]
  offlineWindows: OfflineRecordItem[]
  charts: {
    power: OfflineChartSeries[]
    temperature: OfflineChartSeries[]
    energy: OfflineChartSeries[]
  }
  deviceHref: string
}

export type OfflinePageViewModel = OfflineDeviceViewModel | OfflineOverviewViewModel | OfflineInverterViewModel

export interface ExportCliOptions {
  sn?: string
  all?: boolean
  days: number
  db?: string
  excel?: string
  demo?: boolean
  singleFile?: boolean
  bundle?: boolean
  out: string
  title?: string
  help?: boolean
  sourceLabelOverride?: string
}
