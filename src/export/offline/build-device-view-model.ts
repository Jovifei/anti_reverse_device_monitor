import { resolveStatusLabel } from '@/src/domain/dictionaries'
import { faultDisplayNames, toHexMask } from '@/src/domain/faults'
import {
  CT_KPI_ALIASES,
  displayValue,
  findLatestMetric,
  formatDuration,
  formatTime,
  getInverterStatus,
  getInverterWorkStatus,
  INVERTER_KPI_ALIASES,
  isGenerating,
  numericValue,
  type MetricRow
} from '@/src/domain/monitoring'
import { displayOrEmpty, mapSourceLabel, withDailyResetSeries } from '@/src/export/offline/html-utils'
import type { OfflineChartSeries, OfflineDeviceViewModel, OfflineInverterCard } from '@/src/export/offline/types'
import { EMPTY } from '@/src/export/offline/types'
import { DeviceService, type ChartSeries } from '@/src/services/device-service'
import { prisma } from '@/src/lib/prisma'

function toOfflineSeries(series: ChartSeries[]): OfflineChartSeries[] {
  return series.map((item) =>
    withDailyResetSeries({
      key: item.key,
      label: item.label,
      unit: item.unit,
      color: item.color,
      markNegative: item.markNegative,
      dailyReset: item.dailyReset,
      points: item.points
    })
  )
}

async function resolveSourceLabel(deviceSn: string, override?: string) {
  if (override) return override
  const device = await prisma.device.findUnique({ where: { deviceSn }, select: { id: true } })
  if (!device) return mapSourceLabel(null)
  const row = await prisma.telemetry.findFirst({
    where: { deviceId: device.id },
    orderBy: { reportedAt: 'desc' },
    select: { sourceName: true }
  })
  return mapSourceLabel(row?.sourceName)
}

function latestFaultText(faults: Array<{ value: number | null; faults: Array<{ name: string }> }>) {
  const first = faults[0]
  if (!first || first.value === null || first.value === undefined) return { text: EMPTY, hex: EMPTY }
  const names = faultDisplayNames(first.value)
  return {
    text: names?.join('、') ?? EMPTY,
    hex: toHexMask(Number(first.value))
  }
}

