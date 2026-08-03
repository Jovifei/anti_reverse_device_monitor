'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useTransition } from 'react'

/** Soft-refresh cadence. Device detail RSC is heavy; keep this conservative. */
const INTERVAL_MS = 45_000
/** Minimum gap after a refresh starts before another may begin. */
const COOLDOWN_MS = 30_000
/** Abort hung /api/live so the poller cannot wedge forever. */
const LIVE_FETCH_MS = 4_000
/** If RSC refresh never settles, stop treating isPending as a hard lockout. */
const PENDING_STALE_MS = 60_000

export function LiveSourcePoller() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isPendingRef = useRef(false)
  const pendingSinceRef = useRef(0)
  const inFlightRef = useRef(false)
  const lastStartedRef = useRef(0)

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
      const pendingStale =
        isPendingRef.current &&
        pendingSinceRef.current > 0 &&
        Date.now() - pendingSinceRef.current > PENDING_STALE_MS
      if (isPendingRef.current && !pendingStale) return
      const now = Date.now()
      if (now - lastStartedRef.current < COOLDOWN_MS) return

      inFlightRef.current = true
      lastStartedRef.current = now
      try {
        // Fire-and-forget: awaiting /api/live during a wedged Next process parks the poller.
        const controller = new AbortController()
        window.setTimeout(() => controller.abort(), LIVE_FETCH_MS)
        void fetch('/api/live', { method: 'POST', cache: 'no-store', signal: controller.signal }).catch(() => {})

        if (cancelled) return
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
