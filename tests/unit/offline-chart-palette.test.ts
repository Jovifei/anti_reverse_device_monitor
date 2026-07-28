import { describe, expect, it } from 'vitest'
import { normalizeOfflineChartPalette } from '@/src/export/offline/chart-palette'
import type { OfflineDeviceViewModel } from '@/src/export/offline/types'

const series = (key: string, color: string) => ({ key, label: key, unit: 'W', color, points: [['2026-07-20T00:00:00.000Z', 100]] })

describe('offline chart palette normalization', () => {
  it('removes stale alert-red identity colors from retained device snapshots', () => {
    const vm = {
      kind: 'device',
      powerSeries: [series('ct-a', '#dc2626')],
      gridSeries: [],
      phases: [{ phase: 'A', series: [series('ct-a', '#dc2626')] }],
      inverters: [{ charts: { power: [series('inv-b', '#be123c')], temperature: [series('temperature', '#dc2626')], energy: [], packetLoss: [] } }]
    } as unknown as OfflineDeviceViewModel

    const normalized = normalizeOfflineChartPalette(vm) as OfflineDeviceViewModel
    expect(normalized.powerSeries[0]?.color).toBe('#2563eb')
    expect(normalized.phases[0]?.series[0]?.color).toBe('#2563eb')
    expect(normalized.inverters[0]?.charts.power[0]?.color).toBe('#7c3aed')
    expect(normalized.inverters[0]?.charts.temperature[0]?.color).toBe('#0f766e')
  })
})
