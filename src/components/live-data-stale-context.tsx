'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'

type LiveDataStaleContextValue = {
  dataStale: boolean
  setDataStale: (stale: boolean) => void
  markHeavyFullRefresh: () => void
  /** Start 5min auto-refresh clock without clearing the stale banner. */
  armHeavyRefreshClock: () => void
  lastHeavyFullRefreshMs: number
  clearStaleAfterManualRefresh: () => void
  /** Shared lock so SoftRefreshButton and LiveSourcePoller do not stack RSC refreshes. */
  refreshInFlight: boolean
  beginRefreshInFlight: () => boolean
  endRefreshInFlight: () => void
}

const LiveDataStaleContext = createContext<LiveDataStaleContextValue | null>(null)

export function LiveDataStaleProvider({ children }: { children: ReactNode }) {
  const [dataStale, setDataStale] = useState(false)
  const [lastHeavyFullRefreshMs, setLastHeavyFullRefreshMs] = useState(0)
  const [refreshInFlight, setRefreshInFlight] = useState(false)
  const refreshInFlightRef = useRef(false)
  const lastHeavyFullRefreshMsRef = useRef(0)

  const markHeavyFullRefresh = useCallback(() => {
    const now = Date.now()
    lastHeavyFullRefreshMsRef.current = now
    setLastHeavyFullRefreshMs(now)
    setDataStale(false)
  }, [])

  const armHeavyRefreshClock = useCallback(() => {
    if (lastHeavyFullRefreshMsRef.current > 0) return
    const now = Date.now()
    lastHeavyFullRefreshMsRef.current = now
    setLastHeavyFullRefreshMs(now)
  }, [])

  const clearStaleAfterManualRefresh = useCallback(() => {
    const now = Date.now()
    lastHeavyFullRefreshMsRef.current = now
    setLastHeavyFullRefreshMs(now)
    setDataStale(false)
  }, [])

  const beginRefreshInFlight = useCallback(() => {
    if (refreshInFlightRef.current) return false
    refreshInFlightRef.current = true
    setRefreshInFlight(true)
    return true
  }, [])

  const endRefreshInFlight = useCallback(() => {
    refreshInFlightRef.current = false
    setRefreshInFlight(false)
  }, [])

  const value = useMemo(
    () => ({
      dataStale,
      setDataStale,
      markHeavyFullRefresh,
      armHeavyRefreshClock,
      lastHeavyFullRefreshMs,
      clearStaleAfterManualRefresh,
      refreshInFlight,
      beginRefreshInFlight,
      endRefreshInFlight
    }),
    [
      dataStale,
      lastHeavyFullRefreshMs,
      markHeavyFullRefresh,
      armHeavyRefreshClock,
      clearStaleAfterManualRefresh,
      refreshInFlight,
      beginRefreshInFlight,
      endRefreshInFlight
    ]
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
