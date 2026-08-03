import { describe, expect, it } from 'vitest'
import {
  allocateSyncPageBudgets,
  composeDeviceLogDrivenPage,
  timeSpanOfRecords
} from '@/src/adapters/source-db/telemetry-page-compose'
import type { SourceTelemetryRecord } from '@/src/adapters/source-db/types'

function row(partial: {
  id: string
  at: string
  metricKey: string
  value?: number
}): SourceTelemetryRecord {
  const reportedAt = new Date(partial.at)
  return {
    sourceRecordId: partial.id,
    deviceSn: 'GC2001000000038',
    siid: '2',
    piid: '9',
    inverterIndex: null,
    reportedAt,
    receivedAt: reportedAt,
    value: partial.value ?? 1,
    metricKey: partial.metricKey
  }
}

describe('allocateSyncPageBudgets', () => {
  it('keeps most of the page for device_log', () => {
    expect(allocateSyncPageBudgets(1000)).toEqual({ wifiBudget: 50, logBudget: 950 })
    expect(allocateSyncPageBudgets(10)).toEqual({ wifiBudget: 1, logBudget: 9 })
    expect(allocateSyncPageBudgets(1)).toEqual({ wifiBudget: 0, logBudget: 1 })
  })
})

describe('composeDeviceLogDrivenPage', () => {
  it('does not let dense WiFi steal the pagination cursor from device_log', () => {
    const wifi = Array.from({ length: 200 }, (_, i) =>
      row({
        id: `wifi-${i}`,
        at: new Date(Date.parse('2026-08-03T12:00:00.000Z') - i * 60_000).toISOString(),
        metricKey: 'wifi_signal_strength',
        value: 80
      })
    )
    const log = Array.from({ length: 15 }, (_, i) =>
      row({
        id: `log-${i}`,
        at: new Date(Date.parse('2026-08-03T11:00:00.000Z') - i * 3_600_000).toISOString(),
        metricKey: i % 2 === 0 ? 'load_power' : 'inverter_total_power',
        value: 100 + i
      })
    )

    const page1 = composeDeviceLogDrivenPage({
      logRecords: log,
      logHasMore: false,
      wifiRecords: wifi,
      limit: 10
    })

    const logOnPage = page1.records.filter((item) => item.metricKey !== 'wifi_signal_strength')
    const wifiOnPage = page1.records.filter((item) => item.metricKey === 'wifi_signal_strength')
    expect(logOnPage).toHaveLength(9)
    expect(wifiOnPage).toHaveLength(1)
    expect(page1.hasMore).toBe(true)
    // Cursor must be from device_log (9th newest = log-8), never from WiFi flood
    expect(page1.nextCursor?.sourceRecordId).toBe('log-8')
    expect(page1.nextCursor?.sourceRecordId.startsWith('wifi-')).toBe(false)

    // Older logs remain reachable on a subsequent page (not skipped by WiFi cursor)
    const older = log.slice(9)
    const page2 = composeDeviceLogDrivenPage({
      logRecords: older,
      logHasMore: false,
      wifiRecords: wifi,
      limit: 10
    })
    expect(page2.records.some((item) => item.sourceRecordId === 'log-14')).toBe(true)
    expect(page2.hasMore).toBe(false)
  })

  it('reports hasMore when log overflow exists even if WiFi is empty', () => {
    const log = Array.from({ length: 20 }, (_, i) =>
      row({
        id: `log-${i}`,
        at: new Date(Date.parse('2026-08-03T00:00:00.000Z') - i * 3_600_000).toISOString(),
        metricKey: 'grid_power',
        value: i
      })
    )
    const page = composeDeviceLogDrivenPage({
      logRecords: log,
      logHasMore: false,
      wifiRecords: [],
      limit: 10
    })
    expect(page.records).toHaveLength(10)
    expect(page.hasMore).toBe(true)
    expect(page.nextCursor?.sourceRecordId).toBe('log-9')
  })
})

describe('timeSpanOfRecords', () => {
  it('returns null for empty input', () => {
    expect(timeSpanOfRecords([])).toBeNull()
  })

  it('returns min/max reportedAt', () => {
    const span = timeSpanOfRecords([
      row({ id: 'a', at: '2026-08-01T00:00:00.000Z', metricKey: 'load_power' }),
      row({ id: 'b', at: '2026-08-03T00:00:00.000Z', metricKey: 'load_power' })
    ])
    expect(span?.from.toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(span?.to.toISOString()).toBe('2026-08-03T00:00:00.000Z')
  })
})
