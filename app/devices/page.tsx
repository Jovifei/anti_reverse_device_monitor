import Link from 'next/link'
import { formatTime } from '@/src/domain/monitoring'
import { DeviceService } from '@/src/services/device-service'

const FILTERS = [
  { value: 'all', label: '全部活跃设备' },
  { value: 'online', label: '仅在线 CT' },
  { value: 'offline', label: '仅离线 CT' },
  { value: 'reverse', label: '仅逆流告警' }
] as const

export default async function DeviceListPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; q?: string; status?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const result = await new DeviceService().listDevices(resolvedSearchParams)
  const q = resolvedSearchParams.q || ''
  const status = FILTERS.some((item) => item.value === resolvedSearchParams.status) ? resolvedSearchParams.status : 'all'

  return <main className="device-overview">
    <header className="page-header">
      <div><p className="eyebrow">设备群运行监控</p><h1>防逆流设备运行总览</h1><p className="muted">默认展示最近 7 天有上报或曾在线的 CT；离线设备保留在总览中并以灰色标识。</p></div>
      <form className="sn-search" action="/devices" method="get">
        <label htmlFor="overview-sn">CT SN 搜索</label>
        <input id="overview-sn" name="q" defaultValue={q} placeholder="完整 SN 或末尾编号" />
        <select aria-label="设备状态筛选" name="status" defaultValue={status}>
          {FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <button type="submit">查询设备</button>
      </form>
    </header>

    <section className="overview-metrics" aria-label="设备汇总">
      <article className="metric-card"><div className="label">最近 7 天活跃设备</div><div className="value">{result.summary.activeTotal}</div><div className="hint">有上报或曾上线的 CT</div></article>
      <article className="metric-card"><div className="label">当前在线 CT</div><div className="value">{result.summary.onlineCtCount}</div><div className="hint">15 分钟内仍有心跳</div></article>
      <article className="metric-card"><div className="label">当前离线 CT</div><div className="value">{result.summary.offlineCtCount}</div><div className="hint">仍保留在验收总览中</div></article>
      <article className="metric-card metric-card-danger"><div className="label">严重逆流设备</div><div className="value">{result.summary.criticalReverseFlowCount}</div><div className="hint">当前任一相功率为负</div></article>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><h2>CT 设备清单</h2><p className="muted">共匹配 {result.total} 台设备；点击任意设备进入完整运行面板。</p></div></div>
      <div className="device-table">
        <div className="device-row head"><span>CT SN</span><span>当前状态</span><span>最后上报时间</span><span>三相逆流状态</span><span>微逆在线 / 已绑定</span><span>操作</span></div>
        {result.items.length ? result.items.map((device) => <div className={`device-row ${device.isOnline ? '' : 'offline-row'} ${device.reverseFlow ? 'reverse-row' : ''}`} key={device.id}>
          <div><Link className="device-name" href={`/devices/${encodeURIComponent(device.deviceSn)}`}>{device.deviceSn}</Link><span className="device-subline">{device.productModel || '防逆流 CT 电表'}</span></div>
          <div><span className={`badge ${device.isOnline ? 'online' : 'offline'}`}>{device.isOnline ? '在线' : '离线'}</span></div>
          <div className="muted">{formatTime(device.lastReportedAt)}</div>
          <div>{device.reverseFlow ? <span className="badge danger">{device.reverseFlowPhases.join(' / ')} 相逆流告警</span> : <span className="phase-normal">三相正常</span>}</div>
          <div><strong>{device.onlineInverterCount} / {device.inverterCount}</strong><span className="device-subline">在线微逆 / 已绑定微逆</span></div>
          <Link className="table-action" href={`/devices/${encodeURIComponent(device.deviceSn)}`}>进入设备详情</Link>
        </div>) : <div className="empty-chart">没有符合条件的活跃设备</div>}
      </div>
    </section>
  </main>
}
