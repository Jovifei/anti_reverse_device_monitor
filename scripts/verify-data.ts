import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { prisma } from '@/src/lib/prisma'
import { metricDefinitions } from '@/src/domain/dictionaries'
import { getRetentionDays } from '@/scripts/cleanup-retention'

export async function verifyData() {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - getRetentionDays())
  const [deviceCount, inverterCount, telemetryCount, telemetryTimeRange, deviceEventCount, faultEventCount, reverseFlowAlertCount, expiredTelemetryCount, missingIdentifiers, distinctMetrics, latestCheckpoint, latestBatch] = await Promise.all([
    prisma.device.count(), prisma.inverterBinding.count(), prisma.telemetry.count(), prisma.telemetry.aggregate({ _min: { reportedAt: true }, _max: { reportedAt: true } }), prisma.deviceEvent.count(), prisma.faultEvent.count(), prisma.reverseFlowAlert.count(),
    prisma.telemetry.count({ where: { reportedAt: { lt: cutoff } } }), prisma.telemetry.count({ where: { OR: [{ siid: '' }, { piid: '' }] } }), prisma.telemetry.findMany({ distinct: ['metricKey'], select: { metricKey: true } }), prisma.syncCheckpoint.findFirst({ orderBy: { lastSuccessAt: 'desc' } }), prisma.syncBatch.findFirst({ orderBy: { startedAt: 'desc' } })
  ])
  const knownMetrics = new Set(metricDefinitions.map((item) => item.metric_key))
  const unknownMetricCount = distinctMetrics.filter((item) => !knownMetrics.has(item.metricKey)).length
  const orphanTelemetryCount = await prisma.telemetry.count({ where: { inverterId: { not: null }, inverterBinding: { is: null } } })
  return { checks: { deviceCount, inverterCount, telemetryCount, earliestTelemetryAt: telemetryTimeRange._min.reportedAt?.toISOString() ?? null, latestTelemetryAt: telemetryTimeRange._max.reportedAt?.toISOString() ?? null, deviceEventCount, faultEventCount, reverseFlowAlertCount, expiredTelemetryCount, orphanTelemetryCount, missingSiidPiidCount: missingIdentifiers, unknownMetricCount, lastSyncSuccessAt: latestCheckpoint?.lastSuccessAt?.toISOString() ?? null, lastSourceCursor: latestCheckpoint?.sourceCursor ?? null, lastSyncStatus: latestCheckpoint?.status ?? null, latestSyncBatchStatus: latestBatch?.status ?? null, sourceToLocalLagMinutes: null, sourceDataChecks: 'requires approved source connection' } }
}

async function main() { console.log(JSON.stringify(await verifyData(), null, 2)) }
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedDirectly) main().catch((error) => { console.error(error); process.exitCode = 1 })
