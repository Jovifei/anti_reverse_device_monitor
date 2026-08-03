import { formatDuration, formatTime } from '@/src/domain/monitoring'
import { mapSourceLabel, safeFileToken } from '@/src/export/offline/html-utils'
import type { OfflineDeviceViewModel, OfflineOverviewItem, OfflineOverviewViewModel } from '@/src/export/offline/types'
import { DeviceService } from '@/src/services/device-service'

const OFFLINE_NOTICE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

function offlineMinutes(lastReportedAt: string | null | undefined) {
  if (!lastReportedAt) return null
  const parsed = new Date(lastReportedAt.replaceAll('/', '-'))
  if (Number.isNaN(parsed.getTime())) return null
  return Math.max(0, Math.round((Date.now() - parsed.getTime()) / 60_000))
}

function offlineDisplay(minutes: number | null) {
  return minutes === null ? '—' : formatDuration(minutes)
}

export function buildOfflineOverviewFromDevices(
  devices: OfflineDeviceViewModel[],
  options: { title: string; sourceLabel: string }
): OfflineOverviewViewModel {
  const items: OfflineOverviewItem[] = devices.map((device) => {
    const minutes = device.ctOnline ? null : offlineMinutes(device.lastReportedAt)
    const offlineAlert = !device.ctOnline && (minutes === null || minutes < OFFLINE_NOTICE_WINDOW_MS)
    const reverseState = device.ctOnline
      ? (device.reverseNow ? 'active' : 'normal')
      : (device.reverseNow ? 'unknown-last-seen-reverse' : 'unknown')
    return {
      deviceSn: device.deviceSn,
      isOnline: device.ctOnline,
      lastReportedAt: device.lastReportedAt,
      offlineDuration: offlineDisplay(minutes),
      offlineAlert,
      reverseState,
      reversePhases: device.reversePhases.length ? device.reversePhases.join(' / ') : '—',
      todayEnergy: device.todayEnergy,
      onlineInverterCount: device.inverters.filter((item) => item.statusVariant === 'online').length,
      inverterCount: device.inverters.filter((item) => item.statusVariant !== 'unpaired').length || device.inverters.length,
      runtimeState: device.ctState,
      limitState: device.limitState,
      sub1gState: device.sub1gState,
      wifiSignal: device.wifiSignal ?? '—',
      href: `./device-${safeFileToken(device.deviceSn)}.html`
    }
  })
  items.sort((left, right) => {
    const priority = (item: OfflineOverviewItem) => item.reverseState === 'active' ? 0 : item.offlineAlert ? 1 : item.isOnline ? 2 : 3
    return priority(left) - priority(right) || left.deviceSn.localeCompare(right.deviceSn)
  })
  return {
    kind: 'overview',
    title: options.title,
    sourceLabel: options.sourceLabel,
    items,
    summary: {
      activeTotal: items.length,
      onlineCtCount: items.filter((item) => item.isOnline).length,
      offlineCtCount: items.filter((item) => !item.isOnline).length,
      criticalReverseFlowCount: items.filter((item) => item.reverseState === 'active').length,
      actionableOfflineCount: items.filter((item) => item.offlineAlert).length,
      staleOfflineCount: items.filter((item) => !item.isOnline && !item.offlineAlert).length
    }
  }
}

export async function buildOverviewViewModel(days = 7, options?: { sourceLabelOverride?: string }): Promise<OfflineOverviewViewModel> {
  const service = new DeviceService()
  void days
  const list = await service.listDevices({ page: '1', pageSize: '100' })
  const items: OfflineOverviewItem[] = list.items.map((item) => ({
    deviceSn: item.deviceSn,
    isOnline: item.isOnline,
    lastReportedAt: formatTime(item.lastReportedAt),
    offlineDuration: item.offlineMinutes === null ? '—' : formatDuration(item.offlineMinutes),
    offlineAlert: item.offlineAlert,
    reverseState: item.reverseState,
    reversePhases: item.reverseFlowPhases.length ? item.reverseFlowPhases.join(' / ') : '—',
    todayEnergy: item.todayEnergy,
    onlineInverterCount: item.onlineInverterCount,
    inverterCount: item.inverterCount || 8,
    runtimeState: item.runtimeState,
    limitState: item.limitState,
    sub1gState: item.sub1gState,
    wifiSignal: item.wifiSignal,
    href: `./device-${safeFileToken(item.deviceSn)}.html`
  }))
  items.sort((left, right) => {
    const priority = (item: OfflineOverviewItem) => item.reverseState === 'active' ? 0 : item.offlineAlert ? 1 : item.isOnline ? 2 : 3
    return priority(left) - priority(right) || left.deviceSn.localeCompare(right.deviceSn)
  })
  return {
    kind: 'overview',
    title: '防逆流设备离线总览',
    sourceLabel: options?.sourceLabelOverride ?? mapSourceLabel('ui-demo'),
    items,
    summary: list.summary
  }
}
