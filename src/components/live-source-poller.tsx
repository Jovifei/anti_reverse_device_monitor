'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useTransition } from 'react'
import {
  DEFAULT_HEAVY_FULL_REFRESH_MIN_MS,
  decideSoftRefresh,
  isHeavyMonitorRoute
} from '@/src/domain/soft-refresh-policy'
import { useLiveDataStale } from '@/src/components/live-data-stale-context'

const INTERVAL_MS = 45_000
const COOLDOWN_MS = 30_000
const LIVE_FETCH_MS = 4_000
const PENDING_STALE_MS = 60_000

type LiveFingerprint = {
  syncedAt: string | null
  lastReportedAt: string | null
  status: string | null
}

function fingerprintOf(payload: LiveFingerprint | null): string | null {
  if (!payload) return null
  return `${payload.syncedAt ?? ''}|${payload.lastReportedAt ?? ''}|${payload.status ?? ''}`
}

export function LiveSourcePoller() {
  const router = useRouter()
  const pathname = usePathname() || '/devices'
  const [isPending, startTransition] = useTransition()
  const {
    dataStale,
    setDataStale,
    lastHeavyFullRefreshMs,
    markHeavyFullRefresh,
    armHeavyRefreshClock,
    beginRefreshInFlight,
    endRefreshInFlight
  } = useLiveDataStale()

  const isPendingRef = useRef(false)
  const pendingSinceRef = useRef(0)
  const inFlightRef = useRef(false)
  const lastStartedRef = useRef(0)
  const lastFingerprintRef = useRef<string | null>(null)
  const pathnameRef = useRef(pathname)
  const dataStaleRef = useRef(dataStale)
  const lastHeavyFullRefreshMsRef = useRef(lastHeavyFullRefreshMs)

  useEffect(() => {
    pathnameRef.current = pathname
    if (!isHeavyMonitorRoute(pathname)) {
      setDataStale(false)
    }
  }, [pathname, setDataStale])

  useEffect(() => {
    dataStaleRef.current = dataStale
  }, [dataStale])

  useEffect(() => {
    lastHeavyFullRefreshMsRef.current = lastHeavyFullRefreshMs
  }, [lastHeavyFullRefreshMs])

  useEffect(() => {
    isPendingRef.current = isPending
    if (isPending) {
      if (!pendingSinceRef.current) pendingSinceRef.current = Date.now()
    } else {
      pendingSinceRef.current = 0
      endRefreshInFlight()
    }
  }, [isPending, endRefreshInFlight])

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      if (cancelled || document.hidden || inFlightRef.current) return

      const nowMs = Date.now()
      const pendingMs = pendingSinceRef.current ? nowMs - pendingSinceRef.current : 0

      if (isPendingRef.current) {
        if (pendingMs >= PENDING_STALE_MS) {
          pendingSinceRef.current = 0
          isPendingRef.current = false
          endRefreshInFlight()
        }
        return
      }

      inFlightRef.current = true
      try {
        const controller = new AbortController()
        const abortTimer = window.setTimeout(() => controller.abort(), LIVE_FETCH_MS)
        let fingerprint: string | null = null
        try {
          const response = await fetch('/api/live', { method: 'GET', cache: 'no-store', signal: controller.signal })
          if (response.ok) {
            const payload = (await response.json()) as LiveFingerprint
            fingerprint = fingerprintOf(payload)
          }
        } catch {
          // Fingerprint is best-effort; skip refresh rather than blind-refreshing.
        } finally {
          window.clearTimeout(abortTimer)
        }

        if (cancelled) return

        const decision = decideSoftRefresh({
          pathname: pathnameRef.current,
          fingerprint,
          lastFingerprint: lastFingerprintRef.current,
          isPending: isPendingRef.current,
          pendingMs: pendingSinceRef.current ? Date.now() - pendingSinceRef.current : 0,
          nowMs: Date.now(),
          lastStartedMs: lastStartedRef.current,
          cooldownMs: COOLDOWN_MS,
          pendingStaleMs: PENDING_STALE_MS,
          dataStale: dataStaleRef.current,
          lastHeavyFullRefreshMs: lastHeavyFullRefreshMsRef.current,
          heavyFullRefreshMinMs: DEFAULT_HEAVY_FULL_REFRESH_MIN_MS
        })

        if (decision.action === 'clear-stale-pending') {
          pendingSinceRef.current = 0
          isPendingRef.current = false
          endRefreshInFlight()
          return
        }
        if (decision.action === 'seed-fingerprint') {
          lastFingerprintRef.current = fingerprint
          return
        }
        if (decision.action === 'notify-stale') {
          lastFingerprintRef.current = fingerprint
          setDataStale(true)
          armHeavyRefreshClock()
          lastHeavyFullRefreshMsRef.current =
            lastHeavyFullRefreshMsRef.current > 0 ? lastHeavyFullRefreshMsRef.current : Date.now()
          lastStartedRef.current = Date.now()
          return
        }
        if (decision.action !== 'refresh') return
        if (!beginRefreshInFlight()) return

        lastStartedRef.current = Date.now()
        void fetch('/api/live', { method: 'POST', cache: 'no-store' }).catch(() => {})
        lastFingerprintRef.current = fingerprint
        if (isHeavyMonitorRoute(pathnameRef.current)) {
          markHeavyFullRefresh()
        } else {
          setDataStale(false)
        }
        startTransition(() => {
          router.refresh()
        })
      } finally {
        inFlightRef.current = false
      }
    }

    void tick()
    const timer = window.setInterval(() => {
      void tick()
    }, INTERVAL_MS)

    const onVisible = () => {
      if (!document.hidden) void tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [
    router,
    startTransition,
    setDataStale,
    markHeavyFullRefresh,
    armHeavyRefreshClock,
    beginRefreshInFlight,
    endRefreshInFlight
  ])

  return null
}
