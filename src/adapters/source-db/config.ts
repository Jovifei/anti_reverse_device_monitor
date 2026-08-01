import fs from 'node:fs'
import path from 'node:path'

export type SourceRuntimeConfig = {
  enabled: boolean
  sourceType: string
  sourceName: string
  timezone: string
  queryTimeoutMs: number
  batchSize: number
  lookbackDays: number
  syncIntervalSeconds: number
}

export function loadLocalEnvironment(root = process.cwd()) {
  const file = path.join(root, '.env.local')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function getSourceRuntimeConfig(): SourceRuntimeConfig {
  return {
    enabled: process.env.SOURCE_DB_ENABLED === 'true',
    sourceType: process.env.SOURCE_DB_TYPE?.trim().toLowerCase() ?? '',
    sourceName: process.env.SOURCE_DB_VIEW?.trim() || 'company-source',
    timezone: process.env.SOURCE_DB_TIMEZONE?.trim() || 'Asia/Shanghai',
    queryTimeoutMs: positiveInt(process.env.SOURCE_QUERY_TIMEOUT_SECONDS, 15) * 1000,
    batchSize: positiveInt(process.env.SOURCE_SYNC_BATCH_SIZE, 1000),
    lookbackDays: positiveInt(process.env.SOURCE_INITIAL_LOOKBACK_DAYS, 7),
    syncIntervalSeconds: positiveInt(process.env.SOURCE_SYNC_INTERVAL_SECONDS, 10)
  }
}
