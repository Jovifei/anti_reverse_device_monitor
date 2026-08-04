'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useTransition } from 'react'
import { decideSoftRefresh } from '@/src/domain/soft-refresh-policy'

/** Soft-refresh cadence for the light fleet list only. */
const INTERVAL_MS = 45_000
const COOLDOWN_MS = 30_000
const LIVE_FETCH_MS = 4_000
/** Clear stuck client pending flag — never start another refresh while one is pending. */
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
  const isPendingRef = useRef(false)
  const pendingSinceRef = useRef(0)
  const inFlightRef = useRef(false)
  const lastStartedRef = useRef(0)
  const lastFingerprintRef = useRef<string | null>(null)
  const pathnameRef = useRef(pathname)

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    isPendingRef.current = isPending
    if (isPending) {
      if (!pendingSinceRef.current) pendingSinceRef.current = Date.now()
    } else {
      pendingSinceRef.current = 0
    }
  }, [isPending])

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      if (cancelled || document.hidden || inFlightRef.current) return

      const nowMs = Date.now()
      const pendingMs = pendingSinceRef.current ? nowMs - pendingSinceRef.current : 0
      const precheck = decideSoftRefresh({
        pathname: pathnameRef.current,
        fingerprint: 'probe',
        lastFingerprint: null,
        isPending: isPendingRef.current,
        pendingMs,
        nowMs,
        lastStartedMs: lastStartedRef.current,
        cooldownMs: COOLDOWN_MS,
        pendingStaleMs: PENDING_STALE_MS
      })

      if (precheck.action === 'clear-stale-pending') {
        // Drop the wedged client lockout without stacking another RSC flight.
        pendingSinceRef.current = 0
        isPendingRef.current = false
        return
      }
      if (precheck.action === 'skip' && (precheck.reason === 'heavy-route' || precheck.reason === 'pending' || precheck.reason === 'cooldown')) {
        return
      }

      inFlightRef.current = true
      lastStartedRef.current = nowMs
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
          pendingStaleMs: PENDING_STALE_MS
        })

        if (decision.action === 'clear-stale-pending') {
          pendingSinceRef.current = 0
          isPendingRef.current = false
          return
        }
        if (decision.action === 'seed-fingerprint') {
          lastFingerprintRef.current = fingerprint
          return
        }
        if (decision.action !== 'refresh') return

        // Bust cache only when we will actually refresh the light fleet page.
        void fetch('/api/live', { method: 'POST', cache: 'no-store' }).catch(() => {})
        lastFingerprintRef.current = fingerprint
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
  }, [router, startTransition])

  return null
}
