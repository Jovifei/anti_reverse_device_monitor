import type { SourceCursor, SourceTelemetryBatch, SourceTelemetryRecord } from '@/src/adapters/source-db/types'

/** Reserve a small WiFi slot; device_log always keeps the rest (at least 1). */
export function allocateSyncPageBudgets(limit: number): { wifiBudget: number; logBudget: number } {
  const safeLimit = Math.max(1, Math.floor(limit))
  const wifiBudget = Math.min(50, Math.floor(safeLimit * 0.1))
  const logBudget = Math.max(1, safeLimit - wifiBudget)
  return { wifiBudget, logBudget }
}

function sortNewestFirst(left: SourceTelemetryRecord, right: SourceTelemetryRecord) {
  return right.reportedAt.getTime() - left.reportedAt.getTime() || left.sourceRecordId.localeCompare(right.sourceRecordId)
}

/**
 * Build one sync page where device_log alone drives hasMore/nextCursor.
 * WiFi is appended within wifiBudget and must never advance the pagination cursor.
 */
export function composeDeviceLogDrivenPage(params: {
  logRecords: SourceTelemetryRecord[]
  /** True when more device_log rows exist beyond logRecords (e.g. query hit per-device cap). */
  logHasMore: boolean
  wifiRecords: SourceTelemetryRecord[]
  limit: number
}): SourceTelemetryBatch {
  const { wifiBudget, logBudget } = allocateSyncPageBudgets(params.limit)
  const logSorted = [...params.logRecords].sort(sortNewestFirst)
  const wifiSorted = [...params.wifiRecords].sort(sortNewestFirst)
  const wifiPage = wifiSorted.slice(0, wifiBudget)
  // Unused WiFi slots go back to device_log so empty WiFi does not shrink the page.
  const effectiveLogBudget = Math.min(params.limit, logBudget + (wifiBudget - wifiPage.length))
  const logPage = logSorted.slice(0, effectiveLogBudget)
  const logOverflow = logSorted.length > effectiveLogBudget || params.logHasMore

  const trimmed = [...wifiPage, ...logPage].sort(sortNewestFirst).slice(0, params.limit)

  const nextCursor: SourceCursor | undefined =
    logPage.length > 0
      ? {
          reportedAt: logPage[logPage.length - 1].reportedAt.toISOString(),
          sourceRecordId: logPage[logPage.length - 1].sourceRecordId
        }
      : undefined

  return {
    records: trimmed,
    nextCursor: logOverflow ? nextCursor : undefined,
    hasMore: logOverflow
  }
}

/** Time span covered by a device_log page — used to bound opportunistic WiFi fetch. */
export function timeSpanOfRecords(records: SourceTelemetryRecord[]): { from: Date; to: Date } | null {
  if (!records.length) return null
  let min = records[0].reportedAt.getTime()
  let max = min
  for (const row of records) {
    const t = row.reportedAt.getTime()
    if (t < min) min = t
    if (t > max) max = t
  }
  return { from: new Date(min), to: new Date(max) }
}
