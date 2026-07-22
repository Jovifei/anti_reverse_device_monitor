import Link from 'next/link'
import { DeviceSnSearch } from '@/src/components/device-sn-search'
import { TelemetryChart } from '@/src/components/telemetry-chart'
import { CT_KPI_ALIASES, INVERTER_KPI_ALIASES, displayValue, findLatestMetric, formatDuration, formatTime, getInverterStatus, getInverterWorkStatus, isGenerating, numericValue } from '@/src/domain/monitoring'
import { resolveStatusLabel } from '@/src/domain/dictionaries'
import { DeviceService } from '@/src/services/device-service'

const EMPTY = '—'

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="metric-card"><div className="label">{label}</div><div className="value">{value}</div>{hint ? <div className="hint">{hint}</div> : null}</div>
}

export default async function DeviceDetailPage({ params }: { params: Promise<{ sn: string }> }) {
  const { sn: rawSn } = await params
  const service = new DeviceService()
  let lookup: Awaited<ReturnType<DeviceService['resolveDeviceSn']>>
  try { lookup = await service.resolveDeviceSn(rawSn) } catch { lookup = { kind: 'not-found' as const } }
  if (lookup.kind !== 'resolved') {
    const message = lookup.kind === 'ambiguous' ? '末尾编号匹配到多台设备，请输入更完整的 SN。' : '未找到该 SN 对应的设备。'
    return <main><section className="error-panel"><h1>设备查询失败</h1><p>{message}</p><Link href="/devices">返回设备总览</Link></section></main>
  }

  const canonicalSn = lookup.deviceSn
  const [device, history, alarms, charts, inverterSummaries] = await Promise.all([
    service.getDeviceSummary(canonicalSn),
    service.getDeviceHistory(canonicalSn, { days: '7' }),
    service.getReverseFlowAlarms(canonicalSn, { days: '7' }),
    service.getDeviceChartData(canonicalSn, { days: '7' }),
    Promise.all(Array.from({ length: 8 }, (_, index) => service.getInverterSummary(canonicalSn, index + 1)))
  ])
  if (!device || !history) return <main><section className="error-panel"><h1>设备查询失败</h1><p>该设备没有可用的运行数据。</p><Link href="/devices">返回设备总览</Link></section></main>

  const latest = device.latestRows
  const phaseRows = [
    { phase: 'A', row: findLatestMetric(latest, ['active_power_ct1', 'ct.active_power.phase_a']) },
    { phase: 'B', row: findLatestMetric(latest, ['active_power_ct2', 'ct.active_power.phase_b']) },
    { phase: 'C', row: findLatestMetric(latest, ['active_power_ct3', 'ct.active_power.phase_c']) }
  ]
  const currentOffline = history.platform.isOnline ? null : history.platform.offlineWindows.at(-1)?.durationMinutes ?? null

  return <main>
    <header className="page-header"><div><p className="eyebrow">CT 防逆流设备运行</p><h1>设备 SN：{canonicalSn}</h1><p className="muted">最近 7 天运行数据，时间统一按 {process.env.APP_TIMEZONE || 'Asia/Shanghai'} 显示</p></div><DeviceSnSearch initialSn={canonicalSn} /></header>

    <section className="card-grid">
      <MetricCard label="CT 本体状态" value={history.platform.isOnline ? '在线' : '离线'} hint={history.platform.isOnline ? '平台上报正常' : `当前离线 ${formatDuration(currentOffline)}`} />
      <MetricCard label="当前家庭负载功率" value={displayValue(findLatestMetric(latest, ['load_power', 'ct.load_power']), 'W')} />
      <MetricCard label="当前电网功率" value={displayValue(findLatestMetric(latest, ['grid_power', 'ct.grid_power']), 'W')} />
      <MetricCard label="当前微逆发电总功率" value={displayValue(findLatestMetric(latest, ['inverter_total_power', 'total_generation_power', 'micro_total_power']), 'W')} />
      <MetricCard label="今日发电量" value={displayValue(findLatestMetric(latest, CT_KPI_ALIASES.todayEnergy))} />
      <MetricCard label="今日发电时长" value={displayValue(findLatestMetric(latest, CT_KPI_ALIASES.todayDuration))} />
      <MetricCard label="累计发电量" value={displayValue(findLatestMetric(latest, CT_KPI_ALIASES.totalEnergy))} />
      <MetricCard label="最后上报时间" value={formatTime(device.lastReportedAt)} />
    </section>

    <section className="panel"><div className="panel-heading"><h2>CT 本体运行状态</h2><span className={`badge ${history.platform.isOnline ? 'online' : 'offline'}`}>{history.platform.isOnline ? '平台在线' : '平台离线'}</span></div><ul className="status-list"><li>当前离线持续时长：{history.platform.isOnline ? EMPTY : formatDuration(currentOffline)}</li><li>state：{resolveStatusLabel('ct_state', numericValue(findLatestMetric(latest, CT_KPI_ALIASES.state))) ?? EMPTY}</li><li>limit_state：{resolveStatusLabel('limit_state', numericValue(findLatestMetric(latest, CT_KPI_ALIASES.limitState))) ?? EMPTY}</li><li>sub1g_state：{resolveStatusLabel('sub1g_state', numericValue(findLatestMetric(latest, CT_KPI_ALIASES.sub1gState))) ?? EMPTY}</li><li>work_mode：{resolveStatusLabel('work_mode', numericValue(findLatestMetric(latest, CT_KPI_ALIASES.workMode))) ?? EMPTY}</li><li>最后状态变化时间：{formatTime(history.platform.transitions.at(-1)?.at)}</li></ul></section>

    <section className="panel"><div className="panel-heading"><h2>防逆流安全状态</h2><span className={`badge ${phaseRows.some((item) => (numericValue(item.row) ?? 0) < 0) ? 'danger' : 'online'}`}>{phaseRows.some((item) => (numericValue(item.row) ?? 0) < 0) ? '严重告警：正在反送电网' : '当前无逆流'}</span></div><div className="card-grid">{phaseRows.map(({ phase, row }) => <MetricCard key={phase} label={`${phase} 相 CT 有功功率`} value={displayValue(row, 'W')} hint={(numericValue(row) ?? 0) < 0 ? '功率正在反送电网' : undefined} />)}</div><h3>最近 7 天逆流告警记录</h3>{alarms.alerts.length ? <ul className="record-list">{alarms.alerts.map((alert) => <li key={`${alert.phase}-${alert.startedAt}`}><strong>{alert.phase} 相严重告警</strong> · 开始 {formatTime(alert.startedAt)} · 恢复 {alert.endedAt ? formatTime(alert.endedAt) : '持续中'} · 持续 {formatDuration(alert.durationMinutes)} · 最低功率 <span className="danger-value">{alert.minimumPower} W</span> · 样本 {alert.sampleCount}</li>)}</ul> : <p className="muted">最近 7 天没有检测到三相 CT 负功率。</p>}</section>

    <TelemetryChart title="功率总览" series={charts.power} height={510} />
    <section className="two-column"><div><TelemetryChart title="电网电压" series={charts.grid.filter((item) => item.key === 'voltage')} height={300} /></div><div><TelemetryChart title="电网频率" series={charts.grid.filter((item) => item.key === 'frequency')} height={300} /></div></section>

    <section className="panel"><h2>CT 本体上下线与离线时长</h2><div className="two-column"><div><h3>状态变更</h3>{history.platform.transitions.length ? <ul className="record-list">{history.platform.transitions.map((item) => <li key={`${item.at}-${item.state}`}>{formatTime(item.at)}：{item.state === 'online' ? '上线' : '下线'}</li>)}</ul> : <p className="muted">当前窗口没有状态变更记录。</p>}</div><div><h3>离线区间</h3>{history.platform.offlineWindows.length ? <ul className="record-list">{history.platform.offlineWindows.map((item) => <li key={`${item.startAt}-${item.endAt}`}>{formatTime(item.startAt)} 至 {formatTime(item.endAt)} · {formatDuration(item.durationMinutes)}</li>)}</ul> : <p className="muted">当前窗口没有离线区间。</p>}</div></div></section>

    <section className="panel"><h2>微型逆变器 1～8</h2><div className="inverter-grid">{Array.from({ length: 8 }, (_, offset) => {
      const inverterIndex = offset + 1
      const summary = inverterSummaries[offset]
      const binding = device.inverterBindings.find((item) => item.inverterIndex === inverterIndex)
      const rows = summary?.latestRows ?? []
      const onlineRaw = numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.onlineState))
      const status = binding && binding.paired === false && onlineRaw === null ? getInverterStatus(0) : getInverterStatus(onlineRaw)
      const workRaw = numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.workState))
      const faultNames = Array.from(new Set(summary?.faults.flatMap((fault) => fault.faults.map((item) => item.name)) ?? [])).slice(0, 3)
      return <article key={inverterIndex} className={`inverter-card ${status.variant}`}><span className={`badge ${status.variant}`}>{status.label}</span><h3>微型逆变器 {inverterIndex}</h3><p className="muted">SN：{binding?.inverterSn ?? EMPTY}<br />软件 {binding?.softwareVersion ?? EMPTY} · 硬件 {binding?.hardwareVersion ?? EMPTY}</p><dl><div><dt>工作状态</dt><dd>{getInverterWorkStatus(workRaw)}</dd></div><div><dt>当前是否发电</dt><dd>{isGenerating(numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.generating)), workRaw) ? '正在发电' : '—'}</dd></div><div><dt>发电总功率</dt><dd>{displayValue(findLatestMetric(rows, ['inverter_power', 'generation_power', 'total_power', 'power']), 'W')}</dd></div><div><dt>PV1 / PV2</dt><dd>{displayValue(findLatestMetric(rows, ['pv1_power', 'pv1power']), 'W')} / {displayValue(findLatestMetric(rows, ['pv2_power', 'pv2power']), 'W')}</dd></div><div><dt>今日 / 累计发电</dt><dd>{displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.todayEnergy))} / {displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.totalEnergy))}</dd></div><div><dt>内部温度</dt><dd>{displayValue(findLatestMetric(rows, ['internal_temperature', 'temperature', 'temp']), '°C')}</dd></div><div><dt>今日发电时长</dt><dd>{displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.todayDuration))}</dd></div><div><dt>最近丢包率</dt><dd>{displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.packetLoss), '%')}</dd></div></dl>{faultNames.length ? <div>{faultNames.map((name) => <span key={name} className="fault-name">{name}</span>)}</div> : <p className="muted">最新故障：{EMPTY}</p>}{binding ? <Link className="card-link" href={`/devices/${encodeURIComponent(canonicalSn)}/inverters/${inverterIndex}`}>查看微逆 {inverterIndex} 详情</Link> : <span className="muted">无绑定数据</span>}</article>
    })}</div></section>
  </main>
}
