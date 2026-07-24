import { formatTime } from '@/src/domain/monitoring'
import { mapSourceLabel } from '@/src/export/offline/html-utils'
import { safeFileToken } from '@/src/export/offline/html-utils'
import type { OfflineOverviewViewModel } from '@/src/export/offline/types'
import { EMPTY } from '@/src/export/offline/types'
import { DeviceService } from '@/src/services/device-service'

export async function buildOverviewViewModel(
  days = 7,
  options?: { sourceLabelOverride?: string }
): Promise<OfflineOverviewViewModel> {
  const service = new DeviceService()
  void days
  const list = await service.listDevices({ page: '1', pageSize: '100' })
  return {
    kind: 'overview',
    title: '防逆流设备离线总览',
    sourceLabel: options?.sourceLabelOverride ?? mapSourceLabel('ui-demo'),
    summary: list.summary,
    items: list.items.map((item) => ({
      deviceSn: item.deviceSn,
      productModel: item.productModel ?? EMPTY,
      isOnline: item.isOnline,
      lastReportedAt: formatTime(item.lastReportedAt),
      reverseFlow: item.reverseFlow,
      reversePhases: item.reverseFlowPhases.length ? item.reverseFlowPhases.join('、') : EMPTY,
      href: `./device-${safeFileToken(item.deviceSn)}.html`
    }))
  }
}
