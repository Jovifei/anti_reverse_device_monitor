import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const databaseFile = process.env.DEMO_DATABASE_FILE || 'demo-device-monitor.db'
const databasePath = path.join(root, 'data', databaseFile)
const DEMO_SOURCE = 'ui-demo'

type Metric = { metricKey: string; valueNumber: number; inverterId: number | null; reportedAt: Date }

function decimal(value: number) {
  return Math.round(value * 100) / 100
}

function solarFactor(at: Date) {
  const hour = at.getHours() + at.getMinutes() / 60
  return Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI))
}

function metricKey(inverterId: number | null, metricKey: string) {
  return `${inverterId ?? 'ct'}:${metricKey}`
}

function addMetric(rows: Metric[], inverterId: number | null, metric: string, value: number, reportedAt: Date) {
  rows.push({ metricKey: metric, valueNumber: decimal(value), inverterId, reportedAt })
}

async function main() {
  process.env.APP_DATABASE_URL = `file:../data/${databaseFile}`
  process.env.APP_TIMEZONE = 'Asia/Shanghai'
  await fs.mkdir(path.dirname(databasePath), { recursive: true })
  await fs.rm(databasePath, { force: true })
  await fs.writeFile(databasePath, '')

  const prismaCommand = process.platform === 'win32'
    ? { file: 'cmd.exe', args: ['/d', '/s', '/c', 'npx prisma db push --skip-generate'] }
    : { file: 'npx', args: ['prisma', 'db', 'push', '--skip-generate'] }
  execFileSync(prismaCommand.file, prismaCommand.args, { cwd: root, env: process.env, stdio: 'inherit' })

  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()
  const now = new Date()
  now.setSeconds(0, 0)

  try {
    const online = await prisma.device.create({ data: { deviceSn: 'DEMO-CT-ONLINE-001', productModel: 'CT-Demo 在线正常', platformOnline: true, lastReportedAt: now } })
    const offlineAt = new Date(now.getTime() - 50 * 60 * 60 * 1000)
    const offline = await prisma.device.create({ data: { deviceSn: 'DEMO-CT-OFFLINE-002', productModel: 'CT-Demo 最近活跃离线', platformOnline: false, lastReportedAt: offlineAt } })
    const reverse = await prisma.device.create({ data: { deviceSn: 'DEMO-CT-REVERSE-003', productModel: 'CT-Demo 严重逆流告警', platformOnline: true, lastReportedAt: now } })

    const onlineBindings = await Promise.all(Array.from({ length: 7 }, (_, offset) => {
      const inverterIndex = offset + 1
      return prisma.inverterBinding.create({ data: {
        deviceId: online.id,
        inverterIndex,
        inverterSn: inverterIndex === 7 ? null : `DEMO-MI-A${String(inverterIndex).padStart(2, '0')}`,
        softwareVersion: inverterIndex === 7 ? null : '2.8.4',
        hardwareVersion: inverterIndex === 7 ? null : 'A1.3',
        sub1gVersion: inverterIndex === 7 ? null : '1.6.2',
        phaseNum: inverterIndex === 7 ? null : String(((inverterIndex - 1) % 3) + 1),
        connectionPoint: inverterIndex === 7 ? null : String((inverterIndex - 1) % 2),
        paired: inverterIndex <= 6
      } })
    }))
    const offlineBinding = await prisma.inverterBinding.create({ data: { deviceId: offline.id, inverterIndex: 1, inverterSn: 'DEMO-MI-B01', softwareVersion: '2.7.9', hardwareVersion: 'A1.1', sub1gVersion: '1.5.8', phaseNum: '2', connectionPoint: '1' } })
    const reverseBinding = await prisma.inverterBinding.create({ data: { deviceId: reverse.id, inverterIndex: 1, inverterSn: 'DEMO-MI-C01', softwareVersion: '2.8.4', hardwareVersion: 'A1.3', sub1gVersion: '1.6.2', phaseNum: '3', connectionPoint: '0' } })

    const records: Array<{ deviceId: number; inverterId: number | null; siid: string; piid: string; metricKey: string; reportedAt: Date; receivedAt: Date; valueNumber: number; sourceRecordId: string; sourceName: string }> = []
    const latest = new Map<string, { deviceId: number; inverterId: number | null; metricKey: string; valueNumber: number; reportedAt: Date; receivedAt: Date }>()
    const append = (deviceId: number, metric: Metric) => {
      const sourceRecordId = `${DEMO_SOURCE}:${deviceId}:${metricKey(metric.inverterId, metric.metricKey)}:${metric.reportedAt.toISOString()}`
      records.push({ deviceId, inverterId: metric.inverterId, siid: '2', piid: metric.metricKey, metricKey: metric.metricKey, reportedAt: metric.reportedAt, receivedAt: metric.reportedAt, valueNumber: metric.valueNumber, sourceRecordId, sourceName: DEMO_SOURCE })
      const key = `${deviceId}:${metricKey(metric.inverterId, metric.metricKey)}`
      const previous = latest.get(key)
      if (!previous || previous.reportedAt < metric.reportedAt) latest.set(key, { deviceId, inverterId: metric.inverterId, metricKey: metric.metricKey, valueNumber: metric.valueNumber, reportedAt: metric.reportedAt, receivedAt: metric.reportedAt })
    }

    const addCtHour = (deviceId: number, reportedAt: Date, mode: 'online' | 'offline' | 'reverse', hour: number) => {
      const generated = 3600 * solarFactor(reportedAt)
      const historicReverse = mode === 'reverse' && ((hour >= 72 && hour <= 74) || hour <= 2)
      const rows: Metric[] = []
      addMetric(rows, null, 'load_power', 950 + generated * 0.42, reportedAt)
      addMetric(rows, null, 'grid_power', historicReverse ? -420 - (hour % 3) * 35 : 120 + generated * 0.08, reportedAt)
      addMetric(rows, null, 'inverter_total_power', generated, reportedAt)
      addMetric(rows, null, 'active_power_ct1', historicReverse ? -420 : 55 + generated * 0.04, reportedAt)
      addMetric(rows, null, 'active_power_ct2', 75 + generated * 0.035, reportedAt)
      addMetric(rows, null, 'active_power_ct3', 95 + generated * 0.03, reportedAt)
      addMetric(rows, null, 'grid_voltage', 229 + Math.sin(hour / 4) * 2, reportedAt)
      addMetric(rows, null, 'grid_frequency', 50 + Math.cos(hour / 3) * 0.04, reportedAt)
      addMetric(rows, null, 'today_energy', Math.max(0, generated / 1000 * Math.max(0, reportedAt.getHours() - 6)), reportedAt)
      addMetric(rows, null, 'total_energy', 1280 + (168 - hour) * 1.9, reportedAt)
      addMetric(rows, null, 'today_duration', Math.max(0, reportedAt.getHours() - 6), reportedAt)
      addMetric(rows, null, 'state', 4, reportedAt)
      addMetric(rows, null, 'limit_state', 0, reportedAt)
      addMetric(rows, null, 'sub1g_state', 4, reportedAt)
      addMetric(rows, null, 'work_mode', 1, reportedAt)
      rows.forEach((row) => append(deviceId, row))
    }

    for (let hour = 168; hour >= 0; hour -= 1) {
      const reportedAt = new Date(now.getTime() - hour * 60 * 60 * 1000)
      addCtHour(online.id, reportedAt, 'online', hour)
      addCtHour(reverse.id, reportedAt, 'reverse', hour)
      if (hour >= 50) addCtHour(offline.id, reportedAt, 'offline', hour)

      for (const binding of onlineBindings.filter((item) => item.paired)) {
        const generated = 640 * solarFactor(reportedAt) * (0.8 + binding.inverterIndex * 0.025)
        const offlineState = binding.inverterIndex === 3
        const standby = binding.inverterIndex === 2
        const limited = binding.inverterIndex === 4
        const recoveredFault = binding.inverterIndex === 5 && hour >= 84 && hour <= 86
        const rows: Metric[] = []
        addMetric(rows, binding.id, 'online_state', offlineState ? 1 : 2, reportedAt)
        addMetric(rows, binding.id, 'work_state', offlineState ? 0 : standby ? 2 : 1, reportedAt)
        addMetric(rows, binding.id, 'is_generating', offlineState || standby ? 0 : 1, reportedAt)
        addMetric(rows, binding.id, 'inverter_power', offlineState || standby ? 0 : generated * (limited ? 0.65 : 1), reportedAt)
        addMetric(rows, binding.id, 'pv1_power', offlineState ? 0 : generated * 0.48, reportedAt)
        addMetric(rows, binding.id, 'pv2_power', offlineState ? 0 : generated * 0.52, reportedAt)
        addMetric(rows, binding.id, 'internal_temperature', 31 + solarFactor(reportedAt) * 18 + (binding.inverterIndex === 6 ? 4 : 0), reportedAt)
        addMetric(rows, binding.id, 'packet_loss_rate', binding.inverterIndex === 6 ? 1.8 + (hour % 4) * 0.35 : 0.1, reportedAt)
        addMetric(rows, binding.id, 'today_energy', Math.max(0, generated / 1000 * Math.max(0, reportedAt.getHours() - 6)), reportedAt)
        addMetric(rows, binding.id, 'total_energy', 180 + binding.inverterIndex * 25 + (168 - hour) * 0.42, reportedAt)
        addMetric(rows, binding.id, 'today_duration', Math.max(0, reportedAt.getHours() - 6), reportedAt)
        addMetric(rows, binding.id, 'anti_reverse_enabled', 1, reportedAt)
        addMetric(rows, binding.id, 'generation_enabled', 1, reportedAt)
        addMetric(rows, binding.id, 'power_limit', limited ? 65 : 100, reportedAt)
        addMetric(rows, binding.id, 'fault_param', recoveredFault ? 0x00400C00 : 0, reportedAt)
        rows.forEach((row) => append(online.id, row))
      }
    }

    for (let minute = 168 * 60; minute >= 0; minute -= 5) {
      const reportedAt = new Date(now.getTime() - minute * 60 * 1000)
      append(online.id, { metricKey: 'heartbeat', valueNumber: 1, inverterId: null, reportedAt })
      append(reverse.id, { metricKey: 'heartbeat', valueNumber: 1, inverterId: null, reportedAt })
      if (minute >= 50 * 60) append(offline.id, { metricKey: 'heartbeat', valueNumber: 1, inverterId: null, reportedAt })
    }

    const offlineRows: Metric[] = []
    addMetric(offlineRows, offlineBinding.id, 'online_state', 1, offlineAt)
    addMetric(offlineRows, offlineBinding.id, 'work_state', 0, offlineAt)
    addMetric(offlineRows, offlineBinding.id, 'inverter_power', 0, offlineAt)
    addMetric(offlineRows, offlineBinding.id, 'packet_loss_rate', 4.2, offlineAt)
    offlineRows.forEach((row) => append(offline.id, row))

    for (let hour = 4; hour >= 0; hour -= 1) {
      const reportedAt = new Date(now.getTime() - hour * 60 * 60 * 1000)
      const generated = 530 * solarFactor(reportedAt)
      const rows: Metric[] = []
      addMetric(rows, reverseBinding.id, 'online_state', 2, reportedAt)
      addMetric(rows, reverseBinding.id, 'work_state', 1, reportedAt)
      addMetric(rows, reverseBinding.id, 'is_generating', 1, reportedAt)
      addMetric(rows, reverseBinding.id, 'inverter_power', generated, reportedAt)
      addMetric(rows, reverseBinding.id, 'pv1_power', generated * 0.48, reportedAt)
      addMetric(rows, reverseBinding.id, 'pv2_power', generated * 0.52, reportedAt)
      addMetric(rows, reverseBinding.id, 'internal_temperature', 42 - hour, reportedAt)
      addMetric(rows, reverseBinding.id, 'packet_loss_rate', 0.4, reportedAt)
      addMetric(rows, reverseBinding.id, 'today_energy', generated / 1000 * Math.max(0, reportedAt.getHours() - 6), reportedAt)
      addMetric(rows, reverseBinding.id, 'total_energy', 540 + (4 - hour) * 0.5, reportedAt)
      addMetric(rows, reverseBinding.id, 'today_duration', Math.max(0, reportedAt.getHours() - 6), reportedAt)
      addMetric(rows, reverseBinding.id, 'anti_reverse_enabled', 1, reportedAt)
      addMetric(rows, reverseBinding.id, 'generation_enabled', 1, reportedAt)
      addMetric(rows, reverseBinding.id, 'power_limit', 100, reportedAt)
      addMetric(rows, reverseBinding.id, 'fault_param', hour <= 2 ? 0x00400C00 : 0, reportedAt)
      rows.forEach((row) => append(reverse.id, row))
    }

    await prisma.telemetry.createMany({ data: records })
    await prisma.deviceLatest.createMany({ data: [...latest.values()] })
    await prisma.reverseFlowAlert.createMany({ data: [
      { deviceId: reverse.id, phase: 'A', startedAt: new Date(now.getTime() - 74 * 60 * 60 * 1000), endedAt: new Date(now.getTime() - 71 * 60 * 60 * 1000), minimumPowerW: -490, sampleCount: 3, severity: 'critical' },
      { deviceId: reverse.id, phase: 'A', startedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), endedAt: null, minimumPowerW: -490, sampleCount: 3, severity: 'critical' }
    ] })
    await prisma.device.update({ where: { id: offline.id }, data: { platformOnline: false, lastReportedAt: offlineAt } })

    console.log(JSON.stringify({
      status: 'pass',
      database: `data/${databaseFile}`,
      devices: ['DEMO-CT-ONLINE-001', 'DEMO-CT-OFFLINE-002', 'DEMO-CT-REVERSE-003'],
      telemetryRows: records.length
    }))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
