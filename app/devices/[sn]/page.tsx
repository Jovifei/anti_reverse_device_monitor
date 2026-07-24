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

function HistoryMetric({ label, value, series, title }: { label: string; value: string; series: ClientChartSeries[]; title: string }) {
  return <MetricHistoryDialog label={label} value={value} title={title} series={series}><span className="inverter-metric-cell"><span className="label">{label}</span><strong>{value}</strong><small>查看历史</small></span></MetricHistoryDialog>
}

export default async function DeviceDetailPage({ params }: { params: Promise<{ sn: string }> }) {
  const { sn: rawSn } = await params
  const service = new DeviceService()
  let lookup: Awaited<ReturnType<DeviceService['resolveDeviceSn']>>
  try { lookup = await service.resolveDeviceSn(rawSn) } catch { lookup = { kind: 'not-found' as const } }
  if (lookup.kind !== 'resolved') return <main><section className="error-panel"><h1>设备查询失败</h1><p>{lookup.kind === 'ambiguous' ? '请输入完整 SN。' : '未找到该 SN 对应的设备。'}</p><Link href="/devices">返回设备总览</Link></section></main>

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
  const isLastKnown = !history.platform.isOnline
  const lastKnownAt = history.platform.lastSeenAt ?? device.lastReportedAt
  const currentStateMinutes = history.platform.isOnline ? history.platform.currentOnlineMinutes : history.platform.currentOfflineMinutes
  const quality = [
    ['电网电压', displayValue(findLatestMetric(latest, ['grid_voltage']), 'V')],
    ['电网频率', displayValue(findLatestMetric(latest, ['grid_frequency']), 'Hz')]
  ]
  const reverseHeading = reverseNow.length ? '严重告警：检测到功率反送电网' : '防逆流运行正常'

  return <main>
    <header className="page-header"><div><p className="eyebrow">CT 防逆流设备运行</p><h1>设备 SN：{canonicalSn}</h1><p className="muted">最近 7 天动态遥测数据，时间按 {process.env.APP_TIMEZONE || 'Asia/Shanghai'} 显示。</p></div><div className="page-header-actions"><span className="readonly-badge source-badge">数据来源：{sourceLabel}</span><DeviceSnSearch initialSn={canonicalSn} /></div></header>

    <section className={`reverse-safety-panel ${reverseNow.length ? 'is-danger' : ''}`} data-testid="reverse-safety-panel">
      <div className="panel-heading"><div><h2>{reverseHeading}</h2><p>{reverseNow.length ? `当前逆流相：${reverseNow.map((item) => item.phase).join('、')} 相；负功率点以红色标识。` : 'A、B、C 三相当前均未检测到反送电网。'}</p></div><span className={`badge ${reverseNow.length ? 'danger' : 'online'}`}>{reverseNow.length ? `严重告警：${reverseNow.map((item) => `${item.phase} 相`).join('、')}正在反送电网` : '当前无逆流'}</span></div>
      {activeAlerts.length ? <p className="active-alert">受影响相：{activeAlerts.map((item) => item.phase).join('、')}；开始 {formatTime(activeAlerts[0].startedAt)}；已持续 {formatDuration(activeAlerts[0].durationMinutes)}。</p> : <p className="muted">当前没有持续中的逆流告警。</p>}
      <div className="phase-grid">{phaseRows.map(({ phase, row, series }) => { const value = numericValue(row); const reverse = value !== null && value < 0; const lastAlarm = alarms.alerts.find((item) => item.phase === phase); return <MetricHistoryDialog key={phase} label={`${phase} 相 CT 有功功率`} title={`${phase} 相 CT 有功功率历史`} subtitle="负功率点表示功率正在反送电网。" series={series as ClientChartSeries[]}><span className={`phase-card ${reverse ? 'danger' : ''}`}><span className="phase-label">{phase} 相 CT 有功功率</span><strong className="phase-value">{displayValue(row, 'W')}</strong><span className="phase-hint">{reverse ? '正在反送电网' : '当前相功率正常'}；查看 7 天曲线；最近告警：{lastAlarm ? formatTime(lastAlarm.startedAt) : EMPTY}</span></span></MetricHistoryDialog> })}</div>
      <h3>最近 7 天逆流告警记录</h3>
      {alarms.alerts.length ? (
        <div className="alert-table-wrap">
          <table className="alert-table">
            <thead>
              <tr>
                <th>相</th>
                <th>开始</th>
                <th>恢复</th>
                <th>持续</th>
                <th>最低功率</th>
                <th>样本</th>
              </tr>
            </thead>
            <tbody>
              {alarms.alerts.map((alert) => (
                <tr key={`${alert.phase}-${alert.startedAt}`} className={alert.endedAt ? undefined : 'is-active'}>
                  <td><span className="alert-phase">{alert.phase} 相</span></td>
                  <td>{formatTime(alert.startedAt)}</td>
                  <td>{alert.endedAt ? formatTime(alert.endedAt) : <span className="alert-ongoing">持续中</span>}</td>
                  <td>{formatDuration(alert.durationMinutes)}</td>
                  <td className="danger-value">{alert.minimumPower} W</td>
                  <td>{alert.sampleCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">最近 7 天没有检测到三相 CT 负功率。</p>
      )}
    </section>

    <section className="panel"><div className="panel-heading"><div><h2>CT 当前状态</h2><p className="muted">状态由最新遥测与服务端连通性判定。</p></div><span className={`badge ${history.platform.isOnline ? 'online' : 'offline'}`}>{history.platform.isOnline ? 'CT 在线' : 'CT 离线'}</span></div>{isLastKnown ? <p className="last-known-note">当前离线，以下状态和指标均为最后已知值；更新时间：{formatTime(lastKnownAt)}。</p> : null}<ul className="status-list"><li>{isLastKnown ? '最后已知上报' : '最后上报'}<br /><strong>{formatTime(device.lastReportedAt)}</strong></li><li>{isLastKnown ? '最后已知运行状态' : '运行状态'}<br /><strong>{resolveStatusLabel('ct_state', numericValue(findLatestMetric(latest, CT_KPI_ALIASES.state))) ?? EMPTY}</strong></li><li>{isLastKnown ? '最后已知限流状态' : '限流状态'}<br /><strong>{resolveStatusLabel('limit_state', numericValue(findLatestMetric(latest, CT_KPI_ALIASES.limitState))) ?? EMPTY}</strong></li><li>{isLastKnown ? '最后已知 Sub1G 状态' : 'Sub1G 状态'}<br /><strong>{resolveStatusLabel('sub1g_state', numericValue(findLatestMetric(latest, CT_KPI_ALIASES.sub1gState))) ?? EMPTY}</strong></li><li>{isLastKnown ? '最后已知工作模式' : '工作模式'}<br /><strong>{resolveStatusLabel('work_mode', numericValue(findLatestMetric(latest, CT_KPI_ALIASES.workMode))) ?? EMPTY}</strong></li><li>当前状态持续<br /><strong>{formatDuration(currentStateMinutes)}</strong></li></ul></section>

    <section className="card-grid"><MetricCard label="当前家庭负载功率" value={displayValue(findLatestMetric(latest, ['load_power', 'ct.load_power']), 'W')} hint={isLastKnown ? '最后已知值' : undefined} /><MetricCard label="当前电网功率" value={displayValue(findLatestMetric(latest, ['grid_power', 'ct.grid_power']), 'W')} hint={isLastKnown ? '最后已知值' : undefined} /><MetricCard label="微逆发电总功率" value={displayValue(findLatestMetric(latest, ['inverter_total_power', 'total_generation_power', 'micro_total_power']), 'W')} hint={isLastKnown ? '最后已知值' : undefined} /><MetricCard label="今日发电量" value={displayValue(findLatestMetric(latest, CT_KPI_ALIASES.todayEnergy), 'kWh')} /><MetricCard label="今日发电时长" value={displayValue(findLatestMetric(latest, CT_KPI_ALIASES.todayDuration), 'h')} /><MetricCard label="累计发电量" value={displayValue(findLatestMetric(latest, CT_KPI_ALIASES.totalEnergy), 'kWh')} /></section>

    <section className="panel"><h2>电网质量和三相 CT</h2>{isLastKnown ? <p className="last-known-note">电压、频率为最后已知值，更新时间：{formatTime(lastKnownAt)}。</p> : null}<div className="quality-grid">{quality.map(([label, value]) => <MetricCard key={label} label={label} value={value} hint={isLastKnown ? '最后已知值' : undefined} />)}</div></section>

    <TelemetryChart title="功率总览（W）" series={charts.power} initialSelectedKeys={['load', 'grid', 'generation']} advancedKeys={['ct-a', 'ct-b', 'ct-c', 'inv-a', 'inv-b', 'inv-c']} height={510} />
    <TelemetryChart title="电网电压与频率（V / Hz）" series={charts.grid} height={360} />

    <section className="panel"><h2>CT 本体上下线与离线时长</h2><div className="two-column"><div><h3>状态变化</h3>{history.platform.transitions.length ? <ul className="record-list">{history.platform.transitions.map((item) => <li key={`${item.at}-${item.state}`}>{formatTime(item.at)}：{item.state === 'online' ? '上线' : '离线'}</li>)}</ul> : <p className="muted">当前窗口没有状态变化记录。</p>}</div><div><h3>离线区间</h3>{history.platform.offlineWindows.length ? <ul className="record-list">{history.platform.offlineWindows.map((item) => <li key={`${item.startAt}-${item.endAt}`}>{formatTime(item.startAt)} 至 {formatTime(item.endAt)} · {formatDuration(item.durationMinutes)}</li>)}</ul> : <p className="muted">当前窗口没有离线区间。</p>}</div></div></section>

    <section className="panel"><div className="inverter-section-title"><div><h2>微型逆变器 1–8</h2><p className="muted">固定显示 8 个通道；缺失属性使用“—”，不误判为故障。</p></div><span className="muted">固定 8 通道</span></div><div className="inverter-grid">{Array.from({ length: 8 }, (_, offset) => {
      const inverterIndex = offset + 1
      const summary = inverterSummaries[offset]
      const binding = device.inverterBindings.find((item) => item.inverterIndex === inverterIndex)
      const rows = summary?.latestRows ?? []
      const onlineRaw = numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.onlineState))
      const status = binding?.paired === false ? getInverterStatus(0) : getInverterStatus(onlineRaw)
      const workRaw = numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.workState))
      const powerRow = findLatestMetric(rows, ['inverter_power', 'generation_power', 'total_power', 'power'])
      const power = numericValue(powerRow)
      const faultNames = summary?.faults.flatMap((fault) => fault.faults.map((item) => item.name)) ?? []
      const chart = inverterCharts[offset]
      const powerSeries = chart?.power ?? []
      const pv1Series = powerSeries.filter((item) => item.key === 'pv1')
      const pv2Series = powerSeries.filter((item) => item.key === 'pv2')
      const temperatureSeries = chart?.temperature ?? []
      const energySeries = chart?.energy ?? []
      const generating = isGenerating(onlineRaw, workRaw, power)
      const value = (aliases: string[], unit = '') => displayValue(findLatestMetric(rows, aliases), unit)
      return <article key={inverterIndex} className={`inverter-card ${status.variant}`}><div className="inverter-head"><div><h3>微型逆变器 {inverterIndex}</h3><p className="inverter-meta">SN：{binding?.inverterSn ?? EMPTY}<br />软件 {binding?.softwareVersion ?? EMPTY} · 硬件 {binding?.hardwareVersion ?? EMPTY}</p></div><span className={`badge ${status.variant}`}>{status.label}</span></div><div className="inverter-state-grid"><div><span>工作状态</span><strong>{getInverterWorkStatus(workRaw)}</strong></div><div><span>是否发电</span><strong>{status.variant === 'online' ? (generating ? '正在发电' : '否') : EMPTY}</strong></div></div><div className="inverter-metrics"><HistoryMetric label="总功率" value={value(['inverter_power', 'generation_power', 'total_power', 'power'], 'W')} title={`微型逆变器 ${inverterIndex} 功率历史`} series={powerSeries} /><HistoryMetric label="PV1" value={value(['pv1_power', 'pv1power'], 'W')} title={`微型逆变器 ${inverterIndex} PV1 功率历史`} series={pv1Series} /><HistoryMetric label="PV2" value={value(['pv2_power', 'pv2power'], 'W')} title={`微型逆变器 ${inverterIndex} PV2 功率历史`} series={pv2Series} /><HistoryMetric label="今日发电量" value={value(INVERTER_KPI_ALIASES.todayEnergy, 'kWh')} title={`微型逆变器 ${inverterIndex} 今日发电量历史`} series={energySeries} /><div className="inverter-metric-cell"><span className="label">累计发电量</span><strong>{value(INVERTER_KPI_ALIASES.totalEnergy, 'kWh')}</strong></div><div className="inverter-metric-cell"><span className="label">今日发电时长</span><strong>{value(INVERTER_KPI_ALIASES.todayDuration, 'h')}</strong></div><HistoryMetric label="内部温度" value={value(['internal_temperature', 'temperature'], '°C')} title={`微型逆变器 ${inverterIndex} 内部温度历史`} series={temperatureSeries} /><div className="inverter-metric-cell"><span className="label">丢包率</span><strong>{value(['packet_loss_rate', 'packet_loss'], '%')}</strong></div></div>{faultNames.length ? <div className="fault-list">{Array.from(new Set(faultNames)).slice(0, 3).map((name) => <span key={name} className="fault-name">{name}</span>)}</div> : <p className="inverter-meta">当前无故障</p>}{binding?.paired ? <Link className="card-link" href={`/devices/${encodeURIComponent(canonicalSn)}/inverters/${inverterIndex}`}>查看详情</Link> : <span className="inverter-meta">{binding?.paired === false ? '未配对通道' : '暂无遥测数据'}</span>}</article>
    })}</div></section>
  </main>
}
