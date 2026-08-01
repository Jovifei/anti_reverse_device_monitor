import { redactSourceError } from '@/src/adapters/source-db/security'
import type { SourceSyncResult } from '@/src/services/source-sync-service'

export const SQLITE_BUSY_BACKOFF_MS = [250, 500, 1_000] as const

export type WorkerLogger = (message: string) => void

export function isSqliteBusyError(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  const message = error instanceof Error ? error.message : String(error)
  return code === 'SQLITE_BUSY' || code === 'P2034' || /SQLITE_BUSY|database is locked/i.test(message)
}

export async function withSqliteBusyRetry<T>(
  operation: () => Promise<T>,
  options: { sleep?: (milliseconds: number) => Promise<void>; backoffMs?: readonly number[] } = {}
): Promise<T> {
  const sleep = options.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  const backoffMs = options.backoffMs ?? SQLITE_BUSY_BACKOFF_MS
  let attempt = 0
  while (true) {
    try {
      return await operation()
    } catch (error) {
      if (!isSqliteBusyError(error) || attempt >= backoffMs.length) throw error
      await sleep(backoffMs[attempt])
      attempt += 1
    }
  }
}

class BusyResultError extends Error {
  constructor(readonly result: SourceSyncResult) {
    super(result.error?.message ?? 'SQLite sync is busy')
    this.name = 'BusyResultError'
  }
}

export type SourceSyncWorkerOptions = {
  sync: () => Promise<SourceSyncResult>
  intervalMs: number
  logger?: WorkerLogger
  sleep?: (milliseconds: number) => Promise<void>
}

export type SourceSyncWorkerHandle = {
  stop: () => void
  done: Promise<void>
}

export function startSourceSyncWorker(options: SourceSyncWorkerOptions): SourceSyncWorkerHandle {
  const logger = options.logger ?? ((message) => console.error(`[source:worker] ${message}`))
  const sleep = options.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  let stopped = false
  let wake: (() => void) | null = null

  const waitForNextCycle = () =>
    new Promise<void>((resolve) => {
      wake = resolve
      setTimeout(() => {
        wake = null
        resolve()
      }, options.intervalMs)
    })

  const done = (async () => {
    while (!stopped) {
      try {
        const result = await withSqliteBusyRetry(async () => {
          const syncResult = await options.sync()
          if (syncResult.status === 'failed' && isSqliteBusyError(syncResult.error)) {
            throw new BusyResultError(syncResult)
          }
          return syncResult
        }, { sleep })
        logger(`cycle status=${result.status} imported=${result.imported} duplicates=${result.duplicatesSkipped} failed=${result.failed}`)
      } catch (error) {
        const safe = redactSourceError(error instanceof BusyResultError ? error.result.error : error)
        logger(`cycle failed code=${safe.code} message=${safe.message}`)
      }
      if (!stopped) await waitForNextCycle()
    }
  })()

  return {
    stop: () => {
      stopped = true
      wake?.()
      wake = null
    },
    done
  }
}
