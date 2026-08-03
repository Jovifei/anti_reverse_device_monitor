import { promises as fs } from 'node:fs'
import path from 'node:path'
import { decodeFaultMask, hasCriticalFault } from '@/src/domain/faults'
import { parseDeviceListQuery, parseSn, parseTelemetryQuery } from '@/src/domain/validation'
import { parseSnLookup } from '@/src/domain/validation'
import {
  CT_POWER_METRICS,
  CT_KPI_ALIASES,
  displayEnergyKwh,
  displayValue,
  findLatestMetric,
  GRID_QUALITY_METRICS,
  INVERTER_POWER_METRICS,
  INVERTER_TEMPERATURE_METRIC,
  type MetricDefinition,
  metricMatches,
  numericValue
} from '@/src/domain/monitoring'
import { resolveStatusLabel } from '@/src/domain/dictionaries'
import { DeviceRepository } from '@/src/repositories/device-repository'
import { TelemetryRepository } from '@/src/repositories/telemetry-repository'
import {
  ConnectivitySummary,
  TelemetryService,
  type InverterHistorySummary
} from '@/src/services/telemetry-service'

export interface DeviceListResponse {
  total: number
  summary: {
    activeTotal: number
    onlineCtCount: number
    offlineCtCount: number
    criticalReverseFlowCount: number
    actionableOfflineCount: number
    staleOfflineCount: number
  }
  items: {
    id: number
    deviceSn: string
    productModel: string | null
    platformOnline: boolean
    lastReportedAt: Date | null
    inverterCount: number
    onlineInverterCount: number
    isOnline: boolean
    reverseFlow: boolean
    reverseFlowPhases: Array<'A' | 'B' | 'C'>
    reverseState: 'normal' | 'active' | 'unknown' | 'unknown-last-seen-reverse'
    offlineMinutes: number | null
    offlineAlert: boolean
    todayEnergy: string
    runtimeState: string
    limitState: string
    sub1gState: string
    wifiSignal: string
  }[]
  page: number
  pageSize: number
}

export interface DeviceHealthInverter {
  inverterIndex: number
  inverterSn: string | null
  lastSeenAt: string | null
  offlineMinutes: number | null
  isOnline: boolean
}

export interface DeviceHealthSummary {
  deviceSn: string
  isOnline: boolean
  platformOfflineMinutes: number | null
  lastReportedAt: string | null
  inverters: DeviceHealthInverter[]
}

export interface ReverseFlowAlertItem {
  phase: 'A' | 'B' | 'C'
  sampleCount: number
  minimumPower: number
  severity: 'critical'
  startedAt: string
  endedAt: string | null
  durationMinutes: number
}

export interface ChartSeries {
  key: string
  label: string
  unit: string
  color: string
  markNegative?: boolean
  dailyReset?: boolean
  step?: 'start' | 'middle' | 'end'
  points: Array<[string, number]>
}

export interface DeviceHistorySummary {
  deviceSn: string
  platform: ConnectivitySummary
  inverters: InverterHistorySummary[]
  windowStart: string
  windowEnd: string
}

const OFFLINE_THRESHOLD_MINUTES = 15
const ACTIVE_WINDOW_DAYS = 7
const OFFLINE_NOTICE_WINDOW_MINUTES = ACTIVE_WINDOW_DAYS * 24 * 60
const INVERTER_TODAY_ENERGY_METRIC: MetricDefinition = { key: 'inverter-today-energy', label: '今日发电量', unit: 'kWh', color: '#8b5e34', aliases: ['today_energy', 'inverter_today_energy'] }
const INVERTER_PACKET_LOSS_METRIC: MetricDefinition = {
  key: 'packet-loss',
  label: '丢包率',
  unit: '%',
  color: '#64748b',
  aliases: ['packet_loss_rate', 'packet_loss'],
  step: 'end'
}

function toMinutesSince(date: Date) {
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60000))
}

function parseIndex(rawIndex: string | number): number {
  const value = Number(rawIndex)
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1 || value > 8) {
    throw new Error('invalid inverter index')
  }
  return value
}

