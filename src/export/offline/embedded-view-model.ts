import type { OfflinePageViewModel } from '@/src/export/offline/types'

const embeddedVmPattern = /<script>window\.__OFFLINE_VM__ = (.*?);<\/script>/s

function isPageKind(value: unknown): value is OfflinePageViewModel['kind'] {
  return value === 'device' || value === 'overview' || value === 'inverter'
}

/**
 * Reads only the serialized view model embedded in an existing offline HTML page.
 * This lets a review package be visually refreshed when the original source Excel
 * files are no longer present, without inventing or querying device data.
 */
export function extractEmbeddedOfflineViewModel(html: string): OfflinePageViewModel {
  const match = html.match(embeddedVmPattern)
  if (!match) throw new Error('离线 HTML 中没有可读取的页面视图模型。')

  let parsed: unknown
  try {
    parsed = JSON.parse(match[1])
  } catch {
    throw new Error('离线 HTML 中的页面视图模型不是有效 JSON。')
  }

  if (!parsed || typeof parsed !== 'object' || !isPageKind((parsed as { kind?: unknown }).kind)) {
    throw new Error('离线 HTML 中的页面视图模型类型无效。')
  }
  return parsed as OfflinePageViewModel
}
