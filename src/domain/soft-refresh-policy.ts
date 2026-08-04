export type SoftRefreshDecisionInput = {
  pathname: string
  fingerprint: string | null
  lastFingerprint: string | null
  isPending: boolean
  pendingMs: number
  nowMs: number
  lastStartedMs: number
  cooldownMs: number
  /** After this, treat a stuck transition as stale — but do NOT start another refresh. */
  pendingStaleMs: number
  /** True when heavy route already showed "new data" and waits for gated full refresh. */
  dataStale?: boolean
  /** Last full router.refresh on a heavy route (0 = never). */
  lastHeavyFullRefreshMs?: number
  /** Minimum gap between heavy full refreshes (default 5 minutes). */
  heavyFullRefreshMinMs?: number
}

export type SoftRefreshDecision =
  | { action: 'skip'; reason: string }
  | { action: 'refresh'; reason: string }
  | { action: 'seed-fingerprint'; reason: string }
  | { action: 'clear-stale-pending'; reason: string }
  | { action: 'notify-stale'; reason: string }

/** Default: detail/inverter full RSC at most once per 5 minutes when data is stale. */
export const DEFAULT_HEAVY_FULL_REFRESH_MIN_MS = 5 * 60_000

/** Heavy RSC routes: full soft-refresh reloads 8 inverter charts/history and can wedge Next. */
const HEAVY_ROUTE = /^\/devices\/[^/]+/i

export function isHeavyMonitorRoute(pathname: string): boolean {
  if (!pathname.startsWith('/devices')) return false
  // Fleet list `/devices` is light enough to auto-refresh.
  if (pathname === '/devices' || pathname === '/devices/') return false
  return HEAVY_ROUTE.test(pathname)
}

function heavyGateOpen(input: SoftRefreshDecisionInput): boolean {
  const minMs = input.heavyFullRefreshMinMs ?? DEFAULT_HEAVY_FULL_REFRESH_MIN_MS
  const last = input.lastHeavyFullRefreshMs ?? 0
  // 0 = never armed / never refreshed → do not auto full-refresh yet (banner only).
  if (last <= 0) return false
  return input.nowMs - last >= minMs
}

/**
 * Decide whether LiveSourcePoller may call router.refresh() or only notify stale UI.
 * Never stacks a second refresh while one is pending — that is what wedges Next.
 */
export function decideSoftRefresh(input: SoftRefreshDecisionInput): SoftRefreshDecision {
  if (input.isPending) {
    if (input.pendingMs >= input.pendingStaleMs) {
      return { action: 'clear-stale-pending', reason: 'pending-stale' }
    }
    return { action: 'skip', reason: 'pending' }
  }
  if (input.nowMs - input.lastStartedMs < input.cooldownMs) {
    return { action: 'skip', reason: 'cooldown' }
  }
  if (input.fingerprint === null) {
    return { action: 'skip', reason: 'no-fingerprint' }
  }
  if (input.lastFingerprint === null) {
    return { action: 'seed-fingerprint', reason: 'first-fingerprint' }
  }

  const heavy = isHeavyMonitorRoute(input.pathname)
  const changed = input.fingerprint !== input.lastFingerprint

  if (heavy) {
    if (changed) {
      if (heavyGateOpen(input)) {
        return { action: 'refresh', reason: 'heavy-fingerprint-gated' }
      }
      return { action: 'notify-stale', reason: 'heavy-fingerprint-changed' }
    }
    if (input.dataStale && heavyGateOpen(input)) {
      return { action: 'refresh', reason: 'heavy-stale-gated' }
    }
    return { action: 'skip', reason: input.dataStale ? 'heavy-waiting-gate' : 'unchanged' }
  }

  if (!changed) {
    return { action: 'skip', reason: 'unchanged' }
  }
  return { action: 'refresh', reason: 'fingerprint-changed' }
}
