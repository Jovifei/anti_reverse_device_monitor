'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useLiveDataStaleOptional } from '@/src/components/live-data-stale-context'

const LIVE_FETCH_MS = 4_000
/** Failsafe so the button never sticks forever if transition never settles. */
const PENDING_FAILSAFE_MS = 20_000

export function SoftRefreshButton({ label = '刷新数据' }: { label?: string }) {
  const router = useRouter()
  const stale = useLiveDataStaleOptional()
  const [busy, setBusy] = useState(false)
  const [isPending, startTransition] = useTransition()
  const failsafeRef = useRef<number | null>(null)
  const generationRef = useRef(0)

  useEffect(() => {
    if (!isPending && busy) {
      setBusy(false)
      stale?.endRefreshInFlight()
      if (failsafeRef.current !== null) {
        window.clearTimeout(failsafeRef.current)
        failsafeRef.current = null
      }
    }
  }, [isPending, busy, stale])

  const clearFailsafe = () => {
    if (failsafeRef.current !== null) {
      window.clearTimeout(failsafeRef.current)
      failsafeRef.current = null
    }
  }

  return (
    <button
      type="button"
      className="secondary-button soft-refresh-button"
      disabled={busy || Boolean(stale?.refreshInFlight)}
      onClick={() => {
        if (busy || stale?.refreshInFlight) return
        if (stale && !stale.beginRefreshInFlight()) return

        const generation = generationRef.current + 1
        generationRef.current = generation
        setBusy(true)
        clearFailsafe()
        failsafeRef.current = window.setTimeout(() => {
          if (generationRef.current !== generation) return
          setBusy(false)
          stale?.endRefreshInFlight()
        }, PENDING_FAILSAFE_MS)

        const controller = new AbortController()
        window.setTimeout(() => controller.abort(), LIVE_FETCH_MS)
        void fetch('/api/live', { method: 'POST', cache: 'no-store', signal: controller.signal }).catch(() => {})

        stale?.clearStaleAfterManualRefresh()

        startTransition(() => {
          router.refresh()
        })
      }}
    >
      {busy || stale?.refreshInFlight ? '刷新中…' : label}
    </button>
  )
}
