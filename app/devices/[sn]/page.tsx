import Link from 'next/link'
import { DeviceSnSearch } from '@/src/components/device-sn-search'
import { MetricHistoryDialog } from '@/src/components/metric-history-dialog'
import { TelemetryChart, type ClientChartSeries } from '@/src/components/telemetry-chart'
import { CT_KPI_ALIASES, displayValue, findLatestMetric, formatDuration, formatTime, getInverterStatus, getInverterWorkStatus, INVERTER_KPI_ALIASES, isGenerating, numericValue } from '@/src/domain/monitoring'
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
  if (lookup.kind !== 'resolved') return <main><section className="error-panel"><h1>设备查询失败</h1><p>{lookup.kind === 'ambiguous' ? '该 SN 后缀匹配多个设备，请输入完整 SN。' : '未找到该 SN 对应的设备。'}</p><Link href="/devices">返回设备总览</Link></section></main>

  const canonicalSn = lookup.deviceSn
  const [device, history, alarms, charts, sourceLabel, inverterSummaries, inverterCharts] = await Promise.all([
    service.getDeviceSummary(canonicalSn), service.getDeviceHistory(canonicalSn, { days: '7' }), service.getReverseFlowAlarms(canonicalSn, { days: '7' }), service.getDeviceChartData(canonicalSn, { days: '7' }), service.getDeviceDataSourceLabel(canonicalSn),
    Promise.all(Array.from({ length: 8 }, (_, index) => service.getInverterSummary(canonicalSn, index + 1))),
    Promise.all(Array.from({ length: 8 }, (_, index) => service.getInverterChartData(canonicalSn, index + 1, { days: '7' })))
  ])
  if (!device || !history) return <main><section className="error-panel"><h1>设备查询失败</h1><p>该设备没有可用的运行数据。</p><Link href="/devices">返回设备总览</Link></section></main>

  const latest = device.latestRows
  const phaseRows = [
    { phase: 'A', row: findLatestMetric(latest, ['active_power_ct1', 'ct.active_power.phase_a']), series: charts.power.filter((item) => item.key === 'ct-a') },
    { phase: 'B', row: findLatestMetric(latest, ['active_power_ct2', 'ct.active_power.phase_b']), series: charts.power.filter((item) => item.key === 'ct-b') },
    { phase: 'C', row: findLatestMetric(latest, ['active_power_ct3', 'ct.active_power.phase_c']), series: charts.power.filter((item) => item.key === 'ct-c') }
  ]
  const reverseNow = phaseRows.filter((item) => { const value = numericValue(item.row); return value !== null && value < 0 })
  const activeAlerts = alarms.alerts.filter((item) => item.endedAt === null)
  const currentOffline = history.platform.isOnline ? null : history.platform.offlineWindows.at(-1)?.durationMinutes ?? null
  const quality = [
    ['电网电压', displayValue(findLatestMetric(latest, ['grid_voltage']), 'V')],
    ['电网频率', displayValue(findLatestMetric(latest, ['grid_frequency']), 'Hz')],
    ['A 相 CT 有功功率', displayValue(phaseRows[0].row, 'W')],
    ['B 相 CT 有功功率', displayValue(phaseRows[1].row, 'W')],
    ['C 相 CT 有功功率', displayValue(phaseRows[2].row, 'W')]
  ]

  return <main>
    <header className="page-header"><div><p className="eyebrow">CT 防逆流设备运行</p><h1>设备 SN：{canonicalSn}</h1><p className="muted">最近 7 天动态遥测数据，时间按 {process.env.APP_TIMEZONE || 'Asia/Shanghai'} 显示。</p></div><DeviceSnSearch initialSn={canonicalSn} /></header>

    <section className="panel"><div className="panel-heading"><div><h2>CT 当前状态</h2><p className="muted">状态均由最新遥测与服务端连通性判定。</p></div><span className={`badge ${history.platform.isOnline ? 'online' : 'offline'}`}>{history.platform.isOnline ? 'CT 在线' : 'CT 离线'}</span></div><ul className="status-list"><li>最后上报<br /><strong>{formatTime(device.lastReportedAt)}</strong></li><li>运行状态<br /><strong>{resolveStatusLabel('ct_state', numericValue(findLatestMetric(latest, CT_KPI_ALIASES.state))) ?? EMPTY}</strong></li><li>限流状态<br /><strong>{resolveStatusLabel('limit_state', numericValue(findLatestMetric(latest, CT_KPI_ALIASES.limitState))) ?? EMPTY}</strong></li><li>Sub1G 状态<br /><strong>{resolveStatusLabel('sub1g_state', numericValue(findLatestMetric(latest, CT_KPI_ALIASES.sub1gState))) ?? EMPTY}</strong></li><li>工作模式<br /><strong>{resolveStatusLabel('work_mode', numericValue(findLatestMetric(latest, CT_KPI_ALIASES.workMode))) ?? EMPTY}</strong></li><li>当前离线持续<br /><strong>{history.platform.isOnline ? EMPTY : formatDuration(currentOffline)}</strong></li></ul></section>

    <section className="card-grid"><MetricCard label="当前家庭负载功率" value={displayValue(findLatestMetric(latest, ['load_power', 'ct.load_power']), 'W')} /><MetricCard label="当前电网功率" value={displayValue(findLatestMetric(latest, ['grid_power', 'ct.grid_power']), 'W')} /><MetricCard label="微逆发电总功率" value={displayValue(findLatestMetric(latest, ['inverter_total_power', 'total_generation_power', 'micro_total_power']), 'W')} /><MetricCard label="今日发电量" value={displayValue(findLatestMetric(latest, CT_KPI_ALIASES.todayEnergy))} /><MetricCard label="今日发电时长" value={displayValue(findLatestMetric(latest, CT_KPI_ALIASES.todayDuration))} /><MetricCard label="累计发电量" value={displayValue(findLatestMetric(latest, CT_KPI_ALIASES.totalEnergy))} /></section>

    <section className="top-monitor-grid"><div className="panel"><h2>电网与三相 CT 质量</h2><div className="quality-grid">{quality.map(([label, value]) => <MetricCard key={label} label={label} value={value} />)}</div></div><div className="panel"><h2>数据来源</h2><p className="muted">当前页面仅展示后端已接入数据的只读状态；不提供数据源切换，也不展示数据库连接或记录明细。</p><span className="readonly-badge source-badge">数据来源：{sourceLabel}</span></div></section>

    <section className={`reverse-flow-banner ${reverseNow.length ? 'is-danger' : ''}`}><div><h2>{reverseNow.length ? '严重告警：检测到功率反送电网' : '防逆流运行正常'}</h2><p>{reverseNow.length ? `当前逆流相：${reverseNow.map((item) => item.phase).join('、')} 相；任一负功率点均以红色标识。` : 'A、B、C 三相当前均未检测到反送电网。'}</p></div>{reverseNow.length ? <div className="alert-summary"><span>开始时间</span><strong>{activeAlerts[0] ? formatTime(activeAlerts[0].startedAt) : EMPTY}</strong><span>当前持续</span><strong>{activeAlerts[0] ? formatDuration(activeAlerts[0].durationMinutes) : EMPTY}</strong></div> : <span className="badge online">当前无逆流</span>}</section>

    <section className="panel"><div className="panel-heading"><div><h2>防逆流安全状态</h2><p className="muted">任一相 CT 有功功率低于 0 W 即为严重逆流告警；点击相位卡片查看对应的 7 天历史。</p></div><span className={`badge ${reverseNow.length ? 'danger' : 'online'}`}>{reverseNow.length ? `严重告警：${reverseNow.map((item) => `${item.phase} 相`).join('、')}正在反送电网` : '当前无逆流'}</span></div>{activeAlerts.length ? <p className="active-alert">受影响相：{activeAlerts.map((item) => item.phase).join('、')}；开始 {formatTime(activeAlerts[0].startedAt)}；已持续 {formatDuration(activeAlerts[0].durationMinutes)}。</p> : <p className="muted">当前没有持续中的逆流告警。</p>}<div className="phase-grid">{phaseRows.map(({ phase, row, series }) => { const value = numericValue(row); const reverse = value !== null && value < 0; const lastAlarm = alarms.alerts.find((item) => item.phase === phase); return <MetricHistoryDialog key={phase} label={`${phase} 相 CT 有功功率`} title={`${phase} 相 CT 有功功率历史`} subtitle="负功率点表示功率正在反送电网。" series={series as ClientChartSeries[]}><div className={`phase-card ${reverse ? 'danger' : ''}`}><span className="phase-label">{phase} 相 CT 有功功率</span><strong className="phase-value">{displayValue(row, 'W')}</strong><span className="phase-hint">{reverse ? '当前正在反送电网' : '当前相功率正常'}；最近告警：{lastAlarm ? formatTime(lastAlarm.startedAt) : EMPTY}</span></div></MetricHistoryDialog> })}</div><h3>最近 7 天逆流告警记录</h3>{alarms.alerts.length ? <ul className="record-list">{alarms.alerts.map((alert) => <li key={`${alert.phase}-${alert.startedAt}`}><strong>{alert.phase} 相严重告警</strong> · 开始 {formatTime(alert.startedAt)} · 恢复 {alert.endedAt ? formatTime(alert.endedAt) : '持续中'} · 持续 {formatDuration(alert.durationMinutes)} · 最低功率 <span className="danger-value">{alert.minimumPower} W</span> · 样本 {alert.sampleCount}</li>)}</ul> : <p className="muted">最近 7 天没有检测到三相 CT 负功率。</p>}</section>

    <TelemetryChart title="功率总览" series={charts.power} initialSelectedKeys={['load', 'grid', 'generation']} height={510} />

    <section className="panel"><h2>CT 本体上下线与离线时长</h2><div className="two-column"><div><h3>状态变化</h3>{history.platform.transitions.length ? <ul className="record-list">{history.platform.transitions.map((item) => <li key={`${item.at}-${item.state}`}>{formatTime(item.at)}：{item.state === 'online' ? '上线' : '离线'}</li>)}</ul> : <p className="muted">当前窗口没有状态变化记录。</p>}</div><div><h3>离线区间</h3>{history.platform.offlineWindows.length ? <ul className="record-list">{history.platform.offlineWindows.map((item) => <li key={`${item.startAt}-${item.endAt}`}>{formatTime(item.startAt)} 至 {formatTime(item.endAt)} · {formatDuration(item.durationMinutes)}</li>)}</ul> : <p className="muted">当前窗口没有离线区间。</p>}</div></div></section>

    <section className="panel"><div className="inverter-section-title"><div><h2>微型逆变器 1～8</h2><p className="muted">固定八个通道；缺失属性用“—”表示，不将其误判为故障。</p></div><span className="muted">固定 8 通道</span></div><div className="inverter-grid">{Array.from({ length: 8 }, (_, offset) => {
      const inverterIndex = offset + 1; const summary = inverterSummaries[offset]; const binding = device.inverterBindings.find((item) => item.inverterIndex === inverterIndex); const rows = summary?.latestRows ?? []; const onlineRaw = numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.onlineState)); const status = binding?.paired === false ? getInverterStatus(0) : getInverterStatus(onlineRaw); const workRaw = numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.workState)); const faultNames = summary?.faults.flatMap((fault) => fault.faults.map((item) => item.name)) ?? []; const powerSeries = inverterCharts[offset].power; const pv1Series = powerSeries.filter((item) => item.label.includes('PV1')); const pv2Series = powerSeries.filter((item) => item.label.includes('PV2')); const temperatureSeries = inverterCharts[offset].temperature; const energySeries = inverterCharts[offset].energy
      return <article key={inverterIndex} className={`inverter-card ${status.variant}`}><div className="inverter-head"><div><h3>微型逆变器 {inverterIndex}</h3><p className="inverter-meta">SN：{binding?.inverterSn ?? EMPTY}<br />软件 {binding?.softwareVersion ?? EMPTY} · 硬件 {binding?.hardwareVersion ?? EMPTY}</p></div><span className={`badge ${status.variant}`}>{status.label}</span></div><dl><div><dt>工作状态</dt><dd>{getInverterWorkStatus(workRaw)}</dd></div><div><dt>是否发电</dt><dd>{isGenerating(numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.generating)), workRaw) ? '正在发电' : EMPTY}</dd></div><div><dt>发电总功率</dt><dd>{displayValue(findLatestMetric(rows, ['inverter_power', 'generation_power', 'total_power', 'power']), 'W')}</dd></div><div><dt>PV1 / PV2</dt><dd>{displayValue(findLatestMetric(rows, ['pv1_power', 'pv1power']), 'W')} / {displayValue(findLatestMetric(rows, ['pv2_power', 'pv2power']), 'W')}</dd></div><div><dt>今日 / 累计电量</dt><dd>{displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.todayEnergy))} / {displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.totalEnergy))}</dd></div><div><dt>今日发电时长</dt><dd>{displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.todayDuration))}</dd></div><div><dt>内部温度 / 丢包率</dt><dd>{displayValue(findLatestMetric(rows, ['internal_temperature', 'temperature']), '°C')} / {displayValue(findLatestMetric(rows, ['packet_loss_rate', 'packet_loss']), '%')}</dd></div></dl><div className="inverter-history-actions"><MetricHistoryDialog label="发电总功率" value={displayValue(findLatestMetric(rows, ['inverter_power', 'generation_power', 'total_power', 'power']), 'W')} title={`微型逆变器 ${inverterIndex} 功率历史`} series={powerSeries} /><MetricHistoryDialog label="PV1 功率" value={displayValue(findLatestMetric(rows, ['pv1_power', 'pv1power']), 'W')} title={`微型逆变器 ${inverterIndex} PV1 功率历史`} series={pv1Series} /><MetricHistoryDialog label="PV2 功率" value={displayValue(findLatestMetric(rows, ['pv2_power', 'pv2power']), 'W')} title={`微型逆变器 ${inverterIndex} PV2 功率历史`} series={pv2Series} /><MetricHistoryDialog label="内部温度" value={displayValue(findLatestMetric(rows, ['internal_temperature', 'temperature']), '°C')} title={`微型逆变器 ${inverterIndex} 内部温度历史`} series={temperatureSeries} /><MetricHistoryDialog label="今日发电量" value={displayValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.todayEnergy))} title={`微型逆变器 ${inverterIndex} 今日发电量历史`} detail="按自然日断开连线" series={energySeries} /></div>{faultNames.length ? <div>{Array.from(new Set(faultNames)).slice(0, 3).map((name) => <span key={name} className="fault-name">{name}</span>)}</div> : <p className="inverter-meta">当前无故障</p>}{binding?.paired ? <Link className="card-link" href={`/devices/${encodeURIComponent(canonicalSn)}/inverters/${inverterIndex}`}>查看详情</Link> : <span className="inverter-meta">{binding?.paired === false ? '未配对通道' : '暂无遥测数据'}</span>}</article>
    })}</div></section>
  </main>
}
