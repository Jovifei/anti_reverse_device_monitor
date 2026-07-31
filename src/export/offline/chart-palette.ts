import { chartSeriesDisplayColor } from '@/src/domain/monitoring'
import type {
  OfflineChartSeries,
  OfflineDeviceViewModel,
  OfflineInverterCard,
  OfflineInverterViewModel,
  OfflinePageViewModel
} from '@/src/export/offline/types'

function normalizeSeries(series: OfflineChartSeries[]) {
  return series.map((item) => ({ ...item, color: chartSeriesDisplayColor(item.key, item.color) }))
}

function normalizeInverterCharts<T extends OfflineInverterCard['charts'] | OfflineInverterViewModel['charts']>(charts: T): T {
  return {
    ...charts,
    power: normalizeSeries(charts.power),
    temperature: normalizeSeries(charts.temperature),
    energy: normalizeSeries(charts.energy),
    packetLoss: normalizeSeries(charts.packetLoss)
  } as T
}

function normalizeDeviceViewModel(vm: OfflineDeviceViewModel): OfflineDeviceViewModel {
  return {
    ...vm,
    powerSeries: normalizeSeries(vm.powerSeries),
    gridSeries: normalizeSeries(vm.gridSeries),
    phases: vm.phases.map((phase) => ({ ...phase, series: normalizeSeries(phase.series) })),
    inverters: vm.inverters.map((inverter) => ({ ...inverter, charts: normalizeInverterCharts(inverter.charts) }))
  }
}

/**
 * Kept snapshots serialize their prior presentation colors. Normalize them at
 * the final HTML boundary so stale red identity colors cannot survive a review
 * package rebuild. Negative-power red is applied only by the browser runtime.
 */
export function normalizeOfflineChartPalette(vm: OfflinePageViewModel): OfflinePageViewModel {
  if (vm.kind === 'overview') return vm
  if (vm.kind === 'device') return normalizeDeviceViewModel(vm)
  return { ...vm, charts: normalizeInverterCharts(vm.charts) }
}
