'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

const INTERVAL_MS = 10_000

export function LiveSourcePoller() {
  const router = useRouter()
  const busyRef = useRef(false)
  const [hint, setHint] = useState('')

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      if (cancelled || busyRef.current || document.hidden) return
      busyRef.current = true
      try {
        const response = await fetch('/api/source/sync', { method: 'POST' })
        const payload = (await response.json().catch(() => null)) as
          | { status?: string; imported?: number; reason?: string }
          | null
        if (cancelled) return
        if (payload?.status === 'skipped') {
          setHint('')
          return
        }
        if (payload?.status === 'busy') {
          setHint('同步进行中…')
          return
        }
        const imported = Number(payload?.imported ?? 0)
        if (imported > 0) {
          setHint(`已增量同步 ${imported} 条`)
          router.refresh()
        } else if (payload?.status === 'completed' || payload?.status === 'dry-run') {
          setHint('已检查最新数据')
        } else if (payload?.status === 'failed') {
          setHint('增量同步失败')
        }
      } catch {
        if (!cancelled) setHint('增量同步失败')
      } finally {
        busyRef.current = false
      }
    }

    const timer = window.setInterval(tick, INTERVAL_MS)
    const onVisible = () => {
      if (!document.hidden) void tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [router])

  if (!hint) return null
  return <p className="live-sync-hint" aria-live="polite">{hint}</p>
}
