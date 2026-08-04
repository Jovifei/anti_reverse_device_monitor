import {
  CT_KPI_ALIASES,
  displayEnergyKwh,
  displayValue,
  findLatestMetric,
  numericValue,
  type MetricRow
} from '@/src/domain/monitoring'

export type LiveKpiState = {
  loadPower: string
  generationPower: string
  gridPower: string
  gridDanger: boolean
  todayDuration: string
  todayEnergy: string
  totalEnergy: string
  phaseA: string
  phaseB: string
  phaseC: string
  phaseAReverse: boolean
  phaseBReverse: boolean
  phaseCReverse: boolean
  hint?: string
}

export function buildInitialLiveKpis(latest: MetricRow[], lastKnownHint?: string): LiveKpiState {
  const loadPowerRow = findLatestMetric(latest, ['load_power', 'ct.load_power'])
  const generationPowerRow = findLatestMetric(latest, [
    'inverter_total_power',
    'total_generation_power',
    'micro_total_power'
  ])
  const gridPowerRow = findLatestMetric(latest, ['grid_power', 'ct.grid_power'])
  const gridPowerValue = numericValue(gridPowerRow)
  const phaseA = findLatestMetric(latest, ['active_power_ct1', 'ct.active_power.phase_a'])
  const phaseB = findLatestMetric(latest, ['active_power_ct2', 'ct.active_power.phase_b'])
  const phaseC = findLatestMetric(latest, ['active_power_ct3', 'ct.active_power.phase_c'])
  const phaseAValue = numericValue(phaseA)
  const phaseBValue = numericValue(phaseB)
  const phaseCValue = numericValue(phaseC)

  return {
    loadPower: displayValue(loadPowerRow, 'W'),
    generationPower: displayValue(generationPowerRow, 'W'),
    gridPower: displayValue(gridPowerRow, 'W'),
    gridDanger: gridPowerValue !== null && gridPowerValue < 0,
    todayDuration: displayValue(findLatestMetric(latest, CT_KPI_ALIASES.todayDuration), 'h'),
    todayEnergy: displayEnergyKwh(findLatestMetric(latest, CT_KPI_ALIASES.todayEnergy)),
    totalEnergy: displayEnergyKwh(findLatestMetric(latest, CT_KPI_ALIASES.totalEnergy)),
    phaseA: displayValue(phaseA, 'W'),
    phaseB: displayValue(phaseB, 'W'),
    phaseC: displayValue(phaseC, 'W'),
    phaseAReverse: phaseAValue !== null && phaseAValue < 0,
    phaseBReverse: phaseBValue !== null && phaseBValue < 0,
    phaseCReverse: phaseCValue !== null && phaseCValue < 0,
    hint: lastKnownHint
  }
}

export function toLiveKpiMetricRows(payload: unknown): MetricRow[] {
  if (!Array.isArray(payload)) return []
  return payload.map((row) => {
    const item = row as Record<string, unknown>
    return {
      metricKey: String(item.metricKey ?? ''),
      valueNumber:
        typeof item.valueNumber === 'number'
          ? item.valueNumber
          : item.valueNumber === null
            ? null
            : Number(item.valueNumber) || null,
      valueText:
        typeof item.valueText === 'string'
          ? item.valueText
          : item.valueText == null
            ? null
            : String(item.valueText),
      reportedAt: (item.reportedAt as string | Date) ?? new Date(0)
    }
  })
}
