import Link from 'next/link'
import { DeviceSnSearch } from '@/src/components/device-sn-search'
import { MetricHistoryDialog } from '@/src/components/metric-history-dialog'
import { TelemetryChart, type ClientChartSeries } from '@/src/components/telemetry-chart'
import { faultDisplayNames } from '@/src/domain/faults'
import { INVERTER_KPI_ALIASES, displayValue, findLatestMetric, formatDuration, formatTime, getInverterStatus, getInverterWorkStatus, isGenerating, numericValue } from '@/src/domain/monitoring'
import { resolveStatusLabel } from '@/src/domain/dictionaries'
import { DeviceService } from '@/src/services/device-service'

const EMPTY = '—'

function MetricCard({ label, value, series }: { label: string; value: string; series?: ClientChartSeries[] }) {
  const content = <div className="metric-card"><div className="label">{label}</div><div className="value">{value}</div>{series ? <div className="hint">点击查看历史曲线</div> : null}</div>
  return series ? <MetricHistoryDialog label={label} series={series}>{content}</MetricHistoryDialog> : content
}

const faultEventLabel = { appeared: '故障出现', changed: '故障变化', recovered: '故障恢复' } as const

export default async function InverterPage({ params }: { params: Promise<{ sn: string; index: string }> }) {
  const { sn: rawSn, index } = await params
  const service = new DeviceService()
  let lookup: Awaited<ReturnType<DeviceService['resolveDeviceSn']>>
  try { lookup = await service.resolveDeviceSn(rawSn) } catch { lookup = { kind: 'not-found' as const } }
  if (lookup.kind !== 'resolved') return <main><section className="error-panel"><h1>微逆查询失败</h1><p>设备 SN 不存在或无法唯一识别。</p><Link href="/devices">返回设备总览</Link></section></main>
  const [summary, charts] = await Promise.all([service.getInverterSummary(lookup.deviceSn, index), service.getInverterChartData(lookup.deviceSn, index, { days: '7' })])
  if (!summary) return <main><section className="error-panel"><h1>微逆不存在</h1><p>该序号没有绑定信息或可用数据。</p><Link href={`/devices/${encodeURIComponent(lookup.deviceSn)}`}>返回 CT 页面</Link></section></main>

  const rows = summary.latestRows
  const onlineRaw = numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.onlineState))
  const workRaw = numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.workState))
  const status = summary.paired === false ? getInverterStatus(0) : getInverterStatus(onlineRaw)
  const faultRow = rows.find((row) => row.metricKey.toLowerCase().includes('fault'))
  const summaryFaultNames = summary.faults.flatMap((fault) => fault.faults.map((item) => item.name))
  const faultNames = summaryFaultNames.length ? Array.from(new Set(summaryFaultNames)) : faultDisplayNames(numericValue(faultRow))

  return <main>
    <header className="page-header"><div><p className="eyebrow">CT {summary.deviceSn}</p><h1>微型逆变器 {summary.inverterIndex}：{summary.inverterSn ?? EMPTY}</h1><p className="muted">软件版本 {summary.softwareVersion ?? EMPTY} · 硬件版本 {summary.hardwareVersion ?? EMPTY} · Sub1G 版本 {summary.sub1gVersion ?? EMPTY}</p></div><DeviceSnSearch initialSn={summary.deviceSn} /></header>
    <section className="inverter-hero"><div className="panel-heading"><div><h2>当前运行状态</h2><p className="muted">在线、工作与发电状态独立呈现。</p></div><span className={`badge ${status.variant}`}>{status.label}</span></div><div className="status-row"><div><strong>工作状态：</strong>{getInverterWorkStatus(workRaw)}</div><div><strong>当前是否发电：</strong>{isGenerating(numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.generating)), workRaw) ? '正在发电' : EMPTY}</div></div></section>
    <section className="detail-grid"><MetricCard label="当前发电总功率" value={displayValue(findLatestMetric(rows, ['inverter_power', 'generation_power', 'total_power', 'power']), 'W')} series={charts.power} /><MetricCard label="PV1 功率" value={displayValue(findLatestMetric(rows, ['pv1_power', 'pv1power']), 'W')} series={charts.power.filter((item) => item.key === 'pv1')} /><MetricCard label="PV2 功率" value={displayValue(findLatestMetric(rows, ['pv2_power', 'pv2power']), 'W')} series={charts.power.filter((item) => item.key === 'pv2')} /><MetricCard label="今日发电量" value={displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.todayEnergy))} /><MetricCard label="累计发电量" value={displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.totalEnergy))} /><MetricCard label="今日发电时长" value={displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.todayDuration))} /></section>
    <section className="panel"><h2>通信与接入配置</h2><div className="detail-grid"><MetricCard label="最近丢包率" value={displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.packetLoss), '%')} /><MetricCard label="所在相" value={resolveStatusLabel('phase_num', summary.phaseNum) ?? EMPTY} /><MetricCard label="接入点" value={resolveStatusLabel('connection_point', summary.connectionPoint) ?? EMPTY} /><MetricCard label="防逆流开关" value={displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.antiReverse))} /><MetricCard label="发电开关" value={displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.generationEnabled))} /><MetricCard label="功率限制" value={displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.powerLimit), '%')} /></div></section>
    <TelemetryChart title="发电总功率、PV1 与 PV2" series={charts.power} height={480} />
    <TelemetryChart title="内部温度曲线" series={charts.temperature} height={420} />
    <section className="two-column"><div className="panel"><h2>在线和离线记录</h2><p>当前状态持续：{formatDuration(summary.connectivity.isOnline ? null : summary.connectivity.currentOfflineMinutes)}</p>{summary.connectivity.transitions.length ? <ul className="record-list">{summary.connectivity.transitions.map((item) => <li key={`${item.at}-${item.state}`}>{formatTime(item.at)}：{item.value === null ? (item.state === 'online' ? '上线' : '离线') : (resolveStatusLabel('inverter_online_state', item.value) ?? EMPTY)}</li>)}</ul> : <p className="muted">没有 online_state 记录。</p>}</div><div className="panel"><h2>离线区间</h2>{summary.connectivity.offlineWindows.length ? <ul className="record-list">{summary.connectivity.offlineWindows.map((item) => <li key={`${item.startAt}-${item.endAt}`}>{formatTime(item.startAt)} 至 {item.endAt ? formatTime(item.endAt) : '持续中'} · {formatDuration(item.durationMinutes)}</li>)}</ul> : <p className="muted">当前窗口没有离线区间。</p>}</div></section>
    <section className="panel"><h2>当前故障</h2>{faultNames === null ? <p className="muted">{EMPTY}</p> : faultNames.map((name) => <span key={name} className={name === '当前无故障' ? 'fault-clear' : 'fault-name'}>{name}</span>)}<h3>故障码变化记录</h3>{summary.faultChanges.length ? <ul className="record-list">{summary.faultChanges.map((event) => <li key={`${event.at}-${event.eventType}-${event.fromMask}-${event.toMask}`}><strong>{faultEventLabel[event.eventType]}</strong> · {formatTime(event.at)}<br />{event.toFaults.length ? event.toFaults.join('、') : '故障已恢复'}</li>)}</ul> : <p className="muted">最近 7 天没有故障变化。</p>}</section>
    <Link href={`/devices/${encodeURIComponent(summary.deviceSn)}`}>返回 CT 设备页面</Link>
  </main>
}
