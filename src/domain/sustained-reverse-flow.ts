export type ReversePhase = 'A' | 'B' | 'C'

export type ReversePowerPoint = {
  reportedAt: Date
  valueNumber: number
}

export type ReverseFlowInterval = {
  phase: ReversePhase
  startedAt: Date
  endedAt: Date | null
  durationMinutes: number
  minimumPower: number
  sampleCount: number
}

export const SUSTAINED_REVERSE_MINUTES = 40
export const SUSTAINED_REVERSE_LOOKBACK_DAYS = 7

const PHASE_METRIC_ALIASES: Record<ReversePhase, string[]> = {
  A: ['active_power_ct1', 'ct.active_power.phase_a'],
  B: ['active_power_ct2', 'ct.active_power.phase_b'],
  C: ['active_power_ct3', 'ct.active_power.phase_c']
}

export function reversePhaseMetricKeys(): string[] {
  return Object.values(PHASE_METRIC_ALIASES).flat()
}

export function resolveReversePhase(metricKey: string): ReversePhase | null {
  const key = metricKey.trim().toLowerCase()
  for (const [phase, aliases] of Object.entries(PHASE_METRIC_ALIASES) as Array<[ReversePhase, string[]]>) {
    if (aliases.some((alias) => alias === key)) return phase
  }
  return null
}

export function buildReverseFlowIntervals(
  points: ReversePowerPoint[],
  phase: ReversePhase,
  windowEnd: Date
): ReverseFlowInterval[] {
  const sorted = [...points].sort((left, right) => left.reportedAt.getTime() - right.reportedAt.getTime())
  const intervals: ReverseFlowInterval[] = []
  let active: { startedAt: Date; minimumPower: number; sampleCount: number } | null = null

  for (const point of sorted) {
    if (point.valueNumber < 0) {
      if (!active) active = { startedAt: point.reportedAt, minimumPower: point.valueNumber, sampleCount: 0 }
      active.minimumPower = Math.min(active.minimumPower, point.valueNumber)
      active.sampleCount += 1
      continue
    }
    if (active) {
      intervals.push({
        phase,
        startedAt: active.startedAt,
        endedAt: point.reportedAt,
        durationMinutes: Math.max(0, Math.round((point.reportedAt.getTime() - active.startedAt.getTime()) / 60_000)),
        minimumPower: active.minimumPower,
        sampleCount: active.sampleCount
      })
      active = null
    }
  }

  if (active) {
    intervals.push({
      phase,
      startedAt: active.startedAt,
      endedAt: null,
      durationMinutes: Math.max(0, Math.round((windowEnd.getTime() - active.startedAt.getTime()) / 60_000)),
      minimumPower: active.minimumPower,
      sampleCount: active.sampleCount
    })
  }

  return intervals
}

export function summarizeSustainedReverseFlow(
  intervals: ReverseFlowInterval[],
  minDurationMinutes = SUSTAINED_REVERSE_MINUTES
): {
  hasSustainedReverse: boolean
  maxDurationMinutes: number | null
  phases: ReversePhase[]
} {
  const sustained = intervals.filter((item) => item.durationMinutes >= minDurationMinutes)
  if (!sustained.length) {
    return { hasSustainedReverse: false, maxDurationMinutes: null, phases: [] }
  }
  const phases = Array.from(new Set(sustained.map((item) => item.phase))).sort() as ReversePhase[]
  const maxDurationMinutes = Math.max(...sustained.map((item) => item.durationMinutes))
  return { hasSustainedReverse: true, maxDurationMinutes, phases }
}

export function summarizeDeviceSustainedReverse(
  rows: Array<{ metricKey: string; valueNumber: number | null; reportedAt: Date }>,
  windowEnd: Date,
  minDurationMinutes = SUSTAINED_REVERSE_MINUTES
) {
  const byPhase = new Map<ReversePhase, ReversePowerPoint[]>()
  for (const row of rows) {
    if (row.valueNumber === null) continue
    const phase = resolveReversePhase(row.metricKey)
    if (!phase) continue
    const list = byPhase.get(phase) ?? []
    list.push({ reportedAt: row.reportedAt, valueNumber: row.valueNumber })
    byPhase.set(phase, list)
  }

  const intervals = (['A', 'B', 'C'] as ReversePhase[]).flatMap((phase) =>
    buildReverseFlowIntervals(byPhase.get(phase) ?? [], phase, windowEnd)
  )
  return summarizeSustainedReverseFlow(intervals, minDurationMinutes)
}
