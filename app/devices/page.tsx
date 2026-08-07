import Link from 'next/link'
import { SoftRefreshButton } from '@/src/components/soft-refresh-button'
import { OnlineInverterCount } from '@/src/components/online-inverter-count'
import { WifiSignalView } from '@/src/components/wifi-signal-view'
import { deviceSnPrimaryLabel, deviceSnSecondaryLabel } from '@/src/domain/device-identity'
import { fleetLastKnownClass, fleetLastKnownTitle } from '@/src/domain/fleet-last-known'
import { formatDuration, formatTime, wifiSignalBars } from '@/src/domain/monitoring'
import { DeviceService } from '@/src/services/device-service'

const FILTERS = [
  { value: 'all', label: '全部活跃设备' },
  { value: 'online', label: '仅在线 CT' },
  { value: 'offline', label: '仅离线 CT' },
  { value: 'reverse', label: '仅逆流告警' },
  { value: 'sustained-reverse', label: '近7天长时逆流' },
  { value: 'inv-offline', label: '存在离线微逆' },
  { value: 'inv-fault', label: '近7天微逆故障' },
  { value: 'stale-offline', label: '7 日以上离线' }
] as const

function fleetListHref(status: (typeof FILTERS)[number]['value'], q: string) {
  const params = new URLSearchParams()
  if (status !== 'all') params.set('status', status)
  const trimmed = q.trim()
  if (trimmed) params.set('q', trimmed)
  const query = params.toString()
  return query ? `/devices?${query}` : '/devices'
}

function sustainedReverseClause(device: {
  hasSustainedReverse?: boolean
  sustainedReverseMaxMinutes?: number | null
  sustainedReversePhases?: Array<'A' | 'B' | 'C'>
}) {
  if (!device.hasSustainedReverse || !device.sustainedReverseMaxMinutes) return ''
  const sustainedPhases = (device.sustainedReversePhases ?? []).join(' / ')
  return `近7天${sustainedPhases ? ` ${sustainedPhases} 相` : ''}曾持续 ≥40 分钟（最长 ${device.sustainedReverseMaxMinutes} 分钟）`
}

function reverseText(device: {
  reverseState: 'normal' | 'active' | 'unknown' | 'unknown-last-seen-reverse'
  reverseFlowPhases: Array<'A' | 'B' | 'C'>
  hasSustainedReverse?: boolean
  sustainedReverseMaxMinutes?: number | null
  sustainedReversePhases?: Array<'A' | 'B' | 'C'>
}) {
  const phases = device.reverseFlowPhases.join(' / ')
  const sustained = sustainedReverseClause(device)
  if (device.reverseState === 'active') return `严重逆流：${phases} 相正在反送电网`
  if (device.reverseState === 'unknown-last-seen-reverse') {
    return sustained
      ? `当前逆流未知；离线前观测到 ${phases} 相逆流，${sustained}`
      : `当前逆流未知；离线前观测到 ${phases} 相逆流`
  }
  if (device.reverseState === 'unknown') {
    return sustained ? `CT 已离线，当前逆流状态未知，${sustained}` : 'CT 已离线，当前逆流状态未知'
  }
  if (sustained) return `当前未逆流；${sustained}`
  return '三相当前未检测到逆流'
}

function runtimeTone(label: string) {
  if (label === '正常运行') return 'ok'
  if (label.includes('等待') || label === '—') return 'warn'
  if (label.includes('执行') || label.includes('判断')) return 'progress'
  return 'muted'
}

function generationTone(status: 'generating' | 'idle' | 'offline') {
  if (status === 'generating') return 'ok'
  if (status === 'idle') return 'warn'
  return 'muted'
}

