'use client'

import * as echarts from 'echarts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildBeijingDayNightBands, seriesNeedsDayNightBands, visibleSeriesTimeRange } from '@/src/domain/beijing-sun'

const NEGATIVE_WARN_COLOR = '#c92828'

type ChartPoint = [string, number | null]

function splitNegativeWarningPoints(points: ChartPoint[]) {
  const normal: ChartPoint[] = []
  const warning: ChartPoint[] = []
  const warningDots: Array<[string, number]> = []
  for (const point of points) {
    const value = point[1]
    if (typeof value === 'number' && value < 0) {
      normal.push([point[0], null])
      warning.push(point)
      warningDots.push([point[0], value])
    } else {
      normal.push(point)
      warning.push([point[0], null])
    }
  }
  return { normal, warning, warningDots }
}

export interface ClientChartSeries {
  key: string
  label: string
  unit: string
  color: string
  markNegative?: boolean
  dailyReset?: boolean
  /** Hold previous value until next sample, then jump (no diagonal interpolation). */
  step?: 'start' | 'middle' | 'end'
  points: Array<[string, number]>
}

type Props = {
  title: string
  series: ClientChartSeries[]
  height?: number
  initialSelectedKeys?: string[]
  advancedKeys?: string[]
  /** 功率曲线默认开启：按北京日出日落着色昼/夜背景 */
  dayNightBands?: boolean
}

function partsInTz(ms: number) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.APP_TIMEZONE || 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  })
  const map: Record<string, string> = {}
  for (const part of fmt.formatToParts(new Date(ms))) {
    if (part.type !== 'literal') map[part.type] = part.value
  }
  return map
}

function formatAxisLabel(ms: number, days: number) {
  const p = partsInTz(ms)
  // Always show down to hour; day/hour layout depends on window width.
  if (days <= 1) return `${p.hour}:${p.minute}`
  return `${p.month}-${p.day}\n${p.hour}:${p.minute}`
}

