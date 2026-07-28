import { describe, expect, it } from 'vitest'
import { chartSeriesDisplayColor, CT_POWER_METRICS, displayPowerLimit, displaySwitch, isGenerating } from '@/src/domain/monitoring'

const row = (metricKey: string, valueNumber: number | null) => ({ metricKey, valueNumber, valueText: null, reportedAt: new Date() })

describe('real-time inverter generation state', () => {
  it('requires online state and positive output power', () => {
    expect(isGenerating(2, 1, 120)).toBe(true)
    expect(isGenerating(2, 1, 0)).toBe(false)
    expect(isGenerating(2, 1, 1)).toBe(false)
  })

  it('never reports offline or unknown state as generating', () => {
    expect(isGenerating(1, 1, 500)).toBe(false)
    expect(isGenerating(0, 1, 500)).toBe(false)
    expect(isGenerating(null, 1, 500)).toBe(false)
  })

  it('uses work state only when output is unavailable and online', () => {
    expect(isGenerating(2, 1, null)).toBe(true)
    expect(isGenerating(2, 2, null)).toBe(false)
  })
})

describe('inverter configuration display', () => {
  it('maps boolean switches and power limits to business units', () => {
    expect(displaySwitch(row('anti_reverse_enabled', 1))).toBe('开启')
    expect(displaySwitch(row('generation_enabled', 0))).toBe('关闭')
    expect(displayPowerLimit(row('power_limit', 100))).toBe('100 W')
    expect(displayPowerLimit(row('power_limit', 0))).toBe('关闭')
  })
})

describe('inverter phase label', () => {
  it('maps phase_num 1/2/3 to A/B/C 相', async () => {
    const { displayInverterPhaseLabel } = await import('@/src/domain/monitoring')
    expect(displayInverterPhaseLabel(1)).toBe('A相')
    expect(displayInverterPhaseLabel('2')).toBe('B相')
    expect(displayInverterPhaseLabel(3)).toBe('C相')
    expect(displayInverterPhaseLabel(null)).toBe('—')
  })
})

describe('energy Wh to kWh display', () => {
  it('scales Wh readings by 1000 for kWh labels', async () => {
    const { displayEnergyKwh, whToKwh } = await import('@/src/domain/monitoring')
    expect(whToKwh(2368.07)).toBeCloseTo(2.36807, 5)
    expect(displayEnergyKwh(row('today_energy', 2368.07))).toBe('2.37 kWh')
    expect(displayEnergyKwh(row('total_energy', 266979.25))).toBe('266.98 kWh')
  })
})

describe('CT history chart alarm colors', () => {
  it('keeps normal phase and inverter curves out of alert red', () => {
    const regularPowerKeys = ['ct-a', 'ct-b', 'ct-c', 'inv-a', 'inv-b', 'inv-c']
    const colors = CT_POWER_METRICS.filter((item) => regularPowerKeys.includes(item.key)).map((item) => item.color)

    expect(colors).toEqual(['#2563eb', '#7c3aed', '#0891b2', '#65a30d', '#7c3aed', '#4f46e5'])
    expect(colors).not.toContain('#c92828')
    expect(colors).not.toContain('#dc2626')
    expect(CT_POWER_METRICS.filter((item) => item.markNegative).map((item) => item.key)).toEqual(['grid', 'ct-a', 'ct-b', 'ct-c'])
  })

  it('overrides stale alert identity colors before normal chart rendering', () => {
    expect(chartSeriesDisplayColor('ct-a', '#dc2626')).toBe('#2563eb')
    expect(chartSeriesDisplayColor('inv-b', '#be123c')).toBe('#7c3aed')
    expect(chartSeriesDisplayColor('temperature', '#dc2626')).toBe('#0f766e')
    expect(chartSeriesDisplayColor('unknown-series', '#c92828')).toBe('#2563eb')
    expect(chartSeriesDisplayColor('unknown-series', '#0d9488')).toBe('#0d9488')
  })
})
