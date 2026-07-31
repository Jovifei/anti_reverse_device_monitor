import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const databasePath = path.join(root, 'data', 'integration-device-monitor.db')
process.env.APP_DATABASE_URL = 'file:../data/integration-device-monitor.db'
process.env.DATA_RETENTION_DAYS = '7'

async function main() {
  await fs.mkdir(path.dirname(databasePath), { recursive: true })
  await fs.rm(databasePath, { force: true })
  await fs.writeFile(databasePath, '')
  const prismaCommand: { command: string; args: string[] } = process.platform === 'win32' ? { command: 'cmd.exe', args: ['/d', '/s', '/c', 'npx prisma db push --skip-generate'] } : { command: 'npx', args: ['prisma', 'db', 'push', '--skip-generate'] }
  execFileSync(prismaCommand.command, prismaCommand.args, { cwd: root, env: process.env, stdio: 'inherit' })
  const [{ prisma }, { DeviceRepository }, { TelemetryRepository }, { cleanupRetention }] = await Promise.all([
    import('@/src/lib/prisma'), import('@/src/repositories/device-repository'), import('@/src/repositories/telemetry-repository'), import('@/scripts/cleanup-retention')
  ])
  const deviceRepository = new DeviceRepository()
  const telemetryRepository = new TelemetryRepository()
  const device = await deviceRepository.upsertDevice({ deviceSn: 'GC2001000000252' })
  const binding = await deviceRepository.findOrCreateInverterBinding({ deviceId: device.id, inverterIndex: 1 })
  const now = new Date('2026-07-21T00:00:00.000Z')
  const oldAt = new Date('2026-07-13T23:59:59.000Z')
  const boundaryAt = new Date('2026-07-14T00:00:00.000Z')
  const records = [
    { deviceSn: device.deviceSn, metricKey: 'load_power', siid: '2', piid: '9', reportedAt: oldAt, receivedAt: oldAt, valueNumber: 10, sourceRecordId: 'old-record' },
    { deviceSn: device.deviceSn, metricKey: 'load_power', siid: '2', piid: '9', reportedAt: boundaryAt, receivedAt: boundaryAt, valueNumber: 20, sourceRecordId: 'boundary-record' }
  ]
  await telemetryRepository.upsertBatch(records)
  await prisma.deviceLatest.updateMany({ where: { deviceId: device.id, metricKey: 'load_power' }, data: { reportedAt: oldAt } })
  await prisma.deviceEvent.createMany({ data: [{ deviceId: device.id, eventType: 'old', happenedAt: oldAt }, { deviceId: device.id, eventType: 'boundary', happenedAt: boundaryAt }] })
  await prisma.faultEvent.create({ data: { inverterId: binding.id, faultMask: 1, faultHex: '0x00000001', activeFaultsJson: JSON.stringify(['电网1级过压']), eventType: 'appeared', startedAt: oldAt } })
  await prisma.reverseFlowAlert.create({ data: { deviceId: device.id, phase: 'A', startedAt: oldAt, minimumPowerW: -1, sampleCount: 1, severity: 'critical' } })
  const first = await cleanupRetention(prisma, now)
  if (first.telemetry !== 1 || first.deviceEvents !== 1 || first.faultEvents !== 1 || first.reverseFlowAlerts !== 1) throw new Error(`unexpected cleanup result: ${JSON.stringify(first)}`)
  if (await prisma.telemetry.count() !== 1) throw new Error('retention did not retain the seven-day boundary telemetry')
  if (await prisma.deviceLatest.count() !== 1) throw new Error('retention deleted latest state')
  const second = await cleanupRetention(prisma, now)
  if (second.telemetry !== 0 || second.deviceEvents !== 0 || second.faultEvents !== 0 || second.reverseFlowAlerts !== 0) throw new Error('retention is not idempotent')
  const newestAt = new Date('2026-07-21T01:02:00.000Z')
  const olderAt = new Date('2026-07-21T01:01:00.000Z')
  await telemetryRepository.upsertBatch([
    { deviceSn: device.deviceSn, metricKey: 'latest_order_check', siid: '2', piid: '30', reportedAt: newestAt, receivedAt: newestAt, valueNumber: 99, sourceRecordId: 'latest-first' },
    { deviceSn: device.deviceSn, metricKey: 'latest_order_check', siid: '2', piid: '30', reportedAt: olderAt, receivedAt: olderAt, valueNumber: 1, sourceRecordId: 'older-second' }
  ])
  const latestOrderCheck = await prisma.deviceLatest.findFirst({ where: { deviceId: device.id, metricKey: 'latest_order_check' } })
  if (latestOrderCheck?.valueNumber !== 99 || latestOrderCheck.reportedAt.getTime() !== newestAt.getTime()) {
    throw new Error('latest state was overwritten by an older import row')
  }
  const [{ SourceSyncService }, { MockSourceAdapter }] = await Promise.all([import('@/src/services/source-sync-service'), import('@/src/adapters/source-db/mock-source-adapter')])
  const sourceAt = new Date('2026-07-21T01:00:00.000Z')
  const source = new MockSourceAdapter([{ sourceRecordId: 'same-time-a', deviceSn: device.deviceSn, siid: '2', piid: '9', inverterIndex: null, reportedAt: sourceAt, receivedAt: sourceAt, value: 42, metricKey: 'load_power' }, { sourceRecordId: 'same-time-b', deviceSn: device.deviceSn, siid: '2', piid: '9', inverterIndex: null, reportedAt: sourceAt, receivedAt: sourceAt, value: 43, metricKey: 'load_power' }])
  const firstSync = await new SourceSyncService(source, prisma).sync({ sourceName: 'integration-source', from: new Date('2026-07-21T00:00:00.000Z'), to: new Date('2026-07-22T00:00:00.000Z'), batchSize: 1 })
  const secondSync = await new SourceSyncService(source, prisma).sync({ sourceName: 'integration-source', from: new Date('2026-07-21T00:00:00.000Z'), to: new Date('2026-07-22T00:00:00.000Z'), batchSize: 1 })
  if (firstSync.imported !== 2 || secondSync.duplicatesSkipped !== 2) throw new Error(`source sync is not stable or idempotent: ${JSON.stringify({ firstSync, secondSync })}`)
  if ((await prisma.syncCheckpoint.findUnique({ where: { sourceName: 'integration-source' } }))?.status !== 'ok') throw new Error('source checkpoint was not committed after success')
  console.log(JSON.stringify({ status: 'pass', checks: ['sqlite import path', 'seven-day boundary', 'latest state retained', 'repeat cleanup'] }))
  await prisma.$disconnect()
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