export async function buildDeviceViewModel(
  sn: string,
  days = 7,
  options?: {
    sourceLabelOverride?: string
    includeDetailLinks?: boolean
    deviceOptions?: Array<{ sn: string; href: string }>
  }
): Promise<OfflineDeviceViewModel> {
  const service = new DeviceService()
  const lookup = await service.resolveDeviceSn(sn)
  if (lookup.kind !== 'resolved') throw new Error(`无法解析设备 SN: ${sn}`)
  const canonicalSn = lookup.deviceSn
  const query = { days: String(days) }
  const [device, history, alarms, charts, inverterSummaries, inverterCharts, sourceLabel] = await Promise.all([
    service.getDeviceSummary(canonicalSn),
    service.getDeviceHistory(canonicalSn, query),
    service.getReverseFlowAlarms(canonicalSn, query),
    service.getDeviceChartData(canonicalSn, query),
    Promise.all(Array.from({ length: 8 }, (_, index) => service.getInverterSummary(canonicalSn, index + 1))),
    Promise.all(Array.from({ length: 8 }, (_, index) => service.getInverterChartData(canonicalSn, index + 1, query))),
    resolveSourceLabel(canonicalSn, options?.sourceLabelOverride)
  ])
  if (!device || !history) throw new Error(`设备无可用数据: ${canonicalSn}`)

  const latest = device.latestRows as MetricRow[]
  const powerSeries = toOfflineSeries(charts.power)
  const phaseDefs: Array<{ phase: 'A' | 'B' | 'C'; aliases: string[]; key: string }> = [
    { phase: 'A', aliases: ['active_power_ct1', 'ct.active_power.phase_a'], key: 'ct-a' },
    { phase: 'B', aliases: ['active_power_ct2', 'ct.active_power.phase_b'], key: 'ct-b' },
    { phase: 'C', aliases: ['active_power_ct3', 'ct.active_power.phase_c'], key: 'ct-c' }
  ]
  const phases = phaseDefs.map(({ phase, aliases, key }) => {
    const row = findLatestMetric(latest, aliases)
    const value = numericValue(row)
    const reverse = value !== null && value < 0
    const lastAlarm = alarms.alerts.find((item) => item.phase === phase)
    return {
      phase,
      powerText: displayValue(row, 'W'),
      powerValue: value,
      reverse,
      series: powerSeries.filter((item) => item.key === key),
      lastAlarmAt: lastAlarm ? formatTime(lastAlarm.startedAt) : EMPTY
    }
  })
  const reverseNow = phases.filter((item) => item.reverse)
  const activeAlerts = alarms.alerts.filter((item) => item.endedAt === null)
  const isLastKnown = !history.platform.isOnline
  const currentStateMinutes = history.platform.isOnline
    ? history.platform.currentOnlineMinutes
    : history.platform.currentOfflineMinutes

  const inverters: OfflineInverterCard[] = Array.from({ length: 8 }, (_, offset) => {
    const inverterIndex = offset + 1
    const summary = inverterSummaries[offset]
    const binding = device.inverterBindings.find((item) => item.inverterIndex === inverterIndex)
    const rows = (summary?.latestRows ?? []) as MetricRow[]
    const onlineRaw = binding?.paired === false ? 0 : numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.onlineState))
    const status = getInverterStatus(onlineRaw)
    const workRaw = numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.workState))
    const powerRow = findLatestMetric(rows, ['inverter_power', 'generation_power', 'total_power', 'power'])
    const power = numericValue(powerRow)
    const faultInfo = latestFaultText(summary?.faults ?? [])
    const chartBundle = inverterCharts[offset]
    return {
      index: inverterIndex,
      sn: displayOrEmpty(binding?.inverterSn ?? summary?.inverterSn),
      statusLabel: status.label,
      statusVariant: status.variant,
      workState: getInverterWorkStatus(workRaw),
      generating: isGenerating(onlineRaw, workRaw, power) ? '是' : onlineRaw === null ? EMPTY : '否',
      power: displayValue(powerRow, 'W'),
      pv1: displayValue(findLatestMetric(rows, ['pv1_power', 'pv1power']), 'W'),
      pv2: displayValue(findLatestMetric(rows, ['pv2_power', 'pv2power']), 'W'),
      todayEnergy: displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.todayEnergy), 'kWh'),
      totalEnergy: displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.totalEnergy), 'kWh'),
      todayDuration: displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.todayDuration), 'h'),
      temperature: displayValue(findLatestMetric(rows, ['internal_temperature', 'temperature', 'temp']), '°C'),
      packetLoss: displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.packetLoss), '%'),
      softwareVersion: displayOrEmpty(binding?.softwareVersion ?? summary?.softwareVersion),
      hardwareVersion: displayOrEmpty(binding?.hardwareVersion ?? summary?.hardwareVersion),
      latestFault: faultInfo.text,
      faultHex: faultInfo.hex,
      charts: {
        power: toOfflineSeries(chartBundle?.power ?? []),
        temperature: toOfflineSeries(chartBundle?.temperature ?? []),
        energy: toOfflineSeries(chartBundle?.energy ?? [])
      },
      detailHref: options?.includeDetailLinks
        ? `./inverter-${safeDevice(canonicalSn)}-${inverterIndex}.html`
        : undefined
    }
  })

  return {
    kind: 'device',
    title: options?.sourceLabelOverride ? `设备 ${canonicalSn}` : `设备 SN：${canonicalSn}`,
    deviceSn: canonicalSn,
    sourceLabel,
    timezone: process.env.APP_TIMEZONE || 'Asia/Shanghai',
    days,
    lastReportedAt: formatTime(device.lastReportedAt),
    ctOnline: history.platform.isOnline,
    ctStatusDuration: formatDuration(currentStateMinutes),
    isLastKnown,
    reverseNow: reverseNow.length > 0,
    reversePhases: reverseNow.map((item) => item.phase),
    reverseHeading: reverseNow.length ? '严重告警：检测到功率反送电网' : '防逆流运行正常',
    reverseBadge: reverseNow.length
      ? `严重告警：${reverseNow.map((item) => `${item.phase} 相`).join('、')}正在反送电网`
      : '当前无逆流',
    activeAlertText: activeAlerts.length
      ? `受影响相：${activeAlerts.map((item) => item.phase).join('、')}；开始 ${formatTime(activeAlerts[0].startedAt)}；已持续 ${formatDuration(activeAlerts[0].durationMinutes)}。`
      : '当前没有持续中的逆流告警。',
    phases,
    reverseAlerts: alarms.alerts.map((alert) => ({
      phase: `${alert.phase} 相`,
      startedAt: formatTime(alert.startedAt),
      endedAt: alert.endedAt ? formatTime(alert.endedAt) : '持续中',
      duration: formatDuration(alert.durationMinutes),
      minimumPower: `${alert.minimumPower} W`,
      sampleCount: alert.sampleCount,
      active: alert.endedAt === null
    })),
    deviceOptions: options?.deviceOptions?.length
      ? options.deviceOptions
      : [{ sn: canonicalSn, href: `./device-${safeDevice(canonicalSn)}.html` }],
    ctState: resolveStatusLabel('ct_state', numericValue(findLatestMetric(latest, CT_KPI_ALIASES.state))) ?? EMPTY,
    limitState: resolveStatusLabel('limit_state', numericValue(findLatestMetric(latest, CT_KPI_ALIASES.limitState))) ?? EMPTY,
    sub1gState: resolveStatusLabel('sub1g_state', numericValue(findLatestMetric(latest, CT_KPI_ALIASES.sub1gState))) ?? EMPTY,
    workMode: resolveStatusLabel('work_mode', numericValue(findLatestMetric(latest, CT_KPI_ALIASES.workMode))) ?? EMPTY,
    loadPower: displayValue(findLatestMetric(latest, ['load_power', 'ct.load_power']), 'W'),
    gridPower: displayValue(findLatestMetric(latest, ['grid_power', 'ct.grid_power']), 'W'),
    inverterTotalPower: displayValue(
      findLatestMetric(latest, ['inverter_total_power', 'total_generation_power', 'micro_total_power']),
      'W'
    ),
    todayEnergy: displayValue(findLatestMetric(latest, CT_KPI_ALIASES.todayEnergy), 'kWh'),
    todayDuration: displayValue(findLatestMetric(latest, CT_KPI_ALIASES.todayDuration), 'h'),
    totalEnergy: displayValue(findLatestMetric(latest, CT_KPI_ALIASES.totalEnergy), 'kWh'),
    gridVoltage: displayValue(findLatestMetric(latest, ['grid_voltage']), 'V'),
    gridFrequency: displayValue(findLatestMetric(latest, ['grid_frequency']), 'Hz'),
    powerSeries,
    gridSeries: toOfflineSeries(charts.grid),
    platformTransitions: history.platform.transitions.map((item) => ({
      text: `${formatTime(item.at)}：${item.state === 'online' ? '上线' : '离线'}`
    })),
    platformOfflineWindows: history.platform.offlineWindows.map((item) => ({
      text: `${formatTime(item.startAt)} → ${formatTime(item.endAt)} · ${formatDuration(item.durationMinutes)}${item.endAt ? '' : '（持续中）'}`
    })),
    inverters,
    overviewHref: options?.includeDetailLinks ? './index.html' : undefined
  }
}

function safeDevice(sn: string) {
  return sn.replace(/[^A-Za-z0-9_-]+/g, '-')
}