export class DeviceService {
  private readonly telemetryRepository = new TelemetryRepository()
  private readonly telemetryService = new TelemetryService()

  constructor(private readonly repo = new DeviceRepository()) {}

  async listDevices(rawQuery: unknown) {
    const parsed = parseDeviceListQuery(rawQuery)
    const now = new Date()
    const activeCutoff = new Date(now)
    activeCutoff.setDate(activeCutoff.getDate() - ACTIVE_WINDOW_DAYS)
    const onlineCutoff = new Date(now.getTime() - OFFLINE_THRESHOLD_MINUTES * 60_000)
    const records = await this.repo.findDashboardRecords()
    const activeItems = records
      .filter((item) => item.platformOnline || (item.lastReportedAt !== null && item.lastReportedAt >= activeCutoff))
      .map((item) => {
        const phaseMetric = (aliases: string[]) => numericValue(findLatestMetric(item.latestRows, aliases))
        const phaseValues = [
          { phase: 'A' as const, value: phaseMetric(['active_power_ct1', 'ct.active_power.phase_a']) },
          { phase: 'B' as const, value: phaseMetric(['active_power_ct2', 'ct.active_power.phase_b']) },
          { phase: 'C' as const, value: phaseMetric(['active_power_ct3', 'ct.active_power.phase_c']) }
        ]
        const reverseFlowPhases = phaseValues.filter((item) => item.value !== null && item.value < 0).map((item) => item.phase)
        const isOnline = Boolean(item.platformOnline && item.lastReportedAt && item.lastReportedAt >= onlineCutoff)
        const offlineMinutes = isOnline || !item.lastReportedAt ? null : toMinutesSince(item.lastReportedAt)
        const offlineAlert = offlineMinutes !== null && offlineMinutes < OFFLINE_NOTICE_WINDOW_MINUTES
        const reverseState = isOnline
          ? (reverseFlowPhases.length ? 'active' : 'normal')
          : (reverseFlowPhases.length ? 'unknown-last-seen-reverse' : 'unknown')
        const pairedInverters = item.inverterBindings.filter((binding) => binding.paired)
        const onlineInverterCount = pairedInverters.filter((binding) => binding.latestRows.some((row) => row.valueNumber === 2)).length
        return {
          id: item.id,
          deviceSn: item.deviceSn,
          productModel: item.productModel,
          platformOnline: item.platformOnline,
          lastReportedAt: item.lastReportedAt,
          inverterCount: pairedInverters.length,
          onlineInverterCount,
          isOnline,
          reverseFlow: reverseState === 'active',
          reverseFlowPhases,
          reverseState,
          offlineMinutes,
          offlineAlert,
          todayEnergy: displayEnergyKwh(findLatestMetric(item.latestRows, CT_KPI_ALIASES.todayEnergy)),
          runtimeState: resolveStatusLabel('ct_state', numericValue(findLatestMetric(item.latestRows, CT_KPI_ALIASES.state))) ?? '—',
          limitState: resolveStatusLabel('limit_state', numericValue(findLatestMetric(item.latestRows, CT_KPI_ALIASES.limitState))) ?? '—',
          sub1gState: resolveStatusLabel('sub1g_state', numericValue(findLatestMetric(item.latestRows, CT_KPI_ALIASES.sub1gState))) ?? '—',
          wifiSignal: displayValue(findLatestMetric(item.latestRows, ['wifi_signal_strength', 'wifi_rssi', 'wifi.signal', 'wifi_signal']))
        }
      })
    const summary = {
      activeTotal: activeItems.length,
      onlineCtCount: activeItems.filter((item) => item.isOnline).length,
      offlineCtCount: activeItems.filter((item) => !item.isOnline).length,
      criticalReverseFlowCount: activeItems.filter((item) => item.reverseFlow).length,
      actionableOfflineCount: activeItems.filter((item) => item.offlineAlert).length,
      staleOfflineCount: activeItems.filter((item) => !item.isOnline && !item.offlineAlert).length
    }
    const matchingItems = activeItems.filter((item) => {
      if (parsed.q && !item.deviceSn.toLowerCase().includes(parsed.q.toLowerCase())) return false
      if (parsed.status === 'online') return item.isOnline
      if (parsed.status === 'offline') return !item.isOnline
      if (parsed.status === 'reverse') return item.reverseFlow
      return true
    })
    const total = matchingItems.length
    const items = matchingItems.slice((parsed.page - 1) * parsed.pageSize, parsed.page * parsed.pageSize)

    return {
      items,
      total,
      summary,
      page: parsed.page,
      pageSize: parsed.pageSize
    } as DeviceListResponse
  }

