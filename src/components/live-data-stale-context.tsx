'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react'

type LiveDataStaleContextValue = {
  dataStale: boolean
  setDataStale: (stale: boolean) => void
  markHeavyFullRefresh: () => void
  lastHeavyFullRefreshMs: number
  clearStaleAfterManualRefresh: () => void
}

const LiveDataStaleContext = createContext<LiveDataStaleContextValue | null>(null)

export function LiveDataStaleProvider({ children }: { children: ReactNode }) {
  const [dataStale, setDataStale] = useState(false)
  const [lastHeavyFullRefreshMs, setLastHeavyFullRefreshMs] = useState(0)

  const markHeavyFullRefresh = useCallback(() => {
    setLastHeavyFullRefreshMs(Date.now())
    setDataStale(false)
  }, [])

  const clearStaleAfterManualRefresh = useCallback(() => {
    setLastHeavyFullRefreshMs(Date.now())
    setDataStale(false)
  }, [])

  const value = useMemo(
    () => ({
      dataStale,
      setDataStale,
      markHeavyFullRefresh,
      lastHeavyFullRefreshMs,
      clearStaleAfterManualRefresh
    }),
    [dataStale, lastHeavyFullRefreshMs, markHeavyFullRefresh, clearStaleAfterManualRefresh]
  )

  return <LiveDataStaleContext.Provider value={value}>{children}</LiveDataStaleContext.Provider>
}

export function useLiveDataStale() {
  const ctx = useContext(LiveDataStaleContext)
  if (!ctx) {
    throw new Error('useLiveDataStale must be used within LiveDataStaleProvider')
  }
  return ctx
}

/** Safe for SoftRefreshButton on fleet page — no-op when provider missing should not happen. */
export function useLiveDataStaleOptional() {
  return useContext(LiveDataStaleContext)
}
