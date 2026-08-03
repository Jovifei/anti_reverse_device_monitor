'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

const LIVE_FETCH_MS = 4_000
/** Failsafe so the button never sticks on 刷新中… if RSC refresh hangs. */
const PENDING_FAILSAFE_MS = 12_000

export function SoftRefreshButton({ label = '刷新数据' }: { label?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()
  const failsafeRef = useRef<number | null>(null)
  const generationRef = useRef(0)

  const clearFailsafe = () => {
    if (failsafeRef.current !== null) {
      window.clearTimeout(failsafeRef.current)
      failsafeRef.current = null
    }
  }

  const finish = (generation: number) => {
    if (generationRef.current !== generation) return
    setBusy(false)
    clearFailsafe()
  }

  return (
    <button
      type="button"
      className="secondary-button soft-refresh-button"
      disabled={busy}
      onClick={() => {
        if (busy) return
        const generation = generationRef.current + 1
        generationRef.current = generation
        setBusy(true)
        clearFailsafe()
        failsafeRef.current = window.setTimeout(() => finish(generation), PENDING_FAILSAFE_MS)

        void (async () => {
          const controller = new AbortController()
          const abortTimer = window.setTimeout(() => controller.abort(), LIVE_FETCH_MS)
          try {
            await fetch('/api/live', { method: 'POST', cache: 'no-store', signal: controller.signal })
          } catch {
            // Fall through to soft refresh.
          } finally {
            window.clearTimeout(abortTimer)
          }

          if (generationRef.current !== generation) return
          startTransition(() => {
            router.refresh()
          })
          // Do not wait for the RSC flight — hung refreshes must not wedge the button.
          finish(generation)
        })()
      }}
    >
      {busy ? '刷新中…' : label}
    </button>
  )
}