function joinClass(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function parseWifiNumber(raw: string) {
  const match = /-?\d+(\.\d+)?/.exec(raw)
  if (!match) return null
  const value = Number(match[0])
  return Number.isFinite(value) ? value : null
}

export default async function DeviceListPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; q?: string; status?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const result = await new DeviceService().listDevices({
    ...resolvedSearchParams,
    q: resolvedSearchParams.q?.trim() ? resolvedSearchParams.q.trim() : undefined
  })
  const q = resolvedSearchParams.q?.trim() || ''
  const status = FILTERS.find((item) => item.value === resolvedSearchParams.status)?.value ?? 'all'
  const devices = [...result.items].sort((left, right) => {
    const priority = (device: typeof left) =>
      device.reverseState === 'active'
        ? 0
        : device.hasSustainedReverse
          ? 1
          : device.hasRecentInverterFault
            ? 2
            : device.offlineAlert
              ? 3
              : device.isOnline
                ? 4
                : 5
    return priority(left) - priority(right) || left.deviceSn.localeCompare(right.deviceSn)
  })

  return <main className="device-overview fleet-overview">
    <header className="page-header fleet-overview-header">
      <div><p className="eyebrow">CT fleet operations</p><h1>防逆流设备运行总览</h1><p className="muted">先处理在线逆流，再处理离线不足 7 天的 CT；离线超过 7 天仅保留记录，不再提醒。</p></div>
      <div className="fleet-header-actions">
        <SoftRefreshButton />
        <form className="sn-search" action="/devices" method="get">
          <label htmlFor="overview-sn">CT SN 搜索</label>
          <input id="overview-sn" name="q" defaultValue={q} placeholder="完整 SN 或末尾编号" />
          {status !== 'all' ? <input type="hidden" name="status" value={status} /> : null}
          <button type="submit">查询设备</button>
        </form>
      </div>
    </header>

    <nav className="fleet-status-tabs" aria-label="设备状态筛选">
      {FILTERS.map((item) => {
        const active = status === item.value
        return (
          <Link
            key={item.value}
            href={fleetListHref(item.value, q)}
            className={`fleet-status-tab ${active ? 'is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>

    <section className="fleet-priority-grid" aria-label="优先处理状态">
      <Link
        href={fleetListHref('reverse', q)}
        className={`fleet-priority-card critical ${result.summary.criticalReverseFlowCount ? 'is-active' : ''} ${status === 'reverse' ? 'is-selected' : ''}`}
        aria-current={status === 'reverse' ? 'page' : undefined}
      >
        <span>正在逆流</span>
        <strong>{result.summary.criticalReverseFlowCount}</strong>
        <p>{result.summary.criticalReverseFlowCount ? '在线 CT 的当前逆流，需优先处理' : '当前没有在线 CT 逆流'} · 点击筛选</p>
      </Link>
      <Link
        href={fleetListHref('sustained-reverse', q)}
        className={`fleet-priority-card sustained-reverse ${result.summary.sustainedReverseCtCount ? 'is-active' : ''} ${status === 'sustained-reverse' ? 'is-selected' : ''}`}
        aria-current={status === 'sustained-reverse' ? 'page' : undefined}
      >
        <span>近7天长时逆流</span>
        <strong>{result.summary.sustainedReverseCtCount}</strong>
        <p>
          {result.summary.sustainedReverseCtCount
            ? `${result.summary.sustainedReverseCtCount} 台 CT 近 7 天出现过持续 ≥40 分钟逆流`
            : '近 7 天没有持续 ≥40 分钟的逆流'}
          {' '}· 点击筛选
        </p>
      </Link>
      <Link
        href={fleetListHref('offline', q)}
        className={`fleet-priority-card warning ${result.summary.actionableOfflineCount ? 'is-active' : ''} ${status === 'offline' ? 'is-selected' : ''}`}
        aria-current={status === 'offline' ? 'page' : undefined}
      >
        <span>待处理离线</span>
        <strong>{result.summary.actionableOfflineCount}</strong>
        <p>离线不足 7 天，可能需要恢复通信或确认设备状态 · 点击筛选</p>
      </Link>
      <Link
        href={fleetListHref('inv-offline', q)}
        className={`fleet-priority-card inv-offline ${result.summary.ctsWithOfflineInverters ? 'is-active' : ''} ${status === 'inv-offline' ? 'is-selected' : ''}`}
        aria-current={status === 'inv-offline' ? 'page' : undefined}
      >
        <span>存在离线微逆</span>
        <strong>{result.summary.ctsWithOfflineInverters}</strong>
        <p>
          {result.summary.ctsWithOfflineInverters
            ? `${result.summary.ctsWithOfflineInverters} 台 CT · 共 ${result.summary.offlineInverterUnitCount} 路配对微逆离线`
            : '当前没有配对微逆离线'}
          {' '}· 点击筛选
        </p>
      </Link>
      <Link
        href={fleetListHref('inv-fault', q)}
        className={`fleet-priority-card inv-fault ${result.summary.recentInverterFaultCtCount ? 'is-active' : ''} ${status === 'inv-fault' ? 'is-selected' : ''}`}
        aria-current={status === 'inv-fault' ? 'page' : undefined}
      >
        <span>近7天微逆故障</span>
        <strong>{result.summary.recentInverterFaultCtCount}</strong>
        <p>
          {result.summary.recentInverterFaultCtCount
            ? `${result.summary.recentInverterFaultCtCount} 台 CT 近 7 天出现过需关注的微逆故障（不含 PV 欠压/电压异常）`
            : '近 7 天没有需关注的微逆故障'}
          {' '}· 点击筛选
        </p>
      </Link>
      <Link
        href={fleetListHref('online', q)}
        className={`fleet-priority-card online ${status === 'online' ? 'is-selected' : ''}`}
        aria-current={status === 'online' ? 'page' : undefined}
      >
        <span>在线 / 活跃 CT</span>
        <strong>{result.summary.onlineCtCount} / {result.summary.activeTotal}</strong>
        <p>{result.summary.staleOfflineCount ? `${result.summary.staleOfflineCount} 台离线超过 7 天，已停止提醒` : '没有超过 7 天仍需保留的离线 CT'} · 点击筛选</p>
      </Link>
      <Link
        href={fleetListHref('stale-offline', q)}
        className={`fleet-priority-card stale-offline ${result.summary.staleOfflineCount ? 'is-active' : ''} ${status === 'stale-offline' ? 'is-selected' : ''}`}
        aria-current={status === 'stale-offline' ? 'page' : undefined}
      >
        <span>7 日以上离线</span>
        <strong>{result.summary.staleOfflineCount}</strong>
        <p>
          {result.summary.staleOfflineCount
            ? `${result.summary.staleOfflineCount} 台 IoT 设备 7 日以上无上报数据`
            : '没有 7 日以上离线的 IoT 设备'}
          {' '}· 点击筛选
        </p>
      </Link>
    </section>

    <section className="fleet-list-panel" aria-labelledby="fleet-list-title">
      <div className="panel-heading"><div><p className="eyebrow">Risk ordered</p><h2 id="fleet-list-title">CT 风险与运行概览</h2><p className="muted">运行状态与 WiFi 用色块/格数突出；微逆发电状态区分发电 / 在线未发电 / 离线。</p></div><span className="readonly-badge">共匹配 {result.total} 台</span></div>
      {devices.length ? <div className="fleet-table-scroll" tabIndex={0} aria-label="CT 风险与运行概览表格，可横向滚动查看全部指标">
        <table className="fleet-risk-table">
          <caption>CT 风险与运行概览</caption>
          <thead><tr><th scope="col">CT SN</th><th scope="col">通信状态</th><th scope="col">运行状态</th><th scope="col">限流状态</th><th scope="col">当前逆流状态</th><th scope="col">今日发电量</th><th scope="col">微逆发电状态</th><th scope="col">在线微逆个数</th><th scope="col">Sub1G</th><th scope="col">WiFi 信号</th><th scope="col">最后上报</th><th scope="col">详情</th></tr></thead>
          <tbody>{devices.map((device) => {
            const connectionText = device.isOnline ? '在线上报中' : device.offlineAlert ? `离线 ${formatDuration(device.offlineMinutes)}，请处理` : `离线 ${formatDuration(device.offlineMinutes)}，已停止提醒`
            const primary = deviceSnPrimaryLabel(device.deviceSn)
            const secondary = deviceSnSecondaryLabel(device.deviceSn)
            const wifiRaw = parseWifiNumber(device.wifiSignal)
            const lastKnown = fleetLastKnownClass(device.isOnline)
            const genExtra = device.inverterGenerationStatus === 'idle' ? '在线但是未发电' : undefined
            const lastKnownTitle = fleetLastKnownTitle(device.isOnline)
            const genTitle = fleetLastKnownTitle(device.isOnline, genExtra)
            return <tr className={joinClass(
              device.reverseState === 'active' && 'reverse-row',
              device.hasSustainedReverse && device.reverseState !== 'active' && 'sustained-reverse-row',
              device.hasRecentInverterFault && 'inv-fault-row',
              device.offlineAlert && 'offline-row',
              !device.isOnline && 'ct-offline-row',
              device.hasOfflineInverter && 'inv-offline-row',
              device.classifyStatus === 'stale-offline' && 'stale-offline-row'
            )} key={device.id}>
              <th scope="row"><Link className="fleet-table-sn" href={`/devices/${encodeURIComponent(device.deviceSn)}`}>{primary}</Link><span className="fleet-table-subtext">{secondary ? `${secondary} · ${connectionText}` : connectionText}</span></th>
              <td><span className={`badge ${device.isOnline ? 'online' : 'offline'}`}>{device.isOnline ? 'CT 在线' : 'CT 离线'}</span></td>
              <td className={lastKnown} title={lastKnownTitle}><span className={`status-chip tone-${runtimeTone(device.runtimeState)}`}>{device.runtimeState}</span></td>
              <td className={device.limitState === '限流失败' ? undefined : lastKnown} title={device.limitState === '限流失败' ? '任一相 CT 功率逆流 → 限流失败' : lastKnownTitle}>
                <span className={device.limitState === '限流失败' ? 'danger-value limit-failed' : undefined}>{device.limitState}</span>
              </td>
              <td className={lastKnown} title={lastKnownTitle}><span className={joinClass('fleet-table-reverse', device.isOnline && (device.reverseState === 'active' || device.hasSustainedReverse) && 'danger-value')}>{reverseText(device)}</span></td>
              <td className={joinClass('fleet-table-value', device.todayEnergy !== '—' && 'is-energy', lastKnown)} title={lastKnownTitle}>{device.todayEnergy}</td>
              <td className={lastKnown} title={genTitle}><span className={`status-chip tone-${generationTone(device.inverterGenerationStatus)}`}>{device.inverterGenerationLabel}</span></td>
              <td className={joinClass('fleet-table-value', 'fleet-table-inverters', lastKnown)} title={lastKnownTitle}>
                <OnlineInverterCount online={device.onlineInverterCount} total={device.inverterCount || 8} />
                {device.offlineInverterIndexes.length ? (
                  <span className="fleet-table-inv-offline">离线微逆 #{device.offlineInverterIndexes.join(',')}</span>
                ) : null}
              </td>
              <td className={lastKnown} title={lastKnownTitle}>{device.sub1gState}</td>
              <td className={lastKnown} title={lastKnownTitle}><WifiSignalView value={device.wifiSignal} bars={wifiSignalBars(wifiRaw)} /></td>
              <td><time title={device.classifyStatus === 'stale-offline' && !device.lastReportedAt ? '无近期上报数据' : undefined}>{formatTime(device.lastReportedAt)}</time></td>
              <td><Link className="fleet-table-action" href={`/devices/${encodeURIComponent(device.deviceSn)}`}>查看详情</Link></td>
            </tr>
          })}</tbody>
        </table>
      </div> : <div className="empty-chart">没有符合条件的活跃设备。</div>}
    </section>
  </main>
}
