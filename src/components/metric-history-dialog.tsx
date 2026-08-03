'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { TelemetryChart, type ClientChartSeries } from '@/src/components/telemetry-chart'

type Props = {
  label: string
  value?: string
  title?: string
  subtitle?: string
  detail?: string
  series: ClientChartSeries[]
  className?: string
  children?: ReactNode
}

export function MetricHistoryDialog({ label, value = '', title = label, subtitle, detail, series, className = '', children }: Props) {
  const [open, setOpen] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const updateViewport = () => setMobile(window.innerWidth <= 520)
    updateViewport()
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('metric-dialog-open')
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.body.classList.remove('metric-dialog-open')
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const dialog = open ? (
    <div className="metric-dialog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <section
        className={`metric-dialog ${mobile ? 'metric-dialog-mobile' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="metric-dialog-header">
          <div>
            <p className="eyebrow">历史遥测</p>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="dialog-close" aria-label="关闭历史曲线" onClick={() => setOpen(false)}>
            关闭
          </button>
        </header>
        <TelemetryChart title="" series={series} height={440} />
      </section>
    </div>
  ) : null

  return (
    <>
      <button
        type="button"
        className={`metric-history-trigger ${className}`.trim()}
        aria-label={`查看${label}历史曲线`}
        onClick={() => setOpen(true)}
      >
        {children ?? (
          <>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail ?? '点击查看最近 7 天曲线'}</small>
          </>
        )}
      </button>
      {mounted && dialog ? createPortal(dialog, document.body) : null}
    </>
  )
}
