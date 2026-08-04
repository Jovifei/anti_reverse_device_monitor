'use client'

import { useEffect, useState } from 'react'
import {
  buildInitialLiveKpis,
  toLiveKpiMetricRows,
  type LiveKpiState
} from '@/src/domain/live-kpis'

const EMPTY = '—'
const INTERVAL_MS = 60_000
const FETCH_MS = 8_000

function MetricCard({
  label,
  value,
  hint,
  hero,
  danger
}: {
  label: string
  value: string
  hint?: string
  hero?: boolean
  danger?: boolean
}) {
  const className = ['metric-card', hero ? 'is-hero' : '', danger ? 'is-danger' : ''].filter(Boolean).join(' ')
  return (
    <div className={className}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  )
}

export function DeviceLiveKpiBand({
  deviceSn,
  initial,
  showPhases = false
}: {
  deviceSn: string
  initial: LiveKpiState
  showPhases?: boolean
}) {
  const [kpis, setKpis] = useState(initial)

  useEffect(() => {
    setKpis(initial)
  }, [initial])

  useEffect(() => {
    let cancelled = false
    let timer: number | null = null

    const tick = async () => {
      if (cancelled || document.hidden) return
      const controller = new AbortController()
      const abortTimer = window.setTimeout(() => controller.abort(), FETCH_MS)
      try {
        const response = await fetch(`/api/devices/${encodeURIComponent(deviceSn)}/latest`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal
        })
        if (!response.ok || cancelled) return
        const payload = await response.json()
        const rows = toLiveKpiMetricRows(payload)
        if (!rows.length || cancelled) return
        setKpis(buildInitialLiveKpis(rows, initial.hint))
      } catch {
        // Silent skip — keep SSR values.
      } finally {
        window.clearTimeout(abortTimer)
      }
    }

    void tick()
    timer = window.setInterval(() => {
      void tick()
    }, INTERVAL_MS)

    const onVisible = () => {
      if (!document.hidden) void tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      if (timer !== null) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [deviceSn, initial.hint])

  return (
    <>
      <div className="ct-kpi-band" aria-label="功率与发电量摘要">
        <div className="power-hero-grid overview-inner-grid">
          <MetricCard label="当前家庭负载功率" value={kpis.loadPower} hint={kpis.hint} hero />
          <MetricCard label="微逆发电总功率" value={kpis.generationPower} hint={kpis.hint} hero />
          <MetricCard label="当前电网功率" value={kpis.gridPower} hint={kpis.hint} hero danger={kpis.gridDanger} />
        </div>
        <div className="energy-secondary-grid overview-inner-grid">
          <MetricCard label="今日发电时长" value={kpis.todayDuration} hint={kpis.hint} hero />
          <MetricCard label="今日发电量" value={kpis.todayEnergy} hint={kpis.hint} hero />
          <MetricCard label="累计发电量" value={kpis.totalEnergy} hint={kpis.hint} hero />
        </div>
      </div>
      {showPhases ? (
        <div className="live-phase-strip" aria-label="三相功率快照（自动刷新）">
          {([
            ['A', kpis.phaseA, kpis.phaseAReverse],
            ['B', kpis.phaseB, kpis.phaseBReverse],
            ['C', kpis.phaseC, kpis.phaseCReverse]
          ] as const).map(([phase, value, reverse]) => (
            <div key={phase} className={`live-phase-chip ${reverse ? 'is-danger' : ''}`}>
              <span className="label">{phase} 相</span>
              <strong>{value || EMPTY}</strong>
              <span className="hint">{reverse ? '正在反送' : '正常'}</span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  )
}
