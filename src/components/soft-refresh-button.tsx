'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

const LIVE_FETCH_MS = 4_000
/** Brief UI feedback; never wait on RSC or /api/live (those can hang under SQLite lock). */
const BUSY_FEEDBACK_MS = 500
/** Failsafe so the button never sticks on 刷新中… */
const PENDING_FAILSAFE_MS = 8_000

export function SoftRefreshButton({ label = '刷新数据' }: { label?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()
  const failsafeRef = useRef<number | null>(null)
  const feedbackRef = useRef<number | null>(null)
  const generationRef = useRef(0)

  const clearTimers = () => {
    if (failsafeRef.current !== null) {
      window.clearTimeout(failsafeRef.current)
      failsafeRef.current = null
    }
    if (feedbackRef.current !== null) {
      window.clearTimeout(feedbackRef.current)
      feedbackRef.current = null
    }
  }

  const finish = (generation: number) => {
    if (generationRef.current !== generation) return
    setBusy(false)
    clearTimers()
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
        clearTimers()
        failsafeRef.current = window.setTimeout(() => finish(generation), PENDING_FAILSAFE_MS)

        // Best-effort cache bust only — never await. A wedged Next/SQLite must not block refresh UI.
        const controller = new AbortController()
        window.setTimeout(() => controller.abort(), LIVE_FETCH_MS)
        void fetch('/api/live', { method: 'POST', cache: 'no-store', signal: controller.signal }).catch(() => {})

        startTransition(() => {
          router.refresh()
        })
        feedbackRef.current = window.setTimeout(() => finish(generation), BUSY_FEEDBACK_MS)
      }}
    >
      {busy ? '刷新中…' : label}
    </button>
  )
}
