export type SourceCursor = { reportedAt: string; sourceRecordId: string }

export interface SourceHealthResult {
  healthy: boolean
  source: string
  detail: string
  checkedAt: Date
  lastRecordAt?: Date | null
  queryDurationMs?: number
  errorCode?: string
}

export interface DeviceQuery { cursor?: string; limit: number }
export interface SourceDevice { sourceRecordId: string; deviceSn: string; reportedAt?: Date; receivedAt?: Date }
export interface SourceTelemetryRecord {
  sourceRecordId: string
  deviceSn: string
  siid: string
  piid: string
  inverterIndex: number | null
  reportedAt: Date
  receivedAt: Date
  value: string | number | boolean | null
  metricKey?: string
}
export interface SourceTelemetryBatch { records: SourceTelemetryRecord[]; nextCursor?: SourceCursor; hasMore: boolean; queryDurationMs?: number }
export interface SourceDeviceProperties { deviceSn: string; properties: Record<string, string | number | boolean | null>; reportedAt?: Date }
export interface SourceInverterProperties { deviceSn: string; inverterIndex: number; properties: Record<string, string | number | boolean | null>; reportedAt?: Date }

export interface SourceTelemetryAdapter {
  healthCheck(): Promise<SourceHealthResult>
  fetchDevices(params: DeviceQuery): Promise<SourceDevice[]>
  fetchTelemetry(params: { cursor?: SourceCursor; from: Date; to: Date; limit: number }): Promise<SourceTelemetryBatch>
  fetchDeviceProperties(sn: string): Promise<SourceDeviceProperties>
  fetchInverterProperties(sn: string, inverterIndex: number): Promise<SourceInverterProperties>
  close?(): Promise<void>
}
