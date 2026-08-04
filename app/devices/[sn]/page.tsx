import Link from 'next/link'
import type { ReactNode } from 'react'
import { DataStaleBanner } from '@/src/components/data-stale-banner'
import { DatedRecordScroll } from '@/src/components/dated-record-scroll'
import { DeviceLiveKpiBand } from '@/src/components/device-live-kpis'
import { DeviceSnSwitcher } from '@/src/components/device-sn-switcher'
import { MetricHistoryDialog } from '@/src/components/metric-history-dialog'
import { OfflineWindowLabel } from '@/src/components/offline-window-label'
import { OnlineInverterCount } from '@/src/components/online-inverter-count'
import { SoftRefreshButton } from '@/src/components/soft-refresh-button'
import { TelemetryChart, type ClientChartSeries } from '@/src/components/telemetry-chart'
import { WifiSignalView } from '@/src/components/wifi-signal-view'
import { buildInitialLiveKpis } from '@/src/domain/live-kpis'
import { deviceSnSecondaryLabel } from '@/src/domain/device-identity'
import {
  CT_KPI_ALIASES,
  displayEnergyKwh,
  displayInverterIdentity,
  displayInverterPhaseLabel,
  displaySwitch,
  displayValue,
  displayWifiSignal,
  deriveCtSub1gStatus,
  deriveInverterSub1gStatus,
  findLatestMetric,
  formatClockTime,
  formatDuration,
  formatTime,
  formatTimeShort,
  getInverterWorkStatus,
  groupByLocalDate,
  INVERTER_KPI_ALIASES,
  isGenerating,
  numericValue,
  resolveInverterCardStatus,
  WIFI_SIGNAL_ALIASES,
  wifiSignalBars
} from '@/src/domain/monitoring'
import { resolveStatusLabel } from '@/src/domain/dictionaries'
import { DeviceService } from '@/src/services/device-service'

const EMPTY = '—'

function HistoryMetric({ label, value, series, title }: { label: string; value: string; series: ClientChartSeries[]; title: string }) {
  return (
    <MetricHistoryDialog label={label} value={value} title={title} series={series}>
      <span className="inverter-metric-cell">
        <span className="label">{label}</span>
        <strong>{value}</strong>
      </span>
    </MetricHistoryDialog>
  )
}