  async getDeviceSummary(sn: string) {
    return this.repo.findBySn(parseSn(sn))
  }

  async getDeviceDataSourceLabel(sn: string) {
    const sourceName = await this.telemetryRepository.getLatestSourceNameForDevice(parseSn(sn))
    if (!sourceName) return '暂无数据'
    const name = sourceName.toLowerCase()
    if (name.includes('mongo')) return 'Mongo 设备日志'
    if (name.includes('excel')) return 'Excel 导入'
    if (name.includes('demo') || name.includes('ui-demo')) return 'Demo SQLite'
    if (name.includes('company') || name.includes('source') || name.includes('sync')) return '公司数据库同步'
    return sourceName
  }

  async findRawExcelForDevice(sn: string) {
    const deviceSn = parseSn(sn)
    const dataDir = path.join(process.cwd(), 'docs', 'data')
    try {
      const entries = await fs.readdir(dataDir)
      const matches = entries
        .filter((name) => name.includes(deviceSn) && /\.xlsx$/i.test(name))
        .sort((a, b) => b.localeCompare(a))
      if (!matches.length) return null
      return { fileName: matches[0], relativePath: path.join('docs', 'data', matches[0]) }
    } catch {
      return null
    }
  }

  async resolveDeviceSn(rawSn: string) {
    const lookup = parseSnLookup(rawSn)
    const exact = await this.repo.findSnByExact(lookup)
    if (exact) return { kind: 'resolved' as const, deviceSn: exact }

    const matches = await this.repo.findSnBySuffix(lookup)
    if (matches.length === 1) return { kind: 'resolved' as const, deviceSn: matches[0].deviceSn }
    if (matches.length > 1) return { kind: 'ambiguous' as const }
    return { kind: 'not-found' as const }
  }

  async getDeviceHealth(sn: string): Promise<DeviceHealthSummary | null> {
    const device = await this.repo.findHealthSnapshot(parseSn(sn))
    if (!device) {
      return null
    }

    const inverterRows = await Promise.all(
      device.inverterBindings.map(async (binding) => {
        const connectivity = await this.telemetryService.getInverterConnectivity(device.deviceSn, binding.inverterIndex, { days: '7' })

        return {
          inverterIndex: binding.inverterIndex,
          inverterSn: binding.inverterSn ?? null,
          lastSeenAt: connectivity.lastSeenAt,
          offlineMinutes: connectivity.currentOfflineMinutes ?? null,
          isOnline: connectivity.isOnline
        } satisfies DeviceHealthInverter
      })
    )

    const platformLastSeen = device.lastReportedAt ?? null
    const platformOnline = Boolean(
      device.platformOnline && platformLastSeen && toMinutesSince(platformLastSeen) <= OFFLINE_THRESHOLD_MINUTES
    )
    return {
      deviceSn: device.deviceSn,
      isOnline: platformOnline,
      platformOfflineMinutes: platformLastSeen ? toMinutesSince(platformLastSeen) : null,
      lastReportedAt: platformLastSeen ? platformLastSeen.toISOString() : null,
      inverters: inverterRows
    }
  }

