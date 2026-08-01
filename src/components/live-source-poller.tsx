'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const INTERVAL_MS = 10_000

export function LiveSourcePoller() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      if (!cancelled && !document.hidden) router.refresh()
    }
    const timer = window.setInterval(refresh, INTERVAL_MS)
    const onVisible = () => {
      if (!document.hidden) refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [router])

  return null
}
