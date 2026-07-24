import { describe, expect, it } from 'vitest'
import { displayPowerLimit, displaySwitch, isGenerating } from '@/src/domain/monitoring'

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

describe('energy Wh to kWh display', () => {
  it('scales Wh readings by 1000 for kWh labels', async () => {
    const { displayEnergyKwh, whToKwh } = await import('@/src/domain/monitoring')
    expect(whToKwh(2368.07)).toBeCloseTo(2.36807, 5)
    expect(displayEnergyKwh(row('today_energy', 2368.07))).toBe('2.37 kWh')
    expect(displayEnergyKwh(row('total_energy', 266979.25))).toBe('266.98 kWh')
  })
})