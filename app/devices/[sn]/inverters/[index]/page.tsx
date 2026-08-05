import Link from 'next/link'
import { DataStaleBanner } from '@/src/components/data-stale-banner'
import { DatedRecordScroll } from '@/src/components/dated-record-scroll'
import { DeviceSnSearch } from '@/src/components/device-sn-search'
import { MetricHistoryDialog } from '@/src/components/metric-history-dialog'
import { OfflineWindowLabel } from '@/src/components/offline-window-label'
import { SoftRefreshButton } from '@/src/components/soft-refresh-button'
import { TelemetryChart, type ClientChartSeries } from '@/src/components/telemetry-chart'
import { faultDisplayNames, faultNameClassName, formatCurrentFaultLabel, hadRecentReportableInverterFault, isReportableInverterFaultName } from '@/src/domain/faults'
import {
  INVERTER_KPI_ALIASES,
  displayEnergyKwh,
  displayPowerLimit,
  displaySwitch,
  displayValue,
  findLatestMetric,
  formatClockTime,
  formatDuration,
  getInverterStatus,
  groupByLocalDate,
  isGenerating,
  numericValue,
  resolveInverterPhaseLabel
} from '@/src/domain/monitoring'
import { resolveStatusLabel } from '@/src/domain/dictionaries'
import { DeviceService } from '@/src/services/device-service'