  async getTelemetryLatest(sn: string, rawQuery: unknown) {
    const parsed = parseTelemetryQuery(rawQuery)
    return this.telemetryRepository.listLatest({
      deviceSn: parseSn(sn),
      inverterIndex: parsed.inverterIndex ?? null,
      page: 1,
      pageSize: 500
    })
  }

  async getInverterSummary(sn: string, rawIndex: string | number) {
    const deviceSn = parseSn(sn)
    const inverterIndex = parseIndex(rawIndex)
    const device = await this.repo.findBySn(deviceSn)

    if (!device) {
      return null
    }

    const binding = device.inverterBindings.find((item) => item.inverterIndex === inverterIndex)
    if (!binding) {
      return null
    }

    const rows = await this.telemetryRepository.listLatest({
      deviceSn,
      inverterIndex,
      page: 1,
      pageSize: 200
    })

    const faultRows = rows.filter((row) => row.metricKey.toLowerCase().includes('fault'))
    const faults = faultRows.map((row) => {
      const value = row.valueNumber
      const active = Number.isFinite(value ?? NaN) ? decodeFaultMask(Number(value)) : []
      return {
        metricKey: row.metricKey,
        reportedAt: row.reportedAt.toISOString(),
        value: value ?? null,
        faults: active,
        critical: value !== null && hasCriticalFault(Number(value))
      }
    })

    return {
      deviceSn,
      inverterIndex,
      inverterSn: binding.inverterSn,
      softwareVersion: binding.softwareVersion,
      hardwareVersion: binding.hardwareVersion,
      sub1gVersion: binding.sub1gVersion,
      phaseNum: binding.phaseNum,
      connectionPoint: binding.connectionPoint,
      paired: binding.paired,
      latestRows: rows,
      faults,
      connectivity: await this.telemetryService.getInverterConnectivity(
        deviceSn,
        inverterIndex,
        { days: '7' }
      ),
      faultChanges: await this.telemetryService.getInverterFaultChanges(deviceSn, inverterIndex, {
        days: '7'
      })
    }
  }

  async getDeviceHistory(sn: string, rawQuery: unknown): Promise<DeviceHistorySummary | null> {
    const deviceSn = parseSn(sn)
    parseTelemetryQuery(rawQuery)
    const device = await this.repo.findBySn(deviceSn)
    if (!device) {
      return null
    }

    const platform = await this.telemetryService.getPlatformConnectivity(deviceSn, rawQuery)
    const inverters = await Promise.all(
      device.inverterBindings.map(async (binding) =>
        this.telemetryService.getInverterHistory(
          deviceSn,
          binding.inverterIndex,
          binding.inverterSn ?? null,
          rawQuery
        )
      )
    )

    return {
      deviceSn,
      platform,
      inverters,
      windowStart: platform.windowStart,
      windowEnd: platform.windowEnd
    }
  }

  async getDeviceChartData(sn: string, rawQuery: unknown) {
    const parsed = parseTelemetryQuery(rawQuery)
    const deviceSn = parseSn(sn)
    const { startAt, endAt } = await this.resolveChartWindow(deviceSn, parsed.days)
    const rows = await this.telemetryRepository.listTelemetryWindow({
      deviceSn, startAt, endAt
    })
    return {
      windowStart: startAt.toISOString(),
      windowEnd: endAt.toISOString(),
      power: this.toChartSeries(rows, CT_POWER_METRICS),
      grid: this.toChartSeries(rows, GRID_QUALITY_METRICS)
    }
  }

  async getInverterChartData(sn: string, rawIndex: string | number, rawQuery: unknown) {
    const parsed = parseTelemetryQuery(rawQuery)
    const deviceSn = parseSn(sn)
    const inverterIndex = parseIndex(rawIndex)
    const { startAt, endAt } = await this.resolveChartWindow(deviceSn, parsed.days, inverterIndex)
    const rows = await this.telemetryRepository.listTelemetryWindow({
      deviceSn, inverterIndex, startAt, endAt
    })
    return {
      windowStart: startAt.toISOString(),
      windowEnd: endAt.toISOString(),
      power: this.toChartSeries(rows, INVERTER_POWER_METRICS),
      temperature: this.toChartSeries(rows, [INVERTER_TEMPERATURE_METRIC]),
      energy: this.toChartSeries(rows, [INVERTER_TODAY_ENERGY_METRIC]).map((item) => ({
        ...item,
        dailyReset: true,
        points: item.points.map(([at, value]) => [at, value / 1000] as [string, number])
      })),
      packetLoss: this.toChartSeries(rows, [INVERTER_PACKET_LOSS_METRIC])
    }
  }

