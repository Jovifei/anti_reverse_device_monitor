import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { prisma } from '@/src/lib/prisma'

export function getRetentionDays(value = process.env.DATA_RETENTION_DAYS): number {
  const days = Number(value ?? '7')
  return Number.isFinite(days) ? Math.max(1, Math.floor(days)) : 7
}

export async function cleanupRetention(db: PrismaClient = prisma, now = new Date(), dryRun = false) {
  const retentionDays = getRetentionDays()
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - retentionDays)
  const telemetryWhere = { reportedAt: { lt: cutoff } }
  const eventWhere = { happenedAt: { lt: cutoff } }
  const faultWhere = { startedAt: { lt: cutoff } }
  const reverseFlowWhere = { startedAt: { lt: cutoff } }
  const [telemetry, deviceEvents, faultEvents, reverseFlowAlerts] = await Promise.all([
    dryRun ? db.telemetry.count({ where: telemetryWhere }).then((count) => ({ count })) : db.telemetry.deleteMany({ where: telemetryWhere }),
    dryRun ? db.deviceEvent.count({ where: eventWhere }).then((count) => ({ count })) : db.deviceEvent.deleteMany({ where: eventWhere }),
    dryRun ? db.faultEvent.count({ where: faultWhere }).then((count) => ({ count })) : db.faultEvent.deleteMany({ where: faultWhere }),
    dryRun ? db.reverseFlowAlert.count({ where: reverseFlowWhere }).then((count) => ({ count })) : db.reverseFlowAlert.deleteMany({ where: reverseFlowWhere })
  ])
  return { retentionDays, cutoff: cutoff.toISOString(), dryRun, telemetry: telemetry.count, deviceEvents: deviceEvents.count, faultEvents: faultEvents.count, reverseFlowAlerts: reverseFlowAlerts.count }
}

async function main() { console.log(JSON.stringify(await cleanupRetention(prisma, new Date(), process.argv.includes('--dry-run')), null, 2)) }
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedDirectly) main().catch((error) => { console.error(error); process.exitCode = 1 })