const EMPTY = '—'

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
  const phaseLabel = resolveInverterPhaseLabel(rows, summary.phaseNum)
  const connectionPointRaw =
    numericValue(findLatestMetric(rows, INVERTER_KPI_ALIASES.connectionPoint)) ?? summary.connectionPoint
  const totalEnergyValue = displayEnergyKwh(findLatestMetric(rows, INVERTER_KPI_ALIASES.totalEnergy))

  const transitionGroups = groupByLocalDate(summary.connectivity.transitions, (item) => item.at)
  const offlineGroups = groupByLocalDate(summary.connectivity.offlineWindows, (item) => item.startAt)
  const faultGroups = groupByLocalDate(summary.faultChanges, (item) => item.at)
  const recentReportableFault = hadRecentReportableInverterFault(summary.faultChanges)
  const currentHasReportableFault = (faultNames ?? []).some((name) => isReportableInverterFaultName(name))
  const showRecentFaultHint = recentReportableFault && !currentHasReportableFault

  return <main className="inv-detail-page">
    <header className="page-header">
      <div>
        <p className="nav-back">
          <Link className="utility-link" href={`/devices/${encodeURIComponent(summary.deviceSn)}`}>← 返回 CT {summary.deviceSn}</Link>
          <Link className="utility-link" href="/devices">防逆流设备主页</Link>
        </p>
        <p className="eyebrow">CT {summary.deviceSn}</p>
        <h1>微型逆变器 {summary.inverterIndex}：{phaseLabel}{summary.inverterSn ? ` · ${summary.inverterSn}` : ''}</h1>
        <p className="muted">软件 {summary.softwareVersion ?? EMPTY} · Sub1G {summary.sub1gVersion ?? EMPTY}</p>
      </div>
      <div className="header-actions">
        <SoftRefreshButton />
        <DeviceSnSearch initialSn={summary.deviceSn} />
      </div>
    </header>
    <DataStaleBanner />

    <section className={`inv-gen-compose ${generating ? 'is-on' : 'is-off'}`} aria-label="发电功率总览">
      <div className="inv-gen-compose-row">
        <div className="inv-gen-compose-status">
          <p className="eyebrow inv-gen-kicker">
            <span className="inv-live-pill">实时</span>
            <span className="inv-live-dot" aria-hidden="true" />
            发电优先
          </p>
          <h2>{status.variant === 'online' ? (generating ? '正在发电' : '当前未发电') : status.label}</h2>
        </div>
        <dl className="inv-power-facts">
          <div className="inv-power-fact is-pv">
            <dt>PV1 功率</dt>
            <dd>
              <MetricHistoryDialog label="PV1 功率" series={pv1Series}>
                <span className="inv-power-fact-value">{displayValue(pv1Row, 'W')}</span>
              </MetricHistoryDialog>
            </dd>
          </div>
          <div className="inv-power-fact is-pv">
            <dt>PV2 功率</dt>
            <dd>
              <MetricHistoryDialog label="PV2 功率" series={pv2Series}>
                <span className="inv-power-fact-value">{displayValue(pv2Row, 'W')}</span>
              </MetricHistoryDialog>
            </dd>
          </div>
          <div className="inv-power-fact is-total">
            <dt>总功率</dt>
            <dd>
              <MetricHistoryDialog label="总功率" series={charts.power}>
                <span className="inv-power-fact-value">{displayValue(powerRow, 'W')}</span>
              </MetricHistoryDialog>
            </dd>
          </div>
        </dl>
        <span className={`badge ${status.variant} inv-gen-online`}>{status.label}</span>
      </div>
    </section>

    <section className="inv-detail-facts" aria-label="运行详情">
      <div className="inv-fact-band">
        <dl className="inv-fact-strip">
          <div className="is-energy">
            <dt>今日发电量</dt>
            <dd>
              <MetricHistoryDialog label="今日发电量" series={charts.energy}>
                <span className="fact-emphasis is-ok">{displayEnergyKwh(todayEnergyRow)}</span>
              </MetricHistoryDialog>
            </dd>
          </div>
          <div className="is-energy">
            <dt>累计发电量</dt>
            <dd><span className="fact-emphasis">{totalEnergyValue}</span></dd>
          </div>
          <div>
            <dt>今日发电时长</dt>
            <dd>{displayValue(todayDurationRow, 'h')}</dd>
          </div>
          <div>
            <dt>内部温度</dt>
            <dd>
              <MetricHistoryDialog label="内部温度" series={charts.temperature}>
                <span className="inv-fact-click">{displayValue(temperatureRow, '°C')}</span>
              </MetricHistoryDialog>
            </dd>
          </div>
          <div>
            <dt>丢包率</dt>
            <dd>
              <MetricHistoryDialog label="丢包率" series={charts.packetLoss}>
                <span className="inv-fact-click">{displayValue(packetLossRow, '%')}</span>
              </MetricHistoryDialog>
            </dd>
          </div>
          <div>
            <dt>防逆流开关</dt>
            <dd>{displaySwitch(findLatestMetric(rows, INVERTER_KPI_ALIASES.antiReverse))}</dd>
          </div>
          <div>
            <dt>发电开关</dt>
            <dd>{displaySwitch(findLatestMetric(rows, INVERTER_KPI_ALIASES.generationEnabled))}</dd>
          </div>
          <div>
            <dt>接入点</dt>
            <dd>{resolveStatusLabel('connection_point', connectionPointRaw) ?? EMPTY}</dd>
          </div>
          <div>
            <dt>功率限制</dt>
            <dd>{displayPowerLimit(findLatestMetric(rows, INVERTER_KPI_ALIASES.powerLimit))}</dd>
          </div>
        </dl>
      </div>
    </section>

    <section className="inv-detail-charts" aria-label="历史曲线">
      <TelemetryChart title="发电功率（W）" series={charts.power} height={420} />
      <TelemetryChart title="今日发电量（kWh）" series={charts.energy} height={300} />
      <div className="inv-detail-chart-duo">
        <TelemetryChart title="内部温度（°C）" series={charts.temperature} height={300} />
        <TelemetryChart title="丢包率（%）" series={charts.packetLoss} height={300} />
      </div>
    </section>

    <section className="inv-detail-records two-column">
      <div className="panel">
        <h2>在线 / 离线</h2>
        <p className="muted">当前状态持续：{formatDuration(currentStateMinutes)}</p>
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
            <OfflineWindowLabel startAt={item.startAt} endAt={item.endAt} durationMinutes={item.durationMinutes} />
          )}
        />
      </div>
    </section>

    <section className="panel inv-fault-panel">
      <h2>当前故障</h2>
      <div className="inv-current-fault" aria-live="polite">
        {faultNames === null ? <p className="muted">{EMPTY}</p> : faultNames.map((name) => (
          <span
            key={name}
            className={`${faultNameClassName(name)}${showRecentFaultHint ? ' has-recent-fault' : ''}`}
          >
            {formatCurrentFaultLabel(name, showRecentFaultHint)}
          </span>
        ))}
      </div>
      <h3>故障码变化记录</h3>
      <DatedRecordScroll
        groups={faultGroups}
        emptyText="最近 7 天没有故障变化。"
        scrollClassName="record-scroll-fault"
        itemKey={(event) => `${event.at}-${event.eventType}-${event.fromMask}-${event.toMask}`}
        renderItem={(event) => {
          const hasAlert = event.toFaults.some((name) => isReportableInverterFaultName(name))
          return (
            <>
              <strong className={hasAlert ? 'fault-event-alert' : undefined}>{faultEventLabel[event.eventType]}</strong> · {formatClockTime(event.at)}
              <br />
              {event.toFaults.length
                ? event.toFaults.map((name, index) => (
                    <span key={`${event.at}-${name}-${index}`}>
                      {index > 0 ? '、' : null}
                      <span className={faultNameClassName(name)}>{name}</span>
                    </span>
                  ))
                : '故障已恢复'}
            </>
          )
        }}
      />
    </section>

    <p className="inv-detail-footer-nav">
      <Link className="utility-link" href={`/devices/${encodeURIComponent(summary.deviceSn)}`}>返回 CT 设备页面</Link>
    </p>
  </main>
}