  async getReverseFlowAlarms(sn: string, rawQuery: unknown) {
    const parsed = parseTelemetryQuery(rawQuery)
    const deviceSn = parseSn(sn)
    const { startAt, endAt } = await this.resolveChartWindow(deviceSn, parsed.days)

    const rows = await this.telemetryRepository.listTelemetryWindow({
      deviceSn,
      startAt,
      endAt
    })
    const phases = [
      { phase: 'A' as const, aliases: ['active_power_ct1', 'ct.active_power.phase_a'] },
      { phase: 'B' as const, aliases: ['active_power_ct2', 'ct.active_power.phase_b'] },
      { phase: 'C' as const, aliases: ['active_power_ct3', 'ct.active_power.phase_c'] }
    ]
    const alarms = phases.flatMap(({ phase, aliases }) => {
      const points = rows
        .filter((row) => metricMatches(row.metricKey, aliases) && row.valueNumber !== null)
        .sort((left, right) => left.reportedAt.getTime() - right.reportedAt.getTime())
      const intervals: ReverseFlowAlertItem[] = []
      let active: { startedAt: Date; minimumPower: number; sampleCount: number } | null = null
      for (const point of points) {
        const value = point.valueNumber
        if (value === null) continue
        if (value < 0) {
          if (!active) active = { startedAt: point.reportedAt, minimumPower: value, sampleCount: 0 }
          active.minimumPower = Math.min(active.minimumPower, value)
          active.sampleCount += 1
          continue
        }
        if (active) {
          intervals.push({
            phase, sampleCount: active.sampleCount, minimumPower: active.minimumPower, severity: 'critical',
            startedAt: active.startedAt.toISOString(), endedAt: point.reportedAt.toISOString(),
            durationMinutes: Math.max(0, Math.round((point.reportedAt.getTime() - active.startedAt.getTime()) / 60_000))
          })
          active = null
        }
      }
      if (active) {
        intervals.push({
          phase, sampleCount: active.sampleCount, minimumPower: active.minimumPower, severity: 'critical',
          startedAt: active.startedAt.toISOString(), endedAt: null,
          durationMinutes: Math.max(0, Math.round((endAt.getTime() - active.startedAt.getTime()) / 60_000))
        })
      }
      return intervals
    })

    return {
      deviceSn,
      days: parsed.days,
      alerts: alarms.sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    }
  }

  /** 以设备最新上报时间为窗口终点，避免离线历史数据相对墙钟“过期”后只剩尾段。 */
  private async resolveChartWindow(deviceSn: string, days: number, inverterIndex?: number) {
    const latest = await this.telemetryRepository.getLatestReportedAt({
      deviceSn,
      inverterIndex
    })
    const endAt = latest ?? new Date()
    const startAt = new Date(endAt)
    startAt.setDate(endAt.getDate() - days)
    return { startAt, endAt }
  }

  private toChartSeries(
    rows: Array<{ metricKey: string; valueNumber: number | null; valueText: string | null; reportedAt: Date }>,
    definitions: MetricDefinition[]
  ): ChartSeries[] {
    return definitions.map((definition) => ({
      key: definition.key,
      label: definition.label,
      unit: definition.unit,
      color: definition.color,
      markNegative: definition.markNegative,
      step: definition.step,
      points: rows
        .filter((row) => metricMatches(row.metricKey, definition.aliases) && row.valueNumber !== null)
        .map((row) => [row.reportedAt.toISOString(), row.valueNumber as number])
    }))
  }
}
