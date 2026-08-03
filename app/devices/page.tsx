import Link from 'next/link'
import { SoftRefreshButton } from '@/src/components/soft-refresh-button'
import { OnlineInverterCount } from '@/src/components/online-inverter-count'
import { WifiSignalView } from '@/src/components/wifi-signal-view'
import { deviceSnPrimaryLabel, deviceSnSecondaryLabel } from '@/src/domain/device-identity'
import { formatDuration, formatTime, wifiSignalBars } from '@/src/domain/monitoring'
import { DeviceService } from '@/src/services/device-service'

const FILTERS = [
  { value: 'all', label: '全部活跃设备' },
  { value: 'online', label: '仅在线 CT' },
  { value: 'offline', label: '仅离线 CT' },
  { value: 'reverse', label: '仅逆流告警' }
] as const

function fleetListHref(status: (typeof FILTERS)[number]['value'], q: string) {
  const params = new URLSearchParams()
  if (status !== 'all') params.set('status', status)
  const trimmed = q.trim()
  if (trimmed) params.set('q', trimmed)
  const query = params.toString()
  return query ? `/devices?${query}` : '/devices'
}

function reverseText(device: {
  reverseState: 'normal' | 'active' | 'unknown' | 'unknown-last-seen-reverse'
  reverseFlowPhases: Array<'A' | 'B' | 'C'>
}) {
  const phases = device.reverseFlowPhases.join(' / ')
  if (device.reverseState === 'active') return `严重逆流：${phases} 相正在反送电网`
  if (device.reverseState === 'unknown-last-seen-reverse') return `当前逆流未知；离线前观测到 ${phases} 相逆流`
  if (device.reverseState === 'unknown') return 'CT 已离线，当前逆流状态未知'
  return '三相当前未检测到逆流'
}

function runtimeTone(label: string) {
  if (label === '正常运行') return 'ok'
  if (label.includes('等待') || label === '—') return 'warn'
  if (label.includes('执行') || label.includes('判断')) return 'progress'
  return 'muted'
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
    const priority = (device: typeof left) => device.reverseState === 'active' ? 0 : device.offlineAlert ? 1 : device.isOnline ? 2 : 3
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
        href={fleetListHref('offline', q)}
        className={`fleet-priority-card warning ${result.summary.actionableOfflineCount ? 'is-active' : ''} ${status === 'offline' ? 'is-selected' : ''}`}
        aria-current={status === 'offline' ? 'page' : undefined}
      >
        <span>待处理离线</span>
        <strong>{result.summary.actionableOfflineCount}</strong>
        <p>离线不足 7 天，可能需要恢复通信或确认设备状态 · 点击筛选</p>
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
    </section>

    <section className="fleet-list-panel" aria-labelledby="fleet-list-title">
      <div className="panel-heading"><div><p className="eyebrow">Risk ordered</p><h2 id="fleet-list-title">CT 风险与运行概览</h2><p className="muted">运行状态与 WiFi 用色块/格数突出；今日发电量用于快速判断是否在发电。</p></div><span className="readonly-badge">共匹配 {result.total} 台</span></div>
      {devices.length ? <div className="fleet-table-scroll" tabIndex={0} aria-label="CT 风险与运行概览表格，可横向滚动查看全部指标">
        <table className="fleet-risk-table">
          <caption>CT 风险与运行概览</caption>
          <thead><tr><th scope="col">CT SN</th><th scope="col">通信状态</th><th scope="col">当前逆流状态</th><th scope="col">今日发电量</th><th scope="col">在线微逆个数</th><th scope="col">运行状态</th><th scope="col">限流状态</th><th scope="col">Sub1G</th><th scope="col">WiFi 信号</th><th scope="col">最后上报</th><th scope="col">详情</th></tr></thead>
          <tbody>{devices.map((device) => {
            const connectionText = device.isOnline ? '在线上报中' : device.offlineAlert ? `离线 ${formatDuration(device.offlineMinutes)}，请处理` : `离线 ${formatDuration(device.offlineMinutes)}，已停止提醒`
            const primary = deviceSnPrimaryLabel(device.deviceSn)
            const secondary = deviceSnSecondaryLabel(device.deviceSn)
            const wifiRaw = parseWifiNumber(device.wifiSignal)
            return <tr className={`${device.reverseState === 'active' ? 'reverse-row' : ''} ${device.offlineAlert ? 'offline-row' : ''}`} key={device.id}>
              <th scope="row"><Link className="fleet-table-sn" href={`/devices/${encodeURIComponent(device.deviceSn)}`}>{primary}</Link><span className="fleet-table-subtext">{secondary ? `${secondary} · ${connectionText}` : connectionText}</span></th>
              <td><span className={`badge ${device.isOnline ? 'online' : 'offline'}`}>{device.isOnline ? 'CT 在线' : 'CT 离线'}</span></td>
              <td><span className={`fleet-table-reverse ${device.reverseState === 'active' ? 'danger-value' : ''}`}>{reverseText(device)}</span></td>
              <td className={`fleet-table-value ${device.todayEnergy !== '—' ? 'is-energy' : ''}`}>{device.todayEnergy}</td>
              <td><OnlineInverterCount online={device.onlineInverterCount} total={device.inverterCount || 8} /></td>
              <td><span className={`status-chip tone-${runtimeTone(device.runtimeState)}`}>{device.runtimeState}</span></td>
              <td>{device.limitState}</td>
              <td>{device.sub1gState}</td>
              <td><WifiSignalView value={device.wifiSignal} bars={wifiSignalBars(wifiRaw)} /></td>
              <td><time>{formatTime(device.lastReportedAt)}</time></td>
              <td><Link className="fleet-table-action" href={`/devices/${encodeURIComponent(device.deviceSn)}`}>查看详情</Link></td>
            </tr>
          })}</tbody>
        </table>
      </div> : <div className="empty-chart">没有符合条件的活跃设备。</div>}
    </section>
  </main>
}
