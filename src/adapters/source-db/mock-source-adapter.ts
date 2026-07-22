import type { DeviceQuery, SourceCursor, SourceDevice, SourceDeviceProperties, SourceHealthResult, SourceInverterProperties, SourceTelemetryAdapter, SourceTelemetryBatch, SourceTelemetryRecord } from './types'

export function compareSourceCursor(left: SourceCursor, right: SourceCursor) {
  const byTime = left.reportedAt.localeCompare(right.reportedAt)
  return byTime !== 0 ? byTime : left.sourceRecordId.localeCompare(right.sourceRecordId)
}

function cursorFor(record: SourceTelemetryRecord): SourceCursor {
  return { reportedAt: record.reportedAt.toISOString(), sourceRecordId: record.sourceRecordId }
}

export class MockSourceAdapter implements SourceTelemetryAdapter {
  constructor(private readonly records: SourceTelemetryRecord[] = [], private readonly devices: SourceDevice[] = [], private readonly properties: Record<string, Record<string, string | number | boolean | null>> = {}) {}
  async healthCheck(): Promise<SourceHealthResult> {
    const latest = this.sortedRecords().at(-1)
    return { healthy: true, source: 'mock-source', detail: 'fixture adapter', checkedAt: new Date(), lastRecordAt: latest?.reportedAt ?? null }
  }
  async fetchDevices({ cursor, limit }: DeviceQuery): Promise<SourceDevice[]> {
    const start = cursor ? this.devices.findIndex((item) => item.sourceRecordId === cursor) + 1 : 0
    return this.devices.slice(Math.max(0, start), Math.max(0, start) + limit)
  }
  async fetchTelemetry({ cursor, from, to, limit }: { cursor?: SourceCursor; from: Date; to: Date; limit: number }): Promise<SourceTelemetryBatch> {
    const startedAt = Date.now()
    const filtered = this.sortedRecords().filter((item) => item.reportedAt >= from && item.reportedAt <= to).filter((item) => !cursor || compareSourceCursor(cursorFor(item), cursor) > 0)
    const records = filtered.slice(0, limit)
    const last = records.at(-1)
    return { records, nextCursor: last ? cursorFor(last) : undefined, hasMore: filtered.length > records.length, queryDurationMs: Date.now() - startedAt }
  }
  async fetchDeviceProperties(sn: string): Promise<SourceDeviceProperties> { return { deviceSn: sn, properties: this.properties[`device:${sn}`] ?? {} } }
  async fetchInverterProperties(sn: string, inverterIndex: number): Promise<SourceInverterProperties> { return { deviceSn: sn, inverterIndex, properties: this.properties[`inverter:${sn}:${inverterIndex}`] ?? {} } }
  private sortedRecords() { return [...this.records].sort((left, right) => compareSourceCursor(cursorFor(left), cursorFor(right))) }
}
