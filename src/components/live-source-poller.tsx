'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useTransition } from 'react'

/** Soft-refresh cadence. Device detail RSC is heavy; avoid stacking refreshes. */
const INTERVAL_MS = 15_000
/** Keep the lock after kickoff so overlapping router.refresh() flights cannot pile up. */
const COOLDOWN_MS = 12_000

export function LiveSourcePoller() {
  const router = useRouter()
  const [, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    let inFlight = false

    const tick = async () => {
      if (cancelled || document.hidden || inFlight) return
      inFlight = true
      try {
        try {
          await fetch('/api/live', { method: 'POST', cache: 'no-store' })
        } catch {
          // Still soft-refresh even if revalidate failed.
        }
        if (!cancelled) {
          startTransition(() => router.refresh())
        }
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, COOLDOWN_MS)
        })
      } finally {
        inFlight = false
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
