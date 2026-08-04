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
}

export type SoftRefreshDecision =
  | { action: 'skip'; reason: string }
  | { action: 'refresh'; reason: string }
  | { action: 'seed-fingerprint'; reason: string }
  | { action: 'clear-stale-pending'; reason: string }

/** Heavy RSC routes: full soft-refresh reloads 8 inverter charts/history and can wedge Next. */
const HEAVY_ROUTE = /^\/devices\/[^/]+/i

export function isHeavyMonitorRoute(pathname: string): boolean {
  if (!pathname.startsWith('/devices')) return false
  // Fleet list `/devices` is light enough to auto-refresh.
  if (pathname === '/devices' || pathname === '/devices/') return false
  return HEAVY_ROUTE.test(pathname)
}

/**
 * Decide whether LiveSourcePoller may call router.refresh().
 * Never stacks a second refresh while one is pending — that is what wedges Next.
 */
export function decideSoftRefresh(input: SoftRefreshDecisionInput): SoftRefreshDecision {
  if (isHeavyMonitorRoute(input.pathname)) {
    return { action: 'skip', reason: 'heavy-route' }
  }
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
  if (input.fingerprint === input.lastFingerprint) {
    return { action: 'skip', reason: 'unchanged' }
  }
  return { action: 'refresh', reason: 'fingerprint-changed' }
}
