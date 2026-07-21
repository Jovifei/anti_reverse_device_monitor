export type MetricDataKind = 'timeseries' | 'state' | 'counter' | 'fault' | 'event' | 'static'

export interface NormalizedMetricRecord {
  deviceSn: string
  siid: string
  piid: string
  inverterIndex?: number | null
  inverterSn?: string | null
  reportedAt: Date
  metricKey: string
  value: string | number | null
  valueText?: string | null
  sourceRecordId: string
}

export interface SourceAdapter {
  read(): Promise<NormalizedMetricRecord[]>
}
