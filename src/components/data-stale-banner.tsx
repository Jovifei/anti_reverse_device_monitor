'use client'

import { SoftRefreshButton } from '@/src/components/soft-refresh-button'
import { useLiveDataStale } from '@/src/components/live-data-stale-context'

export function DataStaleBanner() {
  const { dataStale } = useLiveDataStale()
  if (!dataStale) return null

  return (
    <div className="data-stale-banner" role="status">
      <p>
        同步源有更新。点击刷新可立刻更新曲线与历史；否则最多约 5 分钟后自动整页刷新一次。
      </p>
      <SoftRefreshButton label="刷新完整页面" />
    </div>
  )
}
