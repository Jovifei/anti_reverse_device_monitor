import Link from 'next/link'
import { DatedRecordScroll } from '@/src/components/dated-record-scroll'
import { DeviceSnSearch } from '@/src/components/device-sn-search'
import { MetricHistoryDialog } from '@/src/components/metric-history-dialog'
import { TelemetryChart, type ClientChartSeries } from '@/src/components/telemetry-chart'
import { faultDisplayNames } from '@/src/domain/faults'
import {
  INVERTER_KPI_ALIASES,
  displayEnergyKwh,
  displayInverterPhaseLabel,
  displayPowerLimit,
  displaySwitch,
  displayValue,
  findLatestMetric,
  formatClockTime,
  formatDuration,
  formatTime,
  getInverterStatus,
  getInverterWorkStatus,
  groupByLocalDate,
  isGenerating,
  numericValue
} from '@/src/domain/monitoring'
import { resolveStatusLabel } from '@/src/domain/dictionaries'
import { DeviceService } from '@/src/services/device-service'

const EMPTY = '—'

function MetricCard({
  label,
  value,
  series,
  tier = 'secondary'
}: {
  label: string
  value: string
  series?: ClientChartSeries[]
  tier?: 'pv' | 'primary' | 'secondary'
}) {
  const content = (
    <div className={`metric-card inv-metric-card inv-metric-${tier}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  )
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
  const powerRow = findLatestMetric(rows, ['inverter_power', 'generation_power', 'total_power', 'power'])
  const power = numericValue(powerRow)
  const status = summary.paired === false ? getInverterStatus(0) : getInverterStatus(onlineRaw)
  const generating = status.variant === 'online' && isGenerating(onlineRaw, workRaw, power)
  const faultRow = rows.find((row) => row.metricKey.toLowerCase().includes('fault'))
  const summaryFaultNames = summary.faults.flatMap((fault) => fault.faults.map((item) => item.name))
  const faultNames = summaryFaultNames.length ? Array.from(new Set(summaryFaultNames)) : faultDisplayNames(numericValue(faultRow))
  const currentStateMinutes = status.variant === 'online' ? summary.connectivity.currentOnlineMinutes : status.variant === 'offline' ? summary.connectivity.currentOfflineMinutes : null
  const pv1Row = findLatestMetric(rows, ['pv1_power', 'pv1power'])
  const pv2Row = findLatestMetric(rows, ['pv2_power', 'pv2power'])
  const todayEnergyRow = findLatestMetric(rows, INVERTER_KPI_ALIASES.todayEnergy)
  const todayDurationRow = findLatestMetric(rows, INVERTER_KPI_ALIASES.todayDuration)
  const temperatureRow = findLatestMetric(rows, ['internal_temperature', 'temperature'])
  const packetLossRow = findLatestMetric(rows, INVERTER_KPI_ALIASES.packetLoss)
  const pv1Series = charts.power.filter((item) => item.key === 'pv1')
  const pv2Series = charts.power.filter((item) => item.key === 'pv2')

  const transitionGroups = groupByLocalDate(summary.connectivity.transitions, (item) => item.at)
  const offlineGroups = groupByLocalDate(summary.connectivity.offlineWindows, (item) => item.startAt)
  const faultGroups = groupByLocalDate(summary.faultChanges, (item) => item.at)

  return <main>
    <header className="page-header"><div><p className="nav-back"><Link className="utility-link" href={`/devices/${encodeURIComponent(summary.deviceSn)}`}>← 返回 CT {summary.deviceSn}</Link><Link className="utility-link" href="/devices">防逆流设备主页</Link></p><p className="eyebrow">CT {summary.deviceSn}</p><h1>微型逆变器 {summary.inverterIndex}：{displayInverterPhaseLabel(summary.phaseNum)} · {summary.inverterSn ?? EMPTY}</h1><p className="muted">软件版本 {summary.softwareVersion ?? EMPTY} · Sub1G 版本 {summary.sub1gVersion ?? EMPTY}</p></div><DeviceSnSearch initialSn={summary.deviceSn} /></header>

    <section className={`gen-spotlight inv-detail-gen ${generating ? 'is-on' : 'is-off'}`} aria-label="发电状态">
      <div>
        <p className="eyebrow">Generation focus</p>
        <h2>{status.variant === 'online' ? (generating ? '正在发电' : '当前未发电') : status.label}</h2>
        <p className="muted">工作状态 {getInverterWorkStatus(workRaw)} · 状态持续 {formatDuration(currentStateMinutes)}</p>
      </div>
      <strong className="gen-spotlight-power">{displayValue(powerRow, 'W')}</strong>
      <span className={`badge ${status.variant}`}>{status.label}</span>
    </section>

    <section className="inverter-hero"><div className="panel-heading"><div><h2>当前运行状态</h2><p className="muted">在线、工作与发电状态独立呈现。</p></div><span className={`badge ${status.variant}`}>{status.label}</span></div><div className="status-row"><div><strong>工作状态：</strong>{getInverterWorkStatus(workRaw)}</div><div><strong>当前是否发电：</strong>{status.variant === 'online' ? (generating ? '正在发电' : '否') : EMPTY}</div><div><strong>当前状态持续：</strong>{formatDuration(currentStateMinutes)}</div></div></section>

    <section className="inv-kpi-stack" aria-label="微逆功率与发电指标">
      <div className="inv-pv-hero-grid">
        <MetricCard label="PV1 功率" value={displayValue(pv1Row, 'W')} series={pv1Series} tier="pv" />
        <MetricCard label="PV2 功率" value={displayValue(pv2Row, 'W')} series={pv2Series} tier="pv" />
      </div>
      <div className="inv-kpi-primary-grid">
        <MetricCard label="当前发电总功率" value={displayValue(powerRow, 'W')} series={charts.power} tier="primary" />
        <MetricCard label="今日发电量" value={displayEnergyKwh(todayEnergyRow)} series={charts.energy} tier="primary" />
      </div>
      <div className="inv-kpi-secondary-grid">
        <MetricCard label="今日发电时长" value={displayValue(todayDurationRow, 'h')} tier="secondary" />
        <MetricCard label="内部温度" value={displayValue(temperatureRow, '°C')} series={charts.temperature} tier="secondary" />
        <MetricCard label="丢包率" value={displayValue(packetLossRow, '%')} series={charts.packetLoss} tier="secondary" />
      </div>
      <p className="inv-kpi-footnote muted">累计发电量 {displayEnergyKwh(findLatestMetric(rows, INVERTER_KPI_ALIASES.totalEnergy))}</p>
    </section>

    <section className="panel compact-config-panel">
      <div className="panel-heading"><h2>通信与接入配置</h2></div>
      <dl className="compact-config-row">
        <div>
          <dt>所在相</dt>
          <dd><strong className="compact-config-value">{displayInverterPhaseLabel(summary.phaseNum)}</strong></dd>
        </div>
        <div>
          <dt>接入点</dt>
          <dd><strong className="compact-config-value">{resolveStatusLabel('connection_point', summary.connectionPoint) ?? EMPTY}</strong></dd>
        </div>
        <div>
          <dt>防逆流开关</dt>
          <dd><strong className="compact-config-value">{displaySwitch(findLatestMetric(rows, INVERTER_KPI_ALIASES.antiReverse))}</strong></dd>
        </div>
        <div>
          <dt>发电开关</dt>
          <dd><strong className="compact-config-value">{displaySwitch(findLatestMetric(rows, INVERTER_KPI_ALIASES.generationEnabled))}</strong></dd>
        </div>
        <div>
          <dt>功率限制</dt>
          <dd><strong className="compact-config-value">{displayPowerLimit(findLatestMetric(rows, INVERTER_KPI_ALIASES.powerLimit))}</strong></dd>
        </div>
      </dl>
    </section>
    <TelemetryChart title="发电功率（W）" series={charts.power} height={480} />
    <TelemetryChart title="内部温度（°C）" series={charts.temperature} height={420} />
    <TelemetryChart title="今日发电量（kWh）" series={charts.energy} height={360} />
    <TelemetryChart title="丢包率（%）" series={charts.packetLoss} height={360} />
    <section className="two-column">
      <div className="panel">
        <h2>在线和离线记录</h2>
        <p>当前状态持续：{formatDuration(currentStateMinutes)}</p>
        <DatedRecordScroll
          groups={transitionGroups}
          emptyText="没有 online_state 记录。"
          scrollClassName="record-scroll-tall"
          itemKey={(item) => `${item.at}-${item.state}`}
          renderItem={(item) => {
            const label = item.value === null
              ? (item.state === 'online' ? '上线' : '离线')
              : (resolveStatusLabel('inverter_online_state', item.value) ?? EMPTY)
            const online = item.state === 'online' || label.includes('在线')
            return <>{formatClockTime(item.at)}：<span className={online ? 'record-state-online' : 'record-state-offline'}>{label}</span></>
          }}
        />
      </div>
      <div className="panel">
        <h2>离线区间</h2>
        <DatedRecordScroll
          groups={offlineGroups}
          emptyText="当前窗口没有离线区间。"
          scrollClassName="record-scroll-tall"
          itemKey={(item) => `${item.startAt}-${item.endAt}`}
          renderItem={(item) => (
            <>
              {formatClockTime(item.startAt)} 至 {item.endAt ? formatTime(item.endAt) : '持续中'} · {formatDuration(item.durationMinutes)}
            </>
          )}
        />
      </div>
    </section>
    <section className="panel">
      <h2>当前故障</h2>
      {faultNames === null ? <p className="muted">{EMPTY}</p> : faultNames.map((name) => <span key={name} className={name === '当前无故障' ? 'fault-clear' : 'fault-name'}>{name}</span>)}
      <h3>故障码变化记录</h3>
      <DatedRecordScroll
        groups={faultGroups}
        emptyText="最近 7 天没有故障变化。"
        scrollClassName="record-scroll-tall"
        itemKey={(event) => `${event.at}-${event.eventType}-${event.fromMask}-${event.toMask}`}
        renderItem={(event) => (
          <>
            <strong>{faultEventLabel[event.eventType]}</strong> · {formatClockTime(event.at)}
            <br />
            {event.toFaults.length ? event.toFaults.join('、') : '故障已恢复'}
          </>
        )}
      />
    </section>
    <Link href={`/devices/${encodeURIComponent(summary.deviceSn)}`}>返回 CT 设备页面</Link>
  </main>
}
