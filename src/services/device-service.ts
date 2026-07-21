import { decodeFaultMask, hasCriticalFault } from '@/src/domain/faults'
import { parseDeviceListQuery, parseSn, parseTelemetryQuery } from '@/src/domain/validation'
import { DeviceRepository } from '@/src/repositories/device-repository'
import { TelemetryRepository } from '@/src/repositories/telemetry-repository'
import {
  ConnectivitySummary,
  TelemetryService,
  type InverterHistorySummary
} from '@/src/services/telemetry-service'

export interface DeviceListResponse {
  total: number
  items: {
    id: number
    deviceSn: string
    productModel: string | null
    platformOnline: boolean
    lastReportedAt: Date | null
    inverterCount: number
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
  metricKey: string
  sampleCount: number
  minimumPower: number
  maximumReversePower: number
  severity: 'low' | 'critical'
  firstAt: string
  lastAt: string
}

export interface DeviceHistorySummary {
  deviceSn: string
  platform: ConnectivitySummary
  inverters: InverterHistorySummary[]
  windowStart: string
  windowEnd: string
}

const REVERSE_FLOW_THRESHOLD = -1000

const OFFLINE_THRESHOLD_MINUTES = 15

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
    const { items, total } = await this.repo.findManyWithKeyword({
      page: parsed.page,
      pageSize: parsed.pageSize,
      keyword: parsed.q
    })

    return {
      items,
      total,
      page: parsed.page,
      pageSize: parsed.pageSize
    } as DeviceListResponse
  }

  async getDeviceSummary(sn: string) {
    return this.repo.findBySn(parseSn(sn))
  }

  async getDeviceHealth(sn: string): Promise<DeviceHealthSummary | null> {
    const device = await this.repo.findHealthSnapshot(parseSn(sn))
    if (!device) {
      return null
    }

    const inverterRows = await Promise.all(
      device.inverterBindings.map(async (binding) => {
        const latestRows = await this.telemetryRepository.listLatest({
          deviceSn: device.deviceSn,
          inverterIndex: binding.inverterIndex,
          page: 1,
          pageSize: 1
        })

        const latest = latestRows[0]
        const lastSeen = latest?.reportedAt ?? null
        const isOnline = Boolean(
          lastSeen && toMinutesSince(lastSeen) <= OFFLINE_THRESHOLD_MINUTES
        )

        return {
          inverterIndex: binding.inverterIndex,
          inverterSn: binding.inverterSn ?? null,
          lastSeenAt: lastSeen ? lastSeen.toISOString() : null,
          offlineMinutes: lastSeen ? toMinutesSince(lastSeen) : null,
          isOnline
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

  async getReverseFlowAlarms(sn: string, rawQuery: unknown) {
    const parsed = parseTelemetryQuery(rawQuery)
    const now = new Date()
    const startAt = new Date(now)
    startAt.setDate(now.getDate() - parsed.days)
    const deviceSn = parseSn(sn)

    const rows = await this.telemetryRepository.listTelemetryByMetricContains({
      deviceSn,
      metricKeyContains: 'power',
      startAt,
      endAt: now
    })

    const alarms = new Map<string, ReverseFlowAlertItem>()

    for (const row of rows) {
      if (row.valueNumber === null || row.valueNumber >= 0) {
        continue
      }
      const key = row.metricKey
      const existing = alarms.get(key)
      if (!existing) {
        alarms.set(key, {
          metricKey: key,
          sampleCount: 1,
          minimumPower: row.valueNumber,
          maximumReversePower: row.valueNumber,
          severity: row.valueNumber <= REVERSE_FLOW_THRESHOLD ? 'critical' : 'low',
          firstAt: row.reportedAt.toISOString(),
          lastAt: row.reportedAt.toISOString()
        })
        continue
      }

      existing.sampleCount += 1
      existing.minimumPower = Math.min(existing.minimumPower, row.valueNumber)
      existing.maximumReversePower = Math.max(existing.maximumReversePower, row.valueNumber)
      existing.lastAt = row.reportedAt.toISOString()
      if (row.valueNumber <= REVERSE_FLOW_THRESHOLD) {
        existing.severity = 'critical'
      }
    }

    return {
      deviceSn,
      days: parsed.days,
      alerts: Array.from(alarms.values())
    }
  }
}
