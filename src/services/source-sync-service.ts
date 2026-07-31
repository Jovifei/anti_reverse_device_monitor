import { Prisma, PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { CompanySourceAdapterStub } from '@/src/adapters/source-db/company-source-adapter.stub'
import { getSourceRuntimeConfig } from '@/src/adapters/source-db/config'
import { createMongoLogSourceAdapterFromEnv } from '@/src/adapters/source-db/mongo-log-source-adapter'
import { redactSourceError } from '@/src/adapters/source-db/security'
import type { SourceCursor, SourceTelemetryAdapter, SourceTelemetryRecord } from '@/src/adapters/source-db/types'
import { metricDefinitions } from '@/src/domain/dictionaries'
import { DeviceRepository } from '@/src/repositories/device-repository'
import { TelemetryRepository } from '@/src/repositories/telemetry-repository'
import { prisma } from '@/src/lib/prisma'

const sourceRecordSchema = z.object({
  sourceRecordId: z.string().min(1),
  deviceSn: z.string().min(1),
  sourceDeviceId: z.string().min(1).optional(),
  siid: z.string().min(1),
  piid: z.string().min(1),
  inverterIndex: z.number().int().min(1).max(8).nullable(),
  reportedAt: z.coerce.date(),
  receivedAt: z.coerce.date(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  metricKey: z.string().min(1).optional()
})

export type SourceSyncOptions = {
  sourceName?: string
  from?: Date
  to?: Date
  sn?: string
  dryRun?: boolean
  batchSize?: number
  /** When true (e.g. `--device-id` sync), skip shared checkpoint so one device cannot collapse another's window. */
  ignoreCheckpoint?: boolean
}

export type SourceSyncResult = {
  status: 'completed' | 'dry-run' | 'failed'
  sourceName: string
  imported: number
  duplicatesSkipped: number
  failed: number
  unknownMetrics: number
  missingIdentifiers: number
  checkpoint: SourceCursor | null
  error?: { code: string; message: string }
}

const WRITE_CHUNK = 100

function metricKeyFor(record: SourceTelemetryRecord) {
  if (record.metricKey) return record.metricKey.trim().toLowerCase()
  const known = metricDefinitions.find(
    (definition) => String(definition.siid) === record.siid && String(definition.piid) === record.piid
  )
  return known?.metric_key ?? `siid:${record.siid}:piid:${record.piid}`
}

function parseCursor(raw: string | null): SourceCursor | undefined {
  if (!raw) return undefined
  try {
    const value = JSON.parse(raw) as SourceCursor
    return value.reportedAt && value.sourceRecordId ? value : undefined
  } catch {
    return undefined
  }
}

function logProgress(message: string) {
  console.error(`[source:sync] ${message}`)
}

export class SourceSyncService {
  constructor(
    private readonly adapter: SourceTelemetryAdapter,
    private readonly db: PrismaClient = prisma
  ) {}

  async sync(options: SourceSyncOptions = {}): Promise<SourceSyncResult> {
    const config = getSourceRuntimeConfig()
    const sourceName = options.sourceName ?? config.sourceName
    const batchSize = options.batchSize ?? config.batchSize
    const to = options.to ?? new Date()
    const checkpoint = options.ignoreCheckpoint
      ? null
      : await this.db.syncCheckpoint.findUnique({ where: { sourceName } })
    let cursor = options.from || options.ignoreCheckpoint ? undefined : parseCursor(checkpoint?.sourceCursor ?? null)
    const from =
      options.from ??
      (cursor ? new Date(cursor.reportedAt) : new Date(to.getTime() - config.lookbackDays * 86_400_000))

    logProgress(
      `window ${from.toISOString()} → ${to.toISOString()} (${options.ignoreCheckpoint ? 'lookback/device-scoped' : 'lookback/checkpoint'})`
    )

    const batch = await this.db.syncBatch.create({
      data: {
        sourceName,
        status: 'running',
        startedAt: new Date(),
        cursorBefore: cursor ? JSON.stringify(cursor) : null
      }
    })
    const totals = {
      imported: 0,
      duplicatesSkipped: 0,
      failed: 0,
      unknownMetrics: 0,
      missingIdentifiers: 0
    }
    let lastCursor: SourceCursor | null = cursor ?? null
    let pageIndex = 0

    try {
      while (true) {
        pageIndex += 1
        logProgress(`fetching Mongo page ${pageIndex}…`)
        const started = Date.now()
        const page = await this.adapter.fetchTelemetry({ cursor, from, to, limit: batchSize })
        logProgress(`page ${pageIndex}: got ${page.records.length} rows in ${Date.now() - started}ms`)

        if (page.records.length === 0) break

        const seenIds = new Set<string>()
        const pending: Array<{
          deviceSn: string
          sourceDeviceId?: string
          inverterIndex: number | null
          siid: string
          piid: string
          metricKey: string
          reportedAt: Date
          receivedAt: Date
          valueNumber: number | null
          valueText: string | null
          sourceRecordId: string
        }> = []

        for (const raw of page.records) {
          const parsed = sourceRecordSchema.safeParse(raw)
          if (!parsed.success) {
            totals.failed += 1
            totals.missingIdentifiers += 1
            continue
          }
          const row = parsed.data
          if (options.sn && row.deviceSn !== options.sn) continue

          const scopedId = `${sourceName}:${row.sourceRecordId}`
          if (seenIds.has(scopedId)) {
            totals.duplicatesSkipped += 1
            continue
          }
          seenIds.add(scopedId)

          const key = metricKeyFor(row)
          if (key.startsWith('siid:')) totals.unknownMetrics += 1
          lastCursor = { reportedAt: row.reportedAt.toISOString(), sourceRecordId: row.sourceRecordId }

          if (options.dryRun) {
            totals.imported += 1
            continue
          }

          const numeric =
            typeof row.value === 'boolean'
              ? row.value
                ? 1
                : 0
              : typeof row.value === 'number'
                ? row.value
                : Number.parseFloat(String(row.value))
          pending.push({
            deviceSn: row.deviceSn,
            sourceDeviceId: row.sourceDeviceId,
            inverterIndex: row.inverterIndex,
            siid: row.siid,
            piid: row.piid,
            metricKey: key,
            reportedAt: row.reportedAt,
            receivedAt: row.receivedAt,
            valueNumber: Number.isFinite(numeric) ? numeric : null,
            valueText:
              typeof row.value === 'boolean'
                ? row.value
                  ? '1'
                  : '0'
                : typeof row.value === 'string'
                  ? row.value
                  : row.value === null
                    ? null
                    : String(row.value),
            sourceRecordId: scopedId
          })
        }

        if (!options.dryRun && pending.length > 0) {
          const deviceRepo = new DeviceRepository(this.db)
          const telemetryRepo = new TelemetryRepository(this.db)
          const devices = new Map<string, { sourceDeviceId?: string }>()
          for (const row of pending) {
            devices.set(row.deviceSn, { sourceDeviceId: row.sourceDeviceId })
          }
          for (const [deviceSn, meta] of devices) {
            const device = await deviceRepo.upsertDevice({
              deviceSn,
              ...(meta.sourceDeviceId ? { productModel: meta.sourceDeviceId } : {})
            })
            const indexes = new Set(
              pending.filter((row) => row.deviceSn === deviceSn && row.inverterIndex).map((row) => row.inverterIndex as number)
            )
            for (const inverterIndex of indexes) {
              await deviceRepo.findOrCreateInverterBinding({ deviceId: device.id, inverterIndex })
            }
          }

          for (let offset = 0; offset < pending.length; offset += WRITE_CHUNK) {
            const chunk = pending.slice(offset, offset + WRITE_CHUNK)
            try {
              await telemetryRepo.upsertBatch(
                chunk.map((row) => ({
                  deviceSn: row.deviceSn,
                  inverterIndex: row.inverterIndex,
                  siid: row.siid,
                  piid: row.piid,
                  metricKey: row.metricKey,
                  reportedAt: row.reportedAt,
                  receivedAt: row.receivedAt,
                  valueNumber: row.valueNumber,
                  valueText: row.valueText,
                  sourceRecordId: row.sourceRecordId,
                  sourceName
                }))
              )
              totals.imported += chunk.length
              logProgress(`written ${totals.imported} rows (page ${pageIndex})`)
            } catch (error) {
              if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                totals.duplicatesSkipped += chunk.length
                continue
              }
              totals.failed += chunk.length
              const safe = redactSourceError(error)
              await this.db.syncError.create({
                data: {
                  syncBatchId: batch.id,
                  sourceRecordId: chunk[0]?.sourceRecordId ?? 'chunk',
                  errorCode: safe.code,
                  message: safe.message
                }
              })
            }
          }
        }

        cursor = page.nextCursor
        if (!page.hasMore || !cursor) break
      }

      // Per-device sync must not advance the shared source checkpoint.
      if (!options.dryRun && !options.ignoreCheckpoint) {
        await this.db.syncCheckpoint.upsert({
          where: { sourceName },
          create: {
            sourceName,
            sourceCursor: lastCursor ? JSON.stringify(lastCursor) : '',
            status: 'ok',
            lastSuccessAt: new Date(),
            lastError: null
          },
          update: {
            sourceCursor: lastCursor ? JSON.stringify(lastCursor) : checkpoint?.sourceCursor ?? '',
            status: 'ok',
            syncedAt: new Date(),
            lastSuccessAt: new Date(),
            lastError: null
          }
        })
      }

      await this.db.syncBatch.update({
        where: { id: batch.id },
        data: {
          status: options.dryRun ? 'dry-run' : 'completed',
          completedAt: new Date(),
          cursorAfter: lastCursor ? JSON.stringify(lastCursor) : null,
          ...totals
        }
      })

      logProgress(`done status=${options.dryRun ? 'dry-run' : 'completed'} imported=${totals.imported}`)
      return {
        status: options.dryRun ? 'dry-run' : 'completed',
        sourceName,
        ...totals,
        checkpoint: lastCursor
      }
    } catch (error) {
      const safe = redactSourceError(error)
      logProgress(`failed: ${safe.message}`)
      if (!options.ignoreCheckpoint) {
        await this.db.syncCheckpoint.upsert({
          where: { sourceName },
          create: {
            sourceName,
            sourceCursor: checkpoint?.sourceCursor ?? '',
            status: 'failed',
            lastError: safe.message
          },
          update: { status: 'failed', lastError: safe.message }
        })
      }
      await this.db.syncBatch.update({
        where: { id: batch.id },
        data: { status: 'failed', completedAt: new Date(), ...totals, lastError: safe.message }
      })
      return { status: 'failed', sourceName, ...totals, checkpoint: lastCursor, error: safe }
    } finally {
      await this.adapter.close?.()
    }
  }
}

export function createConfiguredSourceAdapter() {
  const config = getSourceRuntimeConfig()
  if (config.sourceType === 'mongodb') {
    return createMongoLogSourceAdapterFromEnv({
      enabled: config.enabled,
      queryTimeoutMs: config.queryTimeoutMs,
      sourceName: config.sourceName
    })
  }
  return new CompanySourceAdapterStub({
    enabled: config.enabled,
    queryTimeoutMs: config.queryTimeoutMs,
    sourceName: config.sourceName,
    sourceType: config.sourceType
  })
}