function FactStrip({
  items,
  className,
  emptyText,
  keepEmpty = false
}: {
  items: Array<{ label: string; value: ReactNode; empty?: boolean }>
  className: string
  emptyText: string
  keepEmpty?: boolean
}) {
  const present = keepEmpty ? items : items.filter((item) => !item.empty)
  if (!present.length) return <p className={`${className}-empty`}>{emptyText}</p>
  return (
    <dl className={className}>
      {present.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function ctStateTone(raw: number | null) {
  if (raw === 4) return 'ok'
  if (raw === 1 || raw === 0) return 'warn'
  if (raw === 2 || raw === 3) return 'progress'
  return 'muted'
}

export default async function DeviceDetailPage({ params }: { params: Promise<{ sn: string }> }) {
  const { sn: rawSn } = await params
  const service = new DeviceService()
  let lookup: Awaited<ReturnType<DeviceService['resolveDeviceSn']>>
  try { lookup = await service.resolveDeviceSn(rawSn) } catch { lookup = { kind: 'not-found' as const } }
  if (lookup.kind !== 'resolved') return <main><section className="error-panel"><h1>设备查询失败</h1><p>{lookup.kind === 'ambiguous' ? '请输入完整 SN。' : '未找到该 SN 对应的设备。'}</p><Link href="/devices">返回设备总览</Link></section></main>

  const canonicalSn = lookup.deviceSn
  const [device, history, alarms, charts, sourceLabel, rawExcel, deviceList, inverterSummaries, inverterCharts] = await Promise.all([
    service.getDeviceSummary(canonicalSn), service.getDeviceHistory(canonicalSn, { days: '7' }), service.getReverseFlowAlarms(canonicalSn, { days: '7' }), service.getDeviceChartData(canonicalSn, { days: '7' }), service.getDeviceDataSourceLabel(canonicalSn), service.findRawExcelForDevice(canonicalSn),
    service.listDevices({ page: 1, pageSize: 200 }),
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
  const reverseHeading = reverseNow.length ? '严重告警：检测到功率反送电网' : '防逆流运行正常'
  const lastKnownHint = isLastKnown ? '最后已知值' : undefined
  const identitySecondary = deviceSnSecondaryLabel(canonicalSn)
  const rawExcelHref = `/api/devices/${encodeURIComponent(canonicalSn)}/raw-excel`
  const ctStatusMinutes = history.platform.isOnline ? history.platform.currentOnlineMinutes : history.platform.currentOfflineMinutes
  const ctStatusDuration = formatDuration(ctStatusMinutes)
  const deviceOptions = Array.from(new Set([canonicalSn, ...deviceList.items.map((item) => item.deviceSn)])).sort()
  const onlineTransitionGroups = groupByLocalDate(
    history.platform.transitions.filter((item) => item.state === 'online'),
    (item) => item.at
  )
  const offlineTransitionGroups = groupByLocalDate(
    history.platform.transitions.filter((item) => item.state === 'offline'),
    (item) => item.at
  )
  const offlineWindowGroups = groupByLocalDate(history.platform.offlineWindows, (item) => item.startAt)
  const ctStateRaw = numericValue(findLatestMetric(latest, CT_KPI_ALIASES.state))
  const ctStateLabel = resolveStatusLabel('ct_state', ctStateRaw) ?? EMPTY
  const wifiRow = findLatestMetric(latest, WIFI_SIGNAL_ALIASES)
  const wifiRaw = numericValue(wifiRow)
  const wifiText = displayWifiSignal(wifiRow)
  const wifiEmpty = !wifiText || wifiText === EMPTY

  const pairedInverterCount = device.inverterBindings.filter((item) => item.paired).length
  const onlineInverterCount = Array.from({ length: 8 }, (_, offset) => {
    const inverterIndex = offset + 1
    const binding = device.inverterBindings.find((item) => item.inverterIndex === inverterIndex)
    if (binding?.paired === false) return false
    const rows = inverterSummaries[offset]?.latestRows ?? []
    const onlineRaw = numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.onlineState))
    const power = numericValue(findLatestMetric(rows, ['inverter_power', 'generation_power', 'total_power', 'power']))
    return resolveInverterCardStatus({ onlineState: onlineRaw, paired: binding?.paired, power }).variant === 'online'
  }).filter(Boolean).length
  const recentOfflineInverterCount = history.inverters.filter((inv) => {
    const binding = device.inverterBindings.find((item) => item.inverterIndex === inv.inverterIndex)
    if (binding?.paired === false) return false
    if (inv.connectivity.isOnline) return false
    return inv.connectivity.transitions.some((item) => item.state === 'online')
  }).length
  const hasOnlinePairedInverter = Array.from({ length: 8 }, (_, offset) => {
    const inverterIndex = offset + 1
    const binding = device.inverterBindings.find((item) => item.inverterIndex === inverterIndex)
    if (binding?.paired !== true) return false
    const rows = inverterSummaries[offset]?.latestRows ?? []
    const onlineRaw = numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.onlineState))
    const power = numericValue(findLatestMetric(rows, ['inverter_power', 'generation_power', 'total_power', 'power']))
    return resolveInverterCardStatus({ onlineState: onlineRaw, paired: true, power }).variant === 'online'
  }).some(Boolean)
  const ctSub1g = deriveCtSub1gStatus({
    rawState: numericValue(findLatestMetric(latest, CT_KPI_ALIASES.sub1gState)),
    hasPairedInverters: pairedInverterCount > 0,
    hasOnlinePairedInverter
  })

  return <main>
    <header className="page-header">
      <div>
        <p className="eyebrow">CT 防逆流设备运行</p>
        <p className="nav-back"><Link className="utility-link" href="/devices">← 返回防逆流设备主页</Link></p>
        <DeviceSnSwitcher currentSn={canonicalSn} options={deviceOptions} />
        <p className="muted">{identitySecondary ? `${identitySecondary}。` : ''}最近 7 天动态遥测数据，时间按 {process.env.APP_TIMEZONE || 'Asia/Shanghai'} 显示。</p>
      </div>
      <div className="header-actions">
        <span className="readonly-badge source-badge">数据来源：{sourceLabel}</span>
        {rawExcel ? <a className="utility-link" href={rawExcelHref} download={rawExcel.fileName}>下载原始数据</a> : null}
        <SoftRefreshButton />
        {lastKnownAt ? <p className="muted header-last-report">最后上报：{formatTime(lastKnownAt)}</p> : null}
      </div>
    </header>
    <DataStaleBanner />

    <section className="panel ct-overview-panel">
      <div className="ct-overview-heading">
        <div>
          <p className="eyebrow">CT runtime summary</p>
          <h2>CT 运行摘要</h2>
          <p className="muted">{isLastKnown ? '当前离线；功率与状态均为最后已知值。' : '运行、通信与功率快照来自最后一次上报。'}</p>
        </div>
        <div className="ct-overview-state">
          <span className={`badge ${history.platform.isOnline ? 'online' : 'offline'}`}>{history.platform.isOnline ? 'CT 在线' : 'CT 离线'}</span>
          <span>状态持续 {ctStatusDuration}</span>
        </div>
      </div>
      {isLastKnown ? <p className="last-known-note">当前离线，以下状态和指标均为最后已知值；更新时间：{formatTime(lastKnownAt)}。</p> : null}
      <div className="ct-fact-band">
        <div>
          <p className="ct-fact-label">运行与策略</p>
          <FactStrip
            className="ct-runtime-facts"
            emptyText="运行状态暂无上报。"
            keepEmpty
            items={[
              {
                label: '运行状态',
                value: <span className={`status-chip tone-${ctStateTone(ctStateRaw)}`}>{ctStateLabel}</span>,
                empty: ctStateLabel === EMPTY
              },
              {
                label: '工作模式',
                value: resolveStatusLabel('work_mode', numericValue(findLatestMetric(latest, CT_KPI_ALIASES.workMode))) ?? EMPTY,
                empty: !(resolveStatusLabel('work_mode', numericValue(findLatestMetric(latest, CT_KPI_ALIASES.workMode))))
              },
              {
                label: '限流状态',
                value: resolveStatusLabel('limit_state', numericValue(findLatestMetric(latest, CT_KPI_ALIASES.limitState))) ?? EMPTY,
                empty: !(resolveStatusLabel('limit_state', numericValue(findLatestMetric(latest, CT_KPI_ALIASES.limitState))))
              },
              {
                label: '在线微逆',
                value: <OnlineInverterCount online={onlineInverterCount} total={pairedInverterCount || 8} className="fact-emphasis" />,
                empty: false
              },
              {
                label: '7日曾在线现离线',
                value: <span className={recentOfflineInverterCount > 0 ? 'fact-emphasis is-warn' : 'fact-emphasis'}>{recentOfflineInverterCount}</span>,
                empty: false
              }
            ]}
          />
        </div>
        <div>
          <p className="ct-fact-label">版本与通信</p>
          <FactStrip
            className="ct-version-facts"
            emptyText="版本与通信状态暂无上报。"
            keepEmpty
            items={[
              { label: '软件版本', value: device.softwareVersion ?? EMPTY, empty: !(device.softwareVersion) },
              { label: 'SubG 版本', value: device.sub1gVersion ?? EMPTY, empty: !(device.sub1gVersion) },
              {
                label: 'Sub1G 状态',
                value: <span className={`status-chip tone-${ctSub1g.tone}`}>{ctSub1g.label}</span>,
                empty: false
              },
              {
                label: 'WiFi 信号强度',
                value: <WifiSignalView value={wifiText} bars={wifiSignalBars(wifiRaw)} />,
                empty: wifiEmpty
              }
            ]}
          />
        </div>
      </div>
      <DeviceLiveKpiBand
        deviceSn={canonicalSn}
        showPhases
        initial={buildInitialLiveKpis(latest, lastKnownHint)}
      />
    </section>

    <section className={`reverse-safety-panel ${reverseNow.length ? 'is-danger' : ''}`} data-testid="reverse-safety-panel">
      <div className="panel-heading"><div><h2>{reverseHeading}</h2><p>{reverseNow.length ? `当前逆流相：${reverseNow.map((item) => item.phase).join('、')} 相；负功率点以红色标识。` : 'A、B、C 三相当前均未检测到反送电网。'}</p></div><span className={`reverse-status-banner ${reverseNow.length ? 'is-danger' : 'is-safe'}`}>{reverseNow.length ? `严重告警：${reverseNow.map((item) => `${item.phase} 相`).join('、')}正在反送电网` : '当前无逆流'}</span></div>
      {activeAlerts.length ? <p className="active-alert">受影响相：{activeAlerts.map((item) => item.phase).join('、')}；开始 {formatTime(activeAlerts[0].startedAt)}；已持续 {formatDuration(activeAlerts[0].durationMinutes)}。</p> : <p className="muted">当前没有持续中的逆流告警。</p>}
      <div className="phase-grid">{phaseRows.map(({ phase, row, series }) => { const value = numericValue(row); const reverse = value !== null && value < 0; const lastAlarm = alarms.alerts.find((item) => item.phase === phase); return <MetricHistoryDialog key={phase} label={`${phase} 相 CT 有功功率`} title={`${phase} 相 CT 有功功率历史`} subtitle="负功率点表示功率正在反送电网。" series={series as ClientChartSeries[]}><span className={`phase-card phase-${phase.toLowerCase()} ${reverse ? 'danger' : ''}`}><span className="phase-label">{phase} 相 CT 有功功率</span><strong className="phase-value">{displayValue(row, 'W')}</strong><span className="phase-hint">{reverse ? '正在反送电网' : '当前相功率正常'}；查看 7 天曲线；最近告警：{lastAlarm ? formatTimeShort(lastAlarm.startedAt) : EMPTY}</span></span></MetricHistoryDialog> })}</div>
      <h3>最近 7 天逆流告警记录</h3>
      {alarms.alerts.length ? (
        <div className="alert-phase-grid">
          {(['A', 'B', 'C'] as const).map((phase) => {
            const rows = alarms.alerts.filter((item) => item.phase === phase)
            return (
              <section key={phase} className="alert-phase-col">
                <h4>{phase} 相</h4>
                <div className="alert-phase-scroll">
                  {rows.length ? rows.map((alert) => (
                    <article key={`${alert.phase}-${alert.startedAt}`} className={`alert-card ${alert.endedAt ? '' : 'is-active'}`.trim()}>
                      <div className="alert-card-time">
                        <span>{formatTimeShort(alert.startedAt)}</span>
                        <span className="alert-arrow">→</span>
                        <span className={alert.endedAt ? undefined : 'alert-ongoing'}>{alert.endedAt ? formatTimeShort(alert.endedAt) : '持续中'}</span>
                      </div>
                      <div className="alert-card-meta">
                        <span>持续 {formatDuration(alert.durationMinutes)}</span>
                        <span className="danger-value">{alert.minimumPower} W</span>
                      </div>
                    </article>
                  )) : <p className="muted alert-empty">无告警</p>}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <p className="muted">最近 7 天没有检测到三相 CT 负功率。</p>
      )}
    </section>

    <TelemetryChart title="功率总览（W）" series={charts.power} initialSelectedKeys={['load', 'grid', 'generation']} advancedKeys={['ct-a', 'ct-b', 'ct-c', 'inv-a', 'inv-b', 'inv-c']} height={510} />

    <section className="panel inverter-fleet-panel"><div className="inverter-section-title"><div><h2>微型逆变器 1–8</h2><p className="muted">固定显示 8 个通道；缺失属性使用“—”，不误判为故障。</p></div><span className="inverter-section-counts" aria-label="微逆在线统计">在线 {onlineInverterCount} · 近期离线 {recentOfflineInverterCount}</span></div><div className="inverter-grid">{Array.from({ length: 8 }, (_, offset) => {
      const inverterIndex = offset + 1
      const summary = inverterSummaries[offset]
      const binding = device.inverterBindings.find((item) => item.inverterIndex === inverterIndex)
      const rows = summary?.latestRows ?? []
      const onlineRaw = numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.onlineState))
      const workRaw = numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.workState))
      const powerRow = findLatestMetric(rows, ['inverter_power', 'generation_power', 'total_power', 'power'])
      const power = numericValue(powerRow)
      const status = resolveInverterCardStatus({
        onlineState: onlineRaw,
        paired: binding?.paired,
        power
      })
      const faultNames = summary?.faults.flatMap((fault) => fault.faults.map((item) => item.name)) ?? []
      const chart = inverterCharts[offset]
      const powerSeries = chart?.power ?? []
      const pv1Series = powerSeries.filter((item) => item.key === 'pv1')
      const pv2Series = powerSeries.filter((item) => item.key === 'pv2')
      const temperatureSeries = chart?.temperature ?? []
      const energySeries = chart?.energy ?? []
      const packetLossSeries = chart?.packetLoss ?? []
      const generating = isGenerating(onlineRaw, workRaw, power)
      const phaseLabel = displayInverterPhaseLabel(numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.phase)) ?? binding?.phaseNum)
      const sub1gStatus = deriveInverterSub1gStatus({
        onlineState: onlineRaw,
        paired: binding?.paired === true
      })
      const value = (aliases: string[], unit = '') => displayValue(findLatestMetric(rows, aliases), unit)
      const energy = (aliases: string[]) => displayEnergyKwh(findLatestMetric(rows, aliases))
      const snText = displayInverterIdentity(binding?.inverterSn, findLatestMetric(rows, ['inverter_sn']))
      const softwareText = displayInverterIdentity(binding?.softwareVersion, findLatestMetric(rows, ['software_version']))
      return <article key={inverterIndex} className={`inverter-card ${status.variant}`}>
        <div className="inverter-head"><div><h3>微型逆变器 {inverterIndex}：{phaseLabel}</h3><p className="inverter-meta">SN：{snText}<br />软件 {softwareText}</p></div><span className={`badge ${status.variant}`}>{status.label}</span></div>
        <div className="inverter-state-grid"><div><span>工作状态</span><strong>{getInverterWorkStatus(workRaw)}</strong></div><div><span>是否发电</span><strong>{status.variant === 'online' ? (generating ? '正在发电' : '否') : EMPTY}</strong></div><div><span>防逆流开关</span><strong>{displaySwitch(findLatestMetric(rows, INVERTER_KPI_ALIASES.antiReverse))}</strong></div><div><span>发电开关</span><strong>{displaySwitch(findLatestMetric(rows, INVERTER_KPI_ALIASES.generationEnabled))}</strong></div></div>
        <div className="inverter-metric-tiers">
          <div className="inv-card-pv-row">
            <HistoryMetric label="PV1" value={value(['pv1_power', 'pv1power'], 'W')} title={`微型逆变器 ${inverterIndex} PV1 功率历史`} series={pv1Series} />
            <HistoryMetric label="PV2" value={value(['pv2_power', 'pv2power'], 'W')} title={`微型逆变器 ${inverterIndex} PV2 功率历史`} series={pv2Series} />
          </div>
          <div className="inv-card-primary-row">
            <HistoryMetric label="总功率" value={value(['inverter_power', 'generation_power', 'total_power', 'power'], 'W')} title={`微型逆变器 ${inverterIndex} 功率历史`} series={powerSeries} />
            <HistoryMetric label="今日发电量" value={energy(INVERTER_KPI_ALIASES.todayEnergy)} title={`微型逆变器 ${inverterIndex} 今日发电量历史`} series={energySeries} />
          </div>
          <div className={`inverter-state-grid inverter-state-footer ${sub1gStatus ? 'has-sub1g' : 'total-only'}`}>
            {sub1gStatus ? (
              <div className={`inverter-sub1g-cell tone-${sub1gStatus.tone}`}>
                <span>Sub1G 状态</span>
                <strong>{sub1gStatus.label}</strong>
              </div>
            ) : null}
            <div className="inverter-total-energy-cell">
              <span>累计发电量</span>
              <strong>{energy(INVERTER_KPI_ALIASES.totalEnergy)}</strong>
            </div>
          </div>
          <div className="inv-card-secondary-row">
            <div className="inverter-metric-cell is-duration-energy">
              <span className="label">今日发电时长</span>
              <strong>{value(INVERTER_KPI_ALIASES.todayDuration, 'h')}</strong>
            </div>
            <HistoryMetric label="内部温度" value={value(['internal_temperature', 'temperature'], '°C')} title={`微型逆变器 ${inverterIndex} 内部温度历史`} series={temperatureSeries} />
            <HistoryMetric label="丢包率" value={value(['packet_loss_rate', 'packet_loss'], '%')} title={`微型逆变器 ${inverterIndex} 丢包率历史`} series={packetLossSeries} />
          </div>
        </div>
        {faultNames.length ? <div className="fault-list">{Array.from(new Set(faultNames)).slice(0, 3).map((name) => <span key={name} className="fault-name">{name}</span>)}</div> : <p className="inverter-meta">当前无故障</p>}
        {binding?.paired ? <Link className="card-link" href={`/devices/${encodeURIComponent(canonicalSn)}/inverters/${inverterIndex}`}>查看微逆详情</Link> : <span className="inverter-meta">{binding?.paired === false ? '未配对通道' : '暂无遥测数据'}</span>}
      </article>
    })}</div></section>

    <TelemetryChart title="电网电压与频率（V / Hz）" series={charts.grid} height={360} />

    <section className="panel ct-presence-panel"><h2>CT 本体上下线与离线时长</h2><div className="presence-columns"><div><h3>上线时间</h3><DatedRecordScroll groups={onlineTransitionGroups} emptyText="当前窗口没有上线记录。" itemKey={(item) => `${item.at}-online`} renderItem={(item) => formatClockTime(item.at)} /></div><div><h3>下线时间</h3><DatedRecordScroll groups={offlineTransitionGroups} emptyText="当前窗口没有下线记录。" itemKey={(item) => `${item.at}-offline`} renderItem={(item) => formatClockTime(item.at)} /></div><div><h3>持续离线时间</h3><DatedRecordScroll groups={offlineWindowGroups} emptyText="当前窗口没有离线区间。" itemKey={(item) => `${item.startAt}-${item.endAt}`} renderItem={(item) => <OfflineWindowLabel startAt={item.startAt} endAt={item.endAt} durationMinutes={item.durationMinutes} />} /></div></div></section>
  </main>
}
