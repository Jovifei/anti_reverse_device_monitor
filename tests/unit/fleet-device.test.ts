import { describe, expect, it } from 'vitest'
import { compareFleetDevices, fleetDevicePriority, type FleetDeviceItem } from '@/src/domain/fleet-device'

function item(overrides: Partial<FleetDeviceItem>): FleetDeviceItem {
  return {
    id: 1,
    deviceSn: 'TEST',
    productModel: null,
    platformOnline: true,
    lastReportedAt: null,
    inverterCount: 1,
    onlineInverterCount: 1,
    offlineInverterIndexes: [],
    hasOfflineInverter: false,
    isOnline: true,
    reverseFlow: false,
    reverseFlowPhases: [],
    reverseState: 'normal',
    hasRecentReverse: false,
    hasSustainedReverse: false,
    sustainedReverseMaxMinutes: null,
    sustainedReversePhases: [],
    hasRecentInverterFault: false,
    offlineMinutes: null,
    offlineAlert: false,
    classifyStatus: 'active',
    isNewlyOnline: false,
    todayEnergy: '—',
    inverterGenerationStatus: 'idle',
    inverterGenerationLabel: 'idle',
    runtimeState: '—',
    limitState: '—',
    sub1gState: '—',
    wifiSignal: '—',
    ...overrides
  }
}

describe('fleet priority ordering', () => {
  it('puts active reverse before recent reverse and preserves ties', () => {
    const active = item({ reverseState: 'active' })
    const recent = item({ hasRecentReverse: true })
    expect(fleetDevicePriority(active)).toBeLessThan(fleetDevicePriority(recent))
    expect(compareFleetDevices(item({ deviceSn: 'A' }), item({ deviceSn: 'B' }))).toBe(0)
  })
})
