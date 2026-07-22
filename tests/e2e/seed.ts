import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const databasePath = path.join(root, 'data', 'e2e-device-monitor.db')
process.env.APP_DATABASE_URL = 'file:../data/e2e-device-monitor.db'

async function main() {
  await fs.mkdir(path.dirname(databasePath), { recursive: true })
  await fs.rm(databasePath, { force: true })
  await fs.writeFile(databasePath, '')
  const prismaCommand: { command: string; args: string[] } = process.platform === 'win32' ? { command: 'cmd.exe', args: ['/d', '/s', '/c', 'npx prisma db push --skip-generate'] } : { command: 'npx', args: ['prisma', 'db', 'push', '--skip-generate'] }
  execFileSync(prismaCommand.command, prismaCommand.args, { cwd: root, env: process.env, stdio: 'inherit' })
  const [{ prisma }, { DeviceRepository }, { TelemetryRepository }] = await Promise.all([import('@/src/lib/prisma'), import('@/src/repositories/device-repository'), import('@/src/repositories/telemetry-repository')])
  const deviceRepository = new DeviceRepository()
  const telemetryRepository = new TelemetryRepository()
  const device = await deviceRepository.upsertDevice({ deviceSn: 'GC2001000000252', platformOnline: true, lastReportedAt: new Date() })
  await deviceRepository.findOrCreateInverterBinding({ deviceId: device.id, inverterIndex: 1, inverterSn: 'MI-0001' })
  const reportedAt = new Date()
  const rows = [
    ['load_power', 500, null], ['grid_power', 100, null], ['inverter_total_power', 400, null], ['active_power_ct1', -15, null], ['active_power_ct2', 20, null], ['active_power_ct3', 30, null], ['grid_voltage', 230, null], ['grid_frequency', 50, null], ['today_energy', 2.5, null], ['total_energy', 100, null], ['today_duration', 3, null], ['state', 4, null], ['limit_state', 0, null], ['sub1g_state', 4, null], ['work_mode', 1, null],
    ['online_state', 2, 1], ['work_state', 1, 1], ['inverter_power', 400, 1], ['pv1_power', 200, 1], ['pv2_power', 200, 1], ['internal_temperature', 38, 1], ['packet_loss_rate', 0, 1]
  ] as Array<[string, number, number | null]>
  await telemetryRepository.upsertBatch(rows.map(([metricKey, valueNumber, inverterIndex], index) => ({ deviceSn: device.deviceSn, metricKey, siid: '2', piid: String(index + 1), inverterIndex, reportedAt, receivedAt: reportedAt, valueNumber, sourceRecordId: `e2e-${index}` })))
  await prisma.$disconnect()
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
