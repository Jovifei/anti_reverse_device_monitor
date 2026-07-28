import Link from 'next/link'
import { formatDuration, formatTime } from '@/src/domain/monitoring'
import { DeviceService } from '@/src/services/device-service'

const FILTERS = [
  { value: 'all', label: '全部活跃设备' },
  { value: 'online', label: '仅在线 CT' },
  { value: 'offline', label: '仅离线 CT' },
  { value: 'reverse', label: '仅逆流告警' }
] as const

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

export default async function DeviceListPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; q?: string; status?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const result = await new DeviceService().listDevices(resolvedSearchParams)
  const q = resolvedSearchParams.q || ''
  const status = FILTERS.some((item) => item.value === resolvedSearchParams.status) ? resolvedSearchParams.status : 'all'
  const devices = [...result.items].sort((left, right) => {
    const priority = (device: typeof left) => device.reverseState === 'active' ? 0 : device.offlineAlert ? 1 : device.isOnline ? 2 : 3
    return priority(left) - priority(right) || left.deviceSn.localeCompare(right.deviceSn)
  })

  return <main className="device-overview fleet-overview">
    <header className="page-header fleet-overview-header">
      <div><p className="eyebrow">CT fleet operations</p><h1>防逆流设备运行总览</h1><p className="muted">先处理在线逆流，再处理离线不足 7 天的 CT；离线超过 7 天仅保留记录，不再提醒。</p></div>
      <form className="sn-search" action="/devices" method="get">
        <label htmlFor="overview-sn">CT SN 搜索</label>
        <input id="overview-sn" name="q" defaultValue={q} placeholder="完整 SN 或末尾编号" />
        <select aria-label="设备状态筛选" name="status" defaultValue={status}>
          {FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <button type="submit">查询设备</button>
      </form>
    </header>

    <section className="fleet-priority-grid" aria-label="优先处理状态">
      <article className={`fleet-priority-card critical ${result.summary.criticalReverseFlowCount ? 'is-active' : ''}`}><span>正在逆流</span><strong>{result.summary.criticalReverseFlowCount}</strong><p>{result.summary.criticalReverseFlowCount ? '在线 CT 的当前逆流，需优先处理' : '当前没有在线 CT 逆流'}</p></article>
      <article className={`fleet-priority-card warning ${result.summary.actionableOfflineCount ? 'is-active' : ''}`}><span>待处理离线</span><strong>{result.summary.actionableOfflineCount}</strong><p>离线不足 7 天，可能需要恢复通信或确认设备状态</p></article>
      <article className="fleet-priority-card online"><span>在线 / 活跃 CT</span><strong>{result.summary.onlineCtCount} / {result.summary.activeTotal}</strong><p>{result.summary.staleOfflineCount ? `${result.summary.staleOfflineCount} 台离线超过 7 天，已停止提醒` : '没有超过 7 天仍需保留的离线 CT'}</p></article>
    </section>

    <section className="fleet-list-panel" aria-labelledby="fleet-list-title">
      <div className="panel-heading"><div><p className="eyebrow">Risk ordered</p><h2 id="fleet-list-title">CT 风险与运行概览</h2><p className="muted">每行是一台 CT，每列是一个关键运行指标；不展示型号。</p></div><span className="readonly-badge">共匹配 {result.total} 台</span></div>
      {devices.length ? <div className="fleet-table-scroll" tabIndex={0} aria-label="CT 风险与运行概览表格，可横向滚动查看全部指标">
        <table className="fleet-risk-table">
          <caption>CT 风险与运行概览</caption>
          <thead><tr><th scope="col">CT SN</th><th scope="col">通信状态</th><th scope="col">当前逆流状态</th><th scope="col">今日发电量</th><th scope="col">运行状态</th><th scope="col">限流状态</th><th scope="col">Sub1G</th><th scope="col">WiFi 信号</th><th scope="col">最后上报</th><th scope="col">详情</th></tr></thead>
          <tbody>{devices.map((device) => {
            const connectionText = device.isOnline ? '在线上报中' : device.offlineAlert ? `离线 ${formatDuration(device.offlineMinutes)}，请处理` : `离线 ${formatDuration(device.offlineMinutes)}，已停止提醒`
            return <tr className={`${device.reverseState === 'active' ? 'reverse-row' : ''} ${device.offlineAlert ? 'offline-row' : ''}`} key={device.id}>
              <th scope="row"><Link className="fleet-table-sn" href={`/devices/${encodeURIComponent(device.deviceSn)}`}>{device.deviceSn}</Link><span className="fleet-table-subtext">{connectionText}</span></th>
              <td><span className={`badge ${device.isOnline ? 'online' : 'offline'}`}>{device.isOnline ? 'CT 在线' : 'CT 离线'}</span></td>
              <td><span className={`fleet-table-reverse ${device.reverseState === 'active' ? 'danger-value' : ''}`}>{reverseText(device)}</span></td>
              <td className="fleet-table-value">{device.todayEnergy}</td>
              <td>{device.runtimeState}</td>
              <td>{device.limitState}</td>
              <td>{device.sub1gState}</td>
              <td>{device.wifiSignal}</td>
              <td><time>{formatTime(device.lastReportedAt)}</time></td>
              <td><Link className="fleet-table-action" href={`/devices/${encodeURIComponent(device.deviceSn)}`}>查看详情</Link></td>
            </tr>
          })}</tbody>
        </table>
      </div> : <div className="empty-chart">没有符合条件的活跃设备。</div>}
    </section>
  </main>
}
