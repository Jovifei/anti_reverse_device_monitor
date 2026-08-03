/**
 * Re-pull every registry device with a full lookback window (ignore shared checkpoint).
 * Use after expanding the SN map so quieter devices are not starved by chatty ones.
 * Retries on transient Mongo disconnects so one closed connection does not leave week-long holes.
 */
import { loadLocalEnvironment } from '@/src/adapters/source-db/config'
import { loadDeviceRegistry } from '@/src/adapters/source-db/device-registry'
import { prisma } from '@/src/lib/prisma'
import { createConfiguredSourceAdapter, SourceSyncService } from '@/src/services/source-sync-service'

function value(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTransientSyncError(message: string) {
  const lower = message.toLowerCase()
  return (
    lower.includes('connection') ||
    lower.includes('closed') ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('econnreset') ||
    lower.includes('socket') ||
    lower.includes('network')
  )
}

async function main() {
  loadLocalEnvironment()
  if (process.env.SOURCE_DB_ENABLED !== 'true') {
    throw new Error('SOURCE_DB_ENABLED must be true')
  }
  if (!process.env.APP_DATABASE_URL) {
    throw new Error('APP_DATABASE_URL is required')
  }

  const lookbackDays = Math.max(1, Number(value('--days') || process.env.SOURCE_INITIAL_LOOKBACK_DAYS || 7))
  const maxAttempts = Math.max(1, Number(value('--retries') || 3))
  const onlyRaw = value('--sns')
  const onlySet = onlyRaw
    ? new Set(
        onlyRaw
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      )
    : null
  const to = new Date()
  const from = new Date(to.getTime() - lookbackDays * 86_400_000)
  const { registry, path: registryPath } = loadDeviceRegistry()
  const devices = registry.devices.filter((item) => {
    if (!item.device_id?.trim()) return false
    if (!onlySet) return true
    return onlySet.has(item.sn || '') || onlySet.has(item.device_id)
  })

  console.error(
    `[source:resync-all] registry=${registryPath} devices=${devices.length} window=${from.toISOString()} → ${to.toISOString()} retries=${maxAttempts}${
      onlySet ? ` sns=${[...onlySet].join(',')}` : ''
    }`
  )

  const summary: Array<{
    sn?: string
    device_id: string
    status: string
    imported: number
    failed: number
    attempts: number
  }> = []

  for (const [index, entry] of devices.entries()) {
    const label = entry.sn || entry.device_id
    console.error(`[source:resync-all] (${index + 1}/${devices.length}) ${label} device_id=${entry.device_id}`)

    let lastResult: { status: string; imported: number; failed: number } | null = null
    let attempts = 0
    let lastError = ''

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      attempts = attempt
      try {
        const adapter = createConfiguredSourceAdapter({ deviceId: entry.device_id })
        const result = await new SourceSyncService(adapter).sync({
          from,
          to,
          ignoreCheckpoint: true
        })
        lastResult = {
          status: result.status,
          imported: result.imported,
          failed: result.failed
        }
        if (result.status !== 'failed') break
        lastError = `sync status=failed imported=${result.imported}`
        if (attempt < maxAttempts) {
          const waitMs = attempt * 5_000
          console.error(`[source:resync-all] ${label} failed attempt ${attempt}/${maxAttempts}; retry in ${waitMs}ms`)
          await sleep(waitMs)
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        lastResult = { status: 'failed', imported: lastResult?.imported ?? 0, failed: 0 }
        const retryable = isTransientSyncError(lastError)
        console.error(`[source:resync-all] ${label} error attempt ${attempt}/${maxAttempts}: ${lastError}`)
        if (!retryable || attempt >= maxAttempts) break
        const waitMs = attempt * 5_000
        console.error(`[source:resync-all] ${label} transient disconnect; retry in ${waitMs}ms`)
        await sleep(waitMs)
      }
    }

    const row = {
      sn: entry.sn,
      device_id: entry.device_id,
      status: lastResult?.status ?? 'failed',
      imported: lastResult?.imported ?? 0,
      failed: lastResult?.failed ?? 0,
      attempts
    }
    summary.push(row)
    console.error(
      `[source:resync-all] ${label} → status=${row.status} imported=${row.imported} failed=${row.failed} attempts=${row.attempts}${
        row.status === 'failed' && lastError ? ` error=${lastError}` : ''
      }`
    )
  }

  console.log(JSON.stringify({ status: 'ok', lookbackDays, from, to, maxAttempts, summary }, null, 2))
  await prisma.$disconnect()
  if (summary.some((item) => item.status === 'failed')) process.exitCode = 1
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error))
  await prisma.$disconnect().catch(() => undefined)
  process.exitCode = 1
})
