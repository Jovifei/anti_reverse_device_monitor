'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

export function SoftRefreshButton({ label = '刷新数据' }: { label?: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [, startTransition] = useTransition()

  return (
    <button
      type="button"
      className="secondary-button soft-refresh-button"
      disabled={pending}
      onClick={() => {
        if (pending) return
        setPending(true)
        void (async () => {
          try {
            await fetch('/api/live', { method: 'POST', cache: 'no-store' })
          } catch {
            // Fall through to soft refresh.
          }
          startTransition(() => {
            router.refresh()
            setPending(false)
          })
        })()
      }}
    >
      {pending ? '刷新中…' : label}
    </button>
  )
}
