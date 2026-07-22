'use client'

import * as echarts from 'echarts'
import { useEffect, useMemo, useRef, useState } from 'react'

export interface ClientChartSeries { key: string; label: string; unit: string; color: string; markNegative?: boolean; points: Array<[string, number]> }

export function TelemetryChart({ title, series, height = 430 }: { title: string; series: ClientChartSeries[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const [days, setDays] = useState(7)
  const [selected, setSelected] = useState(() => new Set(series.filter((item) => item.points.length > 0).map((item) => item.key)))
  const visible = useMemo(() => {
    const cutoff = Date.now() - days * 86_400_000
    return series.filter((item) => selected.has(item.key)).map((item) => ({ ...item, points: item.points.filter(([at]) => new Date(at).getTime() >= cutoff) })).filter((item) => item.points.length > 0)
  }, [days, selected, series])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const chart = echarts.init(container)
    chartRef.current = chart
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(container)
    const reset = () => chart.dispatchAction({ type: 'dataZoom', start: 0, end: 100 })
    container.addEventListener('dblclick', reset)
    return () => { container.removeEventListener('dblclick', reset); observer.disconnect(); chart.dispose(); chartRef.current = null }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setOption({
      color: visible.map((item) => item.color), grid: { left: 58, right: 24, top: 38, bottom: 76 }, tooltip: { trigger: 'axis' }, legend: { top: 4, type: 'scroll' }, xAxis: { type: 'time', boundaryGap: false }, yAxis: { type: 'value', splitLine: { lineStyle: { color: '#e3e8ef' } } },
      dataZoom: [{ type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: true }, { type: 'slider', xAxisIndex: 0, height: 24, bottom: 16 }],
      series: visible.flatMap((item) => {
        const line = { name: item.label, type: 'line' as const, showSymbol: false, smooth: false, data: item.points, emphasis: { focus: 'series' as const } }
        const negative = item.markNegative ? [{ name: `${item.label} 逆流点`, type: 'scatter' as const, data: item.points.filter(([, value]) => value < 0), symbolSize: 7, itemStyle: { color: '#c92828' }, tooltip: { show: false }, silent: true }] : []
        return [line, ...negative]
      })
    }, { notMerge: true })
  }, [visible])

  function toggle(key: string) { setSelected((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next }) }

  return <section className="chart-panel"><div className="panel-heading"><h2>{title}</h2><button type="button" className="secondary-button" onClick={() => chartRef.current?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 })}>复位缩放</button></div><div className="chart-controls"><label>范围 <select value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={1}>最近 24 小时</option><option value={3}>最近 3 天</option><option value={7}>最近 7 天</option></select></label><span>滚轮缩放 · 拖动平移 · 双击复位</span></div><div className="series-toggles">{series.map((item) => <label key={item.key}><input type="checkbox" checked={selected.has(item.key)} onChange={() => toggle(item.key)} disabled={item.points.length === 0} /><i style={{ backgroundColor: item.color }} />{item.label}</label>)}</div>{visible.length > 0 ? <div ref={containerRef} className="chart" style={{ height }} /> : <div className="empty-chart">当前范围没有可绘制的数据</div>}</section>
}