function formatTooltipTime(ms: number) {
  const p = partsInTz(ms)
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`
}

function unitAxisName(unit: string) {
  if (unit === 'W') return '功率 (W)'
  if (unit === 'V') return '电压 (V)'
  if (unit === 'Hz') return '频率 (Hz)'
  if (unit === '°C') return '温度 (°C)'
  if (unit === 'kWh') return '电量 (kWh)'
  if (unit === 'h') return '时长 (h)'
  return unit || ''
}

function buildAxisPlan(visible: ClientChartSeries[]) {
  const units = Array.from(new Set(visible.map((item) => item.unit).filter(Boolean)))
  const hasV = units.includes('V')
  const hasHz = units.includes('Hz')
  if (hasV && hasHz) {
    return {
      dual: true as const,
      yAxis: [
        {
          type: 'value' as const,
          name: '电压 (V)',
          nameLocation: 'middle' as const,
          nameGap: 48,
          nameTextStyle: { color: '#2563eb', fontWeight: 700 },
          axisLabel: { color: '#7a8799' },
          splitLine: { lineStyle: { color: '#e8edf4' } }
        },
        {
          type: 'value' as const,
          name: '频率 (Hz)',
          nameLocation: 'middle' as const,
          nameGap: 42,
          nameTextStyle: { color: '#9333ea', fontWeight: 700 },
          axisLabel: { color: '#7a8799' },
          splitLine: { show: false }
        }
      ],
      gridRight: 56
    }
  }
  return {
    dual: false as const,
    yAxis: [
      {
        type: 'value' as const,
        name: unitAxisName(units[0] || ''),
        nameLocation: 'middle' as const,
        nameGap: 52,
        nameTextStyle: { color: '#43516a', fontWeight: 700 },
        axisLabel: { color: '#7a8799' },
        splitLine: { lineStyle: { color: '#e8edf4' } }
      }
    ],
    gridRight: 28
  }
}

export function TelemetryChart({ title, series, height = 430, initialSelectedKeys, advancedKeys = [], dayNightBands }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const [days, setDays] = useState(7)
  const [selected, setSelected] = useState(() => new Set(initialSelectedKeys ?? series.filter((item) => item.points.length > 0).map((item) => item.key)))
  const visible = useMemo(() => {
    const latest = series.reduce((max, item) => {
      for (const [at] of item.points) {
        const t = new Date(at).getTime()
        if (Number.isFinite(t) && t > max) max = t
      }
      return max
    }, 0) || Date.now()
    const cutoff = latest - days * 86_400_000
    return series
      .filter((item) => selected.has(item.key))
      .map((item) => ({ ...item, points: item.points.filter(([at]) => new Date(at).getTime() >= cutoff) }))
      .filter((item) => item.points.length > 0)
  }, [days, selected, series])
  const enableDayNight = dayNightBands ?? seriesNeedsDayNightBands(visible.map((item) => item.unit))

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const chart = echarts.init(container)
    chartRef.current = chart
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(container)
    const reset = () => chart.dispatchAction({ type: 'dataZoom', start: 0, end: 100 })
    container.addEventListener('dblclick', reset)
    return () => {
      container.removeEventListener('dblclick', reset)
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const axisPlan = buildAxisPlan(visible)
    const unitByName = Object.fromEntries(visible.map((item) => [item.label, item.unit || '']))
    const range = visibleSeriesTimeRange(visible.map((item) => item.points))
    const bands = enableDayNight && range ? buildBeijingDayNightBands(range.startMs, range.endMs) : null
    const showSunLabels = days <= 1
    const dayNightSeries = bands && bands.markAreaData.length
      ? [{
          name: '昼夜背景',
          type: 'line' as const,
          data: [],
          silent: true,
          tooltip: { show: false },
          markArea: { silent: true, data: bands.markAreaData },
          markLine: showSunLabels
            ? {
                silent: true,
                symbol: 'none',
                label: { show: true, formatter: '{b}', color: '#8a6a1a', fontSize: 10, position: 'insideEndTop' as const },
                lineStyle: { color: '#d4a017', type: 'dashed' as const, width: 1, opacity: 0.85 },
                data: [
                  ...bands.sunriseLines.map((item) => ({ xAxis: item.xAxis, name: item.name })),
                  ...bands.sunsetLines.map((item) => ({ xAxis: item.xAxis, name: item.name, lineStyle: { color: '#6b7280' } }))
                ]
              }
            : undefined
        }]
      : []
    chart.setOption({
      animationDuration: 320,
      animationEasing: 'cubicOut',
      color: visible.map((item) => item.color),
      grid: { left: 68, right: axisPlan.gridRight, top: 42, bottom: days <= 1 ? 84 : 98 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(23, 35, 58, .94)',
        borderWidth: 0,
        borderRadius: 10,
        textStyle: { color: '#fff', fontSize: 12 },
        padding: [10, 14],
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? params : [params]
          if (!list.length) return ''
          const first = list[0] as { value?: [number | string, number] }
          const ts = Array.isArray(first.value) ? Number(first.value[0]) : Date.now()
          const lines = list
            .filter((item) => (item as { seriesType?: string }).seriesType === 'line')
            .filter((item) => {
              const name = (item as { seriesName?: string }).seriesName ?? ''
              return name !== '昼夜背景' && !name.includes('·负')
            })
            .map((item) => {
              const row = item as { marker?: string; seriesName?: string; value?: [number | string, number | null] }
              let raw = Array.isArray(row.value) ? row.value[1] : null
              if ((raw === null || raw === undefined) && row.seriesName && Array.isArray(row.value)) {
                const series = visible.find((entry) => entry.label === row.seriesName)
                const ts = row.value[0]
                const hit = series?.points.find((point) => point[0] === ts || new Date(point[0]).getTime() === new Date(ts).getTime())
                if (hit) raw = hit[1]
              }
              const text = raw === null || raw === undefined ? '—' : Number(raw).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
              const unit = unitByName[row.seriesName ?? ''] || ''
              const warn = typeof raw === 'number' && raw < 0
              return `${row.marker ?? ''}${row.seriesName ?? ''}: ${text}${unit ? ` ${unit}` : ''}${warn ? '（负值警示）' : ''}`
            })
          return [`时间 ${formatTooltipTime(ts)}`, ...lines].join('<br/>')
        }
      },
      legend: { top: 7, type: 'scroll', textStyle: { color: '#667085' }, data: visible.map((item) => item.label) },
      xAxis: {
        type: 'time',
        name: '时间',
        nameLocation: 'middle',
        nameGap: days <= 1 ? 28 : 36,
        nameTextStyle: { color: '#43516a', fontWeight: 700 },
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#cdd7e5' } },
        axisLabel: {
          color: '#7a8799',
          hideOverlap: true,
          formatter: (value: number) => formatAxisLabel(value, days)
        }
      },
      yAxis: axisPlan.yAxis,
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: true },
        { type: 'slider', xAxisIndex: 0, height: 24, bottom: 16, labelFormatter: (value: number) => formatAxisLabel(value, days) }
      ],
      series: [
        ...dayNightSeries,
        ...visible.flatMap((item) => {
          const yAxisIndex = axisPlan.dual && item.unit === 'Hz' ? 1 : 0
          const chartPoints = item.dailyReset
            ? item.points.flatMap((point, index) => {
                if (index === 0) return [point]
                const prev = item.points[index - 1]
                const cur = partsInTz(new Date(point[0]).getTime())
                const before = partsInTz(new Date(prev[0]).getTime())
                const crossed = cur.year !== before.year || cur.month !== before.month || cur.day !== before.day
                return crossed && point[1] < prev[1] ? [[point[0], null] as [string, null], point] : [point]
              })
            : item.points
          const lineBase = {
            name: item.label,
            type: 'line' as const,
            showSymbol: false,
            symbol: 'none' as const,
            smooth: item.step ? false : 0.12,
            step: item.step,
            connectNulls: false,
            sampling: undefined,
            yAxisIndex,
            emphasis: { focus: 'series' as const }
          }
          if (!item.markNegative) {
            return [{
              ...lineBase,
              lineStyle: { width: 2.25, color: item.color },
              data: chartPoints
            }]
          }
          const split = splitNegativeWarningPoints(chartPoints as ChartPoint[])
          const zeroLine = {
            silent: true,
            symbol: 'none' as const,
            lineStyle: { color: NEGATIVE_WARN_COLOR, type: 'dashed' as const },
            label: { formatter: '0 W 基准线', color: NEGATIVE_WARN_COLOR },
            data: [{ yAxis: 0 }]
          }
          // Primary series blanks negatives so only the red warning stroke/points remain visible there.
          const layers: echarts.SeriesOption[] = [{
            ...lineBase,
            lineStyle: { width: 2.25, color: item.color },
            data: split.normal,
            markLine: zeroLine
          }]
          if (split.warningDots.length > 0) {
            layers.push({
              name: `${item.label}·负值`,
              type: 'line',
              showSymbol: false,
              symbol: 'none',
              smooth: item.step ? false : 0.12,
              step: item.step,
              connectNulls: false,
              yAxisIndex,
              lineStyle: { width: 2.75, color: NEGATIVE_WARN_COLOR },
              data: split.warning,
              z: 3,
              silent: true,
              tooltip: { show: false },
              legendHoverLink: false,
              emphasis: { disabled: true }
            })
            layers.push({
              name: `${item.label}·负值点`,
              type: 'scatter',
              yAxisIndex,
              data: split.warningDots,
              symbolSize: 8,
              itemStyle: { color: NEGATIVE_WARN_COLOR, borderColor: '#fff', borderWidth: 1 },
              tooltip: { show: false },
              silent: true,
              z: 4
            })
          }
          return layers
        })
      ]
    }, { notMerge: true })
  }, [visible, days, enableDayNight])

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const primarySeries = advancedKeys.length ? series.filter((item) => !advancedKeys.includes(item.key)) : series
  const extraSeries = advancedKeys.length ? series.filter((item) => advancedKeys.includes(item.key)) : []
  const renderToggle = (item: ClientChartSeries) => <label key={item.key}><input type="checkbox" checked={selected.has(item.key)} onChange={() => toggle(item.key)} disabled={item.points.length === 0} /><i style={{ backgroundColor: item.color }} />{item.label}{item.unit ? ` (${item.unit})` : ''}</label>

  return <section className="chart-panel">
    <div className="panel-heading"><h2>{title}</h2><button type="button" className="secondary-button" onClick={() => chartRef.current?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 })}>复位缩放</button></div>
    <div className="chart-controls"><label>范围 <select value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={1}>最近 24 小时</option><option value={3}>最近 3 天</option><option value={7}>最近 7 天</option></select></label><span>滚轮缩放 · 拖动平移 · 双击复位</span>{enableDayNight ? <span className="day-night-legend"><i className="day" />昼 <i className="night" />夜 · 北京日出日落</span> : null}</div>
    <div className="series-toggles">{primarySeries.map(renderToggle)}</div>
    {extraSeries.length ? <details className="advanced-series"><summary>更多曲线</summary><div className="series-toggles">{extraSeries.map(renderToggle)}</div></details> : null}
    {visible.length > 0 ? <div ref={containerRef} className="chart" style={{ height }} /> : <div className="empty-chart">当前范围没有可绘制的数据</div>}
  </section>
}
