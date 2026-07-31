'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

export function SoftRefreshButton({ label = '刷新数据' }: { label?: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      className="secondary-button soft-refresh-button"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {pending ? '刷新中…' : label}
    </button>
  )
}
