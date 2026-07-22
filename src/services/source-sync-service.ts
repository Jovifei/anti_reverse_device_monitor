import { Prisma, PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { CompanySourceAdapterStub } from '@/src/adapters/source-db/company-source-adapter.stub'
import { getSourceRuntimeConfig } from '@/src/adapters/source-db/config'
import { redactSourceError } from '@/src/adapters/source-db/security'
import type { SourceCursor, SourceTelemetryAdapter, SourceTelemetryRecord } from '@/src/adapters/source-db/types'
import { metricDefinitions } from '@/src/domain/dictionaries'
import { DeviceRepository } from '@/src/repositories/device-repository'
import { TelemetryRepository } from '@/src/repositories/telemetry-repository'
import { prisma } from '@/src/lib/prisma'

const sourceRecordSchema = z.object({ sourceRecordId: z.string().min(1), deviceSn: z.string().min(1), siid: z.string().min(1), piid: z.string().min(1), inverterIndex: z.number().int().min(1).max(8).nullable(), reportedAt: z.coerce.date(), receivedAt: z.coerce.date(), value: z.union([z.string(), z.number(), z.boolean(), z.null()]), metricKey: z.string().min(1).optional() })
export type SourceSyncOptions = { sourceName?: string; from?: Date; to?: Date; sn?: string; dryRun?: boolean; batchSize?: number }
export type SourceSyncResult = { status: 'completed' | 'dry-run' | 'failed'; sourceName: string; imported: number; duplicatesSkipped: number; failed: number; unknownMetrics: number; missingIdentifiers: number; checkpoint: SourceCursor | null; error?: { code: string; message: string } }
function metricKeyFor(record: SourceTelemetryRecord) { if (record.metricKey) return record.metricKey.trim().toLowerCase(); const known = metricDefinitions.find((definition) => String(definition.siid) === record.siid && String(definition.piid) === record.piid); return known?.metric_key ?? `siid:${record.siid}:piid:${record.piid}` }
function parseCursor(raw: string | null): SourceCursor | undefined { if (!raw) return undefined; try { const value = JSON.parse(raw) as SourceCursor; return value.reportedAt && value.sourceRecordId ? value : undefined } catch { return undefined } }

export class SourceSyncService {
  constructor(private readonly adapter: SourceTelemetryAdapter, private readonly db: PrismaClient = prisma) {}
  async sync(options: SourceSyncOptions = {}): Promise<SourceSyncResult> {
    const config = getSourceRuntimeConfig(); const sourceName = options.sourceName ?? config.sourceName; const batchSize = options.batchSize ?? config.batchSize; const to = options.to ?? new Date()
    const checkpoint = await this.db.syncCheckpoint.findUnique({ where: { sourceName } }); let cursor = options.from ? undefined : parseCursor(checkpoint?.sourceCursor ?? null); const from = options.from ?? (cursor ? new Date(cursor.reportedAt) : new Date(to.getTime() - config.lookbackDays * 86_400_000))
    const batch = await this.db.syncBatch.create({ data: { sourceName, status: 'running', startedAt: new Date(), cursorBefore: cursor ? JSON.stringify(cursor) : null } }); const totals = { imported: 0, duplicatesSkipped: 0, failed: 0, unknownMetrics: 0, missingIdentifiers: 0 }; let lastCursor: SourceCursor | null = cursor ?? null
    try {
      while (true) {
        const page = await this.adapter.fetchTelemetry({ cursor, from, to, limit: batchSize }); if (page.records.length === 0) break
        for (const raw of page.records) {
          const parsed = sourceRecordSchema.safeParse(raw); if (!parsed.success) { totals.failed += 1; totals.missingIdentifiers += 1; continue }
          const row = parsed.data; if (options.sn && row.deviceSn !== options.sn) continue; const key = metricKeyFor(row); if (key.startsWith('siid:')) totals.unknownMetrics += 1; lastCursor = { reportedAt: row.reportedAt.toISOString(), sourceRecordId: row.sourceRecordId }; if (options.dryRun) { totals.imported += 1; continue }
          try {
            const deviceRepo = new DeviceRepository(this.db); const telemetryRepo = new TelemetryRepository(this.db); const device = await deviceRepo.upsertDevice({ deviceSn: row.deviceSn }); if (row.inverterIndex) await deviceRepo.findOrCreateInverterBinding({ deviceId: device.id, inverterIndex: row.inverterIndex })
            const numeric = typeof row.value === 'number' ? row.value : Number.parseFloat(String(row.value)); await telemetryRepo.upsertBatch([{ deviceSn: row.deviceSn, inverterIndex: row.inverterIndex, siid: row.siid, piid: row.piid, metricKey: key, reportedAt: row.reportedAt, receivedAt: row.receivedAt, valueNumber: Number.isFinite(numeric) ? numeric : null, valueText: typeof row.value === 'string' ? row.value : row.value === null ? null : String(row.value), sourceRecordId: `${sourceName}:${row.sourceRecordId}`, sourceName }]); totals.imported += 1
          } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { totals.duplicatesSkipped += 1; continue }
            totals.failed += 1; const safe = redactSourceError(error); await this.db.syncError.create({ data: { syncBatchId: batch.id, sourceRecordId: row.sourceRecordId, errorCode: safe.code, message: safe.message } })
          }
        }
        cursor = page.nextCursor; if (!page.hasMore || !cursor) break
      }
      if (!options.dryRun) await this.db.syncCheckpoint.upsert({ where: { sourceName }, create: { sourceName, sourceCursor: lastCursor ? JSON.stringify(lastCursor) : '', status: 'ok', lastSuccessAt: new Date(), lastError: null }, update: { sourceCursor: lastCursor ? JSON.stringify(lastCursor) : checkpoint?.sourceCursor ?? '', status: 'ok', syncedAt: new Date(), lastSuccessAt: new Date(), lastError: null } })
      await this.db.syncBatch.update({ where: { id: batch.id }, data: { status: options.dryRun ? 'dry-run' : 'completed', completedAt: new Date(), cursorAfter: lastCursor ? JSON.stringify(lastCursor) : null, ...totals } }); return { status: options.dryRun ? 'dry-run' : 'completed', sourceName, ...totals, checkpoint: lastCursor }
    } catch (error) {
      const safe = redactSourceError(error); await this.db.syncCheckpoint.upsert({ where: { sourceName }, create: { sourceName, sourceCursor: checkpoint?.sourceCursor ?? '', status: 'failed', lastError: safe.message }, update: { status: 'failed', lastError: safe.message } }); await this.db.syncBatch.update({ where: { id: batch.id }, data: { status: 'failed', completedAt: new Date(), ...totals, lastError: safe.message } }); return { status: 'failed', sourceName, ...totals, checkpoint: lastCursor, error: safe }
    } finally { await this.adapter.close?.() }
  }
}
export function createConfiguredSourceAdapter() { const config = getSourceRuntimeConfig(); return new CompanySourceAdapterStub({ enabled: config.enabled, queryTimeoutMs: config.queryTimeoutMs, sourceName: config.sourceName, sourceType: config.sourceType }) }
