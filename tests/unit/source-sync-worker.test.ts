import { describe, expect, it } from 'vitest'
import { startSourceSyncWorker, withSqliteBusyRetry } from '@/src/services/source-sync-worker'

const completed = {
  status: 'completed' as const,
  sourceName: 'test',
  imported: 0,
  duplicatesSkipped: 0,
  failed: 0,
  unknownMetrics: 0,
  missingIdentifiers: 0,
  checkpoint: null
}

describe('source sync worker', () => {
  it('uses bounded SQLite busy backoff', async () => {
    let attempts = 0
    const delays: number[] = []
    const value = await withSqliteBusyRetry(
      async () => {
        attempts += 1
        if (attempts < 4) throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' })
        return 'ok'
      },
      { sleep: async (milliseconds) => { delays.push(milliseconds) } }
    )

    expect(value).toBe('ok')
    expect(attempts).toBe(4)
    expect(delays).toEqual([250, 500, 1_000])
  })

  it('never overlaps cycles and stops after the current cycle', async () => {
    let active = 0
    let maximumActive = 0
    let calls = 0
    const worker = startSourceSyncWorker({
      intervalMs: 5,
      logger: () => undefined,
      sync: async () => {
        calls += 1
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await new Promise((resolve) => setTimeout(resolve, 10))
        active -= 1
        return completed
      }
    })

    await new Promise((resolve) => setTimeout(resolve, 32))
    worker.stop()
    await worker.done

    expect(calls).toBeGreaterThan(1)
    expect(maximumActive).toBe(1)
    expect(active).toBe(0)
  })
})
