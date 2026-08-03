import { faultDisplayNames, toHexMask } from '@/src/domain/faults'
import {
  breakChartTimeGaps,
  displayEnergyKwh,
  displayInverterPhaseLabel,
  displayPowerLimit,
  displaySwitch,
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
import { displayOrEmpty, mapSourceLabel, safeFileToken, withDailyResetSeries } from '@/src/export/offline/html-utils'
import type { OfflineChartSeries, OfflineDeviceViewModel, OfflineInverterCard, OfflineInverterViewModel } from '@/src/export/offline/types'
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
      step: item.step,
      points: breakChartTimeGaps(item.points)
    })
  )
}

/**
 * Retained offline CT pages already contain a complete inverter card snapshot
 * and its chart series. Rehydrate a detail view from that evidence rather than
 * requiring a second source import or giving only one CT detail pages.
 */
export function hasInverterDetailData(inverter: OfflineInverterCard) {
  return inverter.statusVariant !== 'unknown' || [
    inverter.power,
    inverter.pv1,
    inverter.pv2,
    inverter.todayEnergy,
    inverter.totalEnergy,
    inverter.temperature,
    inverter.packetLoss
  ].some((value) => value !== EMPTY)
}

export function buildInverterViewModelFromDevice(
  device: OfflineDeviceViewModel,
  inverter: OfflineInverterCard
): OfflineInverterViewModel {
  return {
    kind: 'inverter',
    title: `微型逆变器 ${inverter.index}：${inverter.phaseLabel}`,
    deviceSn: device.deviceSn,
    inverterIndex: inverter.index,
    inverterSn: inverter.sn,
    sourceLabel: device.sourceLabel,
    softwareVersion: inverter.softwareVersion,
    hardwareVersion: inverter.hardwareVersion,
    sub1gVersion: device.sub1gVersion,
    statusLabel: inverter.statusLabel,
    statusVariant: inverter.statusVariant,
    workState: inverter.workState,
    generating: inverter.generating,
    power: inverter.power,
    pv1: inverter.pv1,
    pv2: inverter.pv2,
    todayEnergy: inverter.todayEnergy,
    totalEnergy: inverter.totalEnergy,
    todayDuration: inverter.todayDuration,
    temperature: inverter.temperature,
    packetLoss: inverter.packetLoss,
    phase: inverter.phaseLabel,
    connectionPoint: EMPTY,
    antiReverse: inverter.antiReverse,
    generationEnabled: inverter.generationEnabled,
    powerLimit: EMPTY,
    latestFault: inverter.latestFault,
    faultHex: inverter.faultHex,
    faultChanges: [],
    offlineWindows: inverter.statusVariant === 'offline'
      ? [{ text: `当前显示为最后已知值；CT 最后上报：${device.lastReportedAt}` }]
      : [],
    charts: inverter.charts,
    deviceHref: `./device-${safeFileToken(device.deviceSn)}.html`,
    overviewHref: './index.html'
  }
}

export async function buildInverterViewModel(
  sn: string,
  inverterIndex: number,
  days = 7,
  options?: { sourceLabelOverride?: string }
): Promise<OfflineInverterViewModel> {
  const service = new DeviceService()
  const lookup = await service.resolveDeviceSn(sn)
  if (lookup.kind !== 'resolved') throw new Error(`无法解析设备 SN: ${sn}`)
  const deviceSn = lookup.deviceSn
  const [summary, charts] = await Promise.all([
    service.getInverterSummary(deviceSn, inverterIndex),
    service.getInverterChartData(deviceSn, inverterIndex, { days: String(days) })
  ])
  if (!summary) throw new Error(`微逆通道无数据: ${deviceSn}#${inverterIndex}`)

  const device = await prisma.device.findUnique({ where: { deviceSn }, select: { id: true } })
  const sourceRow = device
    ? await prisma.telemetry.findFirst({
        where: { deviceId: device.id },
        orderBy: { reportedAt: 'desc' },
        select: { sourceName: true }
      })
    : null
  const rows = summary.latestRows as MetricRow[]
  const onlineRaw = summary.paired === false ? 0 : numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.onlineState))
  const status = getInverterStatus(onlineRaw)
  const workRaw = numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.workState))
  const powerRow = findLatestMetric(rows, ['inverter_power', 'generation_power', 'total_power', 'power'])
  const power = numericValue(powerRow)
  const fault = summary.faults[0]
  const faultNames = fault && fault.value !== null ? faultDisplayNames(fault.value) : null

  return {
    kind: 'inverter',
    title: `微型逆变器 ${inverterIndex}`,
    deviceSn,
    inverterIndex,
    inverterSn: displayOrEmpty(summary.inverterSn),
    sourceLabel: options?.sourceLabelOverride ?? mapSourceLabel(sourceRow?.sourceName),
    softwareVersion: displayOrEmpty(summary.softwareVersion),
    hardwareVersion: displayOrEmpty(summary.hardwareVersion),
    sub1gVersion: displayOrEmpty(summary.sub1gVersion),
    statusLabel: status.label,
    statusVariant: status.variant,
    workState: getInverterWorkStatus(workRaw),
    generating: isGenerating(onlineRaw, workRaw, power) ? '是' : onlineRaw === null ? EMPTY : '否',
    power: displayValue(powerRow, 'W'),
    pv1: displayValue(findLatestMetric(rows, ['pv1_power', 'pv1power']), 'W'),
    pv2: displayValue(findLatestMetric(rows, ['pv2_power', 'pv2power']), 'W'),
    todayEnergy: displayEnergyKwh(findLatestMetric(rows, INVERTER_KPI_ALIASES.todayEnergy)),
    totalEnergy: displayEnergyKwh(findLatestMetric(rows, INVERTER_KPI_ALIASES.totalEnergy)),
    todayDuration: displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.todayDuration), 'h'),
    temperature: displayValue(findLatestMetric(rows, ['internal_temperature', 'temperature', 'temp']), '°C'),
    packetLoss: displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.packetLoss), '%'),
    phase: displayInverterPhaseLabel(numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.phase)) ?? summary.phaseNum),
    connectionPoint: displayOrEmpty(summary.connectionPoint),
    antiReverse: displaySwitch(findLatestMetric(rows, INVERTER_KPI_ALIASES.antiReverse)),
    generationEnabled: displaySwitch(findLatestMetric(rows, INVERTER_KPI_ALIASES.generationEnabled)),
    powerLimit: displayPowerLimit(findLatestMetric(rows, INVERTER_KPI_ALIASES.powerLimit)),
    latestFault: faultNames ? faultNames.join('、') : EMPTY,
    faultHex: fault && fault.value !== null ? toHexMask(Number(fault.value)) : EMPTY,
    faultChanges: (summary.faultChanges ?? []).map((item) => ({
      text: `${formatTime(item.at)} · ${item.eventType} · ${(item.toFaults ?? []).join('、') || EMPTY} · ${item.toHex ?? EMPTY}`
    })),
    offlineWindows: (summary.connectivity?.offlineWindows ?? []).map((item) => ({
      text: `下线 ${formatTime(item.startAt)} · 恢复 ${item.endAt ? formatTime(item.endAt) : '持续中'} · ${formatDuration(item.durationMinutes)}`
    })),
    charts: {
      power: toOfflineSeries(charts.power),
      temperature: toOfflineSeries(charts.temperature),
      energy: toOfflineSeries(charts.energy),
      packetLoss: toOfflineSeries(charts.packetLoss ?? [])
    },
    deviceHref: `./device-${safeFileToken(deviceSn)}.html`,
    overviewHref: './index.html'
  }
}
