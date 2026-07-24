import { clientRuntimeSource } from '@/src/export/offline/client-runtime'
import { escapeHtml } from '@/src/export/offline/html-utils'
import { offlineStyles } from '@/src/export/offline/styles'
import type {
  OfflineDeviceViewModel,
  OfflineInverterViewModel,
  OfflineOverviewViewModel,
  OfflinePageViewModel
} from '@/src/export/offline/types'

function metricCard(label: string, value: string, className = '') {
  const cls = className ? ` metric-card ${className}` : ' metric-card'
  return `<div class="${cls.trim()}"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`
}

function recordList(items: Array<{ text: string }>, empty: string) {
  if (!items.length) return `<p class="muted">${escapeHtml(empty)}</p>`
  return `<div class="record-scroll"><ul class="record-list">${items.map((item) => `<li>${escapeHtml(item.text)}</li>`).join('')}</ul></div>`
}

function reverseAlertList(
  items: Array<{
    phase: 'A' | 'B' | 'C'
    startedAt: string
    endedAt: string
    duration: string
    minimumPower: string
    active: boolean
  }>,
  empty: string
) {
  if (!items.length) return `<p class="muted">${escapeHtml(empty)}</p>`
  const phases: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C']
  return `<div class="alert-phase-grid">${phases
    .map((phase) => {
      const rows = items.filter((item) => item.phase === phase)
      const body = rows.length
        ? rows
            .map(
              (item) => `<article class="alert-card ${item.active ? 'is-active' : ''}">
  <div class="alert-card-time"><span>${escapeHtml(item.startedAt)}</span><span class="alert-arrow">→</span><span class="${item.active ? 'alert-ongoing' : ''}">${escapeHtml(item.endedAt)}</span></div>
  <div class="alert-card-meta"><span>持续 ${escapeHtml(item.duration)}</span><span class="danger-value">${escapeHtml(item.minimumPower)}</span></div>
</article>`
            )
            .join('')
        : `<p class="muted alert-empty">无告警</p>`
      return `<section class="alert-phase-col"><h4>${phase} 相</h4><div class="alert-phase-scroll">${body}</div></section>`
    })
    .join('')}</div>`
}

function seriesAttr(series: unknown) {
  return escapeHtml(JSON.stringify(series))
}

function chartPanel(opts: {
  title: string
  seriesKey: string
  initialKeys?: string[]
  advancedKeys?: string[]
  height?: number
}) {
  return `<section class="chart-panel" data-chart-panel data-series-key="${escapeHtml(opts.seriesKey)}" data-initial-keys="${escapeHtml((opts.initialKeys || []).join(','))}" data-advanced-keys="${escapeHtml((opts.advancedKeys || []).join(','))}">
  <div class="panel-heading"><h2>${escapeHtml(opts.title)}</h2><button type="button" class="chart-reset">复位</button></div>
  <div class="chart-controls day-controls">
    <label><input type="radio" name="days-${escapeHtml(opts.seriesKey)}" value="1"/> 1 天</label>
    <label><input type="radio" name="days-${escapeHtml(opts.seriesKey)}" value="3"/> 3 天</label>
    <label><input type="radio" name="days-${escapeHtml(opts.seriesKey)}" value="7" checked/> 7 天</label>
    <span class="day-night-legend" hidden><i class="day"></i>昼 <i class="night"></i>夜 · 北京日出日落</span>
  </div>
  <div class="series-toggles"></div>
  <div class="chart-host" style="height:${opts.height ?? 430}px"></div>
</section>`
}

function renderOverview(vm: OfflineOverviewViewModel) {
  return `<header class="page-header"><div><p class="eyebrow">Offline Bundle</p><h1>${escapeHtml(vm.title)}</h1><p class="muted">双击本地 HTML 即可查看，无需服务与网络。</p></div><span class="readonly-badge">数据来源：${escapeHtml(vm.sourceLabel)}</span></header>
<section class="card-grid">
  ${metricCard('活跃设备', String(vm.summary.activeTotal))}
  ${metricCard('在线 CT', String(vm.summary.onlineCtCount))}
  ${metricCard('离线 CT', String(vm.summary.offlineCtCount))}
  ${metricCard('严重逆流', String(vm.summary.criticalReverseFlowCount))}
</section>
<section class="panel"><h2>设备列表</h2>
<table class="device-table"><thead><tr><th>SN</th><th>型号</th><th>状态</th><th>最后上报</th><th>逆流</th><th>打开</th></tr></thead><tbody>
${vm.items
  .map(
    (item) => `<tr>
  <td>${escapeHtml(item.deviceSn)}</td>
  <td>${escapeHtml(item.productModel)}</td>
  <td><span class="badge ${item.isOnline ? 'online' : 'offline'}">${item.isOnline ? '在线' : '离线'}</span></td>
  <td>${escapeHtml(item.lastReportedAt)}</td>
  <td>${item.reverseFlow ? `<span class="danger-value">${escapeHtml(item.reversePhases)} 相</span>` : '无'}</td>
  <td><a href="${escapeHtml(item.href)}">CT 面板</a></td>
</tr>`
  )
  .join('')}
</tbody></table></section>`
}

function renderDevice(vm: OfflineDeviceViewModel) {
  const inverterCards = vm.inverters
    .map((inv) => {
      const clickable = (label: string, value: string, series: unknown, title: string) =>
        `<div class="inverter-metric"><span class="label">${escapeHtml(label)}</span><button type="button" data-open-series='${seriesAttr(series)}' data-dialog-title="${escapeHtml(title)}">${escapeHtml(value)}</button></div>`
      return `<article class="inverter-card ${escapeHtml(inv.statusVariant)}" data-testid="inverter-card-${inv.index}">
  <div class="inverter-head">
    <div>
      <h3><span class="status-lamp ${inv.statusVariant === 'online' ? 'on' : 'off'}"></span>${escapeHtml(inv.title)}</h3>
      <p class="muted">SN：${escapeHtml(inv.sn)}</p>
    </div>
    <span class="badge ${escapeHtml(inv.statusVariant)}">${escapeHtml(inv.statusLabel)}</span>
  </div>
  ${clickable('发电总功率', inv.power, inv.charts.power.filter((s) => s.key === 'power'), `微逆 ${inv.index} 发电总功率`)}
  ${clickable('PV1', inv.pv1, inv.charts.power.filter((s) => s.key === 'pv1'), `微逆 ${inv.index} PV1`)}
  ${clickable('PV2', inv.pv2, inv.charts.power.filter((s) => s.key === 'pv2'), `微逆 ${inv.index} PV2`)}
  ${clickable('今日发电量', inv.todayEnergy, inv.charts.energy, `微逆 ${inv.index} 今日发电量`)}
  <div class="inverter-metric"><span class="label">累计发电量</span><strong>${escapeHtml(inv.totalEnergy)}</strong></div>
  <div class="inverter-metric"><span class="label">今日发电时长</span><strong>${escapeHtml(inv.todayDuration)}</strong></div>
  ${clickable('内部温度', inv.temperature, inv.charts.temperature, `微逆 ${inv.index} 内部温度`)}
  ${clickable('丢包率', inv.packetLoss, inv.charts.packetLoss, `微逆 ${inv.index} 丢包率`)}
  <div class="inverter-metric"><span class="label">防逆流开关</span><strong>${escapeHtml(inv.antiReverse)}</strong></div>
  <div class="inverter-metric"><span class="label">发电开关</span><strong>${escapeHtml(inv.generationEnabled)}</strong></div>
  <div class="inverter-metric"><span class="label">工作状态</span><strong>${escapeHtml(inv.workState)}</strong></div>
  <div class="inverter-metric"><span class="label">当前是否发电</span><strong>${escapeHtml(inv.generating)}</strong></div>
  <div class="inverter-metric"><span class="label">软件版本</span><strong>${escapeHtml(inv.softwareVersion)}</strong></div>
  <div class="inverter-metric"><span class="label">最新故障</span><strong>${escapeHtml(inv.latestFault)}</strong></div>
  <div class="inverter-metric"><span class="label">故障码</span><strong>${escapeHtml(inv.faultHex)}</strong></div>
  ${inv.detailHref ? `<p><a href="${escapeHtml(inv.detailHref)}">打开微逆详情</a></p>` : ''}
</article>`
    })
    .join('')

  return `${vm.overviewHref ? `<p><a href="${escapeHtml(vm.overviewHref)}">← 返回总览</a></p>` : ''}
<header class="page-header"><div><p class="eyebrow">CT 防逆流设备运行</p>
<form class="device-switcher" data-device-switcher>
  <label for="device-sn-select">设备 SN</label>
  <select id="device-sn-select" data-device-select aria-label="选择设备">
    ${vm.deviceOptions
      .map(
        (item) =>
          `<option value="${escapeHtml(item.sn)}" data-href="${escapeHtml(item.href)}" ${item.sn === vm.deviceSn ? 'selected' : ''}>${escapeHtml(item.sn)}</option>`
      )
      .join('')}
  </select>
</form>
<p class="muted">最近 ${vm.days} 天离线快照 · 时区 ${escapeHtml(vm.timezone)}</p></div>
<div><span class="readonly-badge">数据来源：${escapeHtml(vm.sourceLabel)}</span><p class="muted">最后上报：${escapeHtml(vm.lastReportedAt)}</p></div></header>

<section class="panel ct-overview-panel"><div class="panel-heading"><div><h2>CT 当前状态</h2></div><span class="badge ${vm.ctOnline ? 'online' : 'offline'}">${vm.ctOnline ? 'CT 在线' : 'CT 离线'}</span></div>
${vm.isLastKnown ? `<p class="muted">当前离线，以下为最后已知值。</p>` : ''}
<ul class="status-list status-list-compact">
  <li>软件版本号<br/><strong>${escapeHtml(vm.softwareVersion)}</strong></li>
  <li>SubG 版本号<br/><strong>${escapeHtml(vm.sub1gVersion)}</strong></li>
  <li>Sub1G 状态<br/><strong>${escapeHtml(vm.sub1gState)}</strong></li>
  <li>运行状态<br/><strong>${escapeHtml(vm.ctState)}</strong></li>
  <li>工作模式<br/><strong>${escapeHtml(vm.workMode)}</strong></li>
</ul>
<div class="card-grid power-hero-grid overview-inner-grid">
  ${metricCard('当前家庭负载功率', vm.loadPower, 'is-hero')}
  ${metricCard('当前电网功率', vm.gridPower, 'is-hero')}
  ${metricCard('微逆发电总功率', vm.inverterTotalPower, 'is-hero')}
</div>
<div class="card-grid energy-secondary-grid overview-inner-grid">
  ${metricCard('今日发电量', vm.todayEnergy)}
  ${metricCard('今日发电时长', vm.todayDuration)}
  ${metricCard('累计发电量', vm.totalEnergy)}
</div>
</section>

<section class="reverse-safety-panel panel ${vm.reverseNow ? 'is-danger' : ''}" data-testid="reverse-safety-panel">
  <div class="panel-heading"><div><h2>${escapeHtml(vm.reverseHeading)}</h2><p>${vm.reverseNow ? `当前逆流相：${escapeHtml(vm.reversePhases.join('、'))} 相` : 'A、B、C 三相当前均未检测到反送电网。'}</p></div>
  <span class="reverse-status-banner ${vm.reverseNow ? 'is-danger' : 'is-safe'}">${escapeHtml(vm.reverseBadge)}</span></div>
  <p class="${vm.reverseNow ? 'active-alert' : 'muted'}">${escapeHtml(vm.activeAlertText)}</p>
  <div class="phase-grid">${vm.phases
    .map(
      (phase) => `<button type="button" class="phase-card ${phase.reverse ? 'danger' : ''}" data-open-series='${seriesAttr(phase.series)}' data-dialog-title="${escapeHtml(phase.phase)} 相 CT 有功功率历史">
    <span class="phase-label">${escapeHtml(phase.phase)} 相 CT 有功功率</span>
    <strong class="phase-value">${escapeHtml(phase.powerText)}</strong>
    <span class="phase-hint">${phase.reverse ? '正在反送电网' : '当前相功率正常'}；最近告警：${escapeHtml(phase.lastAlarmAt)}</span>
  </button>`
    )
    .join('')}</div>
  <h3>最近逆流告警记录</h3>${reverseAlertList(vm.reverseAlerts, '最近窗口没有检测到三相 CT 负功率。')}
</section>

${chartPanel({ title: '功率总览（W）', seriesKey: 'powerSeries', initialKeys: ['load', 'grid', 'generation'], advancedKeys: ['ct-a', 'ct-b', 'ct-c', 'inv-a', 'inv-b', 'inv-c'], height: 510 })}

<section class="panel"><div class="panel-heading"><div><h2>微型逆变器 1～8</h2><p class="muted">固定 8 通道；缺失显示 —</p></div></div>
<div class="inverter-grid">${inverterCards}</div></section>

${chartPanel({ title: '电网电压与频率（V / Hz）', seriesKey: 'gridSeries', height: 360 })}

<section class="panel ct-presence-panel"><h2>CT 本体上下线与离线时长</h2><div class="presence-columns"><div><h3>上线时间</h3>${recordList(vm.platformOnlineEvents, '当前窗口没有上线记录。')}</div><div><h3>下线时间</h3>${recordList(vm.platformOfflineEvents, '当前窗口没有下线记录。')}</div><div><h3>持续离线时间</h3>${recordList(vm.platformOfflineWindows, '当前窗口没有离线区间。')}</div></div></section>`
}

function renderInverter(vm: OfflineInverterViewModel) {
  return `<p><a href="${escapeHtml(vm.deviceHref)}">← 返回 CT ${escapeHtml(vm.deviceSn)}</a></p>
<header class="page-header"><div><p class="eyebrow">微型逆变器详情</p><h1>${escapeHtml(vm.title)}</h1>
<p class="muted">SN：${escapeHtml(vm.inverterSn)} · ${escapeHtml(vm.softwareVersion)} · ${escapeHtml(vm.sub1gVersion)}</p></div>
<span class="readonly-badge">数据来源：${escapeHtml(vm.sourceLabel)}</span></header>
<section class="card-grid">${metricCard('发电总功率', vm.power)}${metricCard('PV1', vm.pv1)}${metricCard('PV2', vm.pv2)}</section>
<section class="card-grid">${metricCard('今日发电量', vm.todayEnergy)}${metricCard('累计发电量', vm.totalEnergy)}${metricCard('今日发电时长', vm.todayDuration)}</section>
<section class="panel"><ul class="status-list">
<li>在线状态<br/><strong><span class="badge ${escapeHtml(vm.statusVariant)}">${escapeHtml(vm.statusLabel)}</span></strong></li>
<li>工作状态<br/><strong>${escapeHtml(vm.workState)}</strong></li>
<li>当前是否发电<br/><strong>${escapeHtml(vm.generating)}</strong></li>
<li>内部温度<br/><strong>${escapeHtml(vm.temperature)}</strong></li>
<li>丢包率<br/><strong>${escapeHtml(vm.packetLoss)}</strong></li>
<li>所在相<br/><strong>${escapeHtml(vm.phase)}</strong></li>
<li>接入点<br/><strong>${escapeHtml(vm.connectionPoint)}</strong></li>
<li>防逆流开关<br/><strong>${escapeHtml(vm.antiReverse)}</strong></li>
<li>发电开关<br/><strong>${escapeHtml(vm.generationEnabled)}</strong></li>
<li>功率限制<br/><strong>${escapeHtml(vm.powerLimit)}</strong></li>
<li>最新故障<br/><strong>${escapeHtml(vm.latestFault)}</strong></li>
<li>故障码<br/><strong>${escapeHtml(vm.faultHex)}</strong></li>
</ul></section>
${chartPanel({ title: '功率曲线（W）', seriesKey: 'charts.power', height: 420 })}
${chartPanel({ title: '内部温度（°C）', seriesKey: 'charts.temperature', height: 360 })}
${chartPanel({ title: '今日发电量（kWh）', seriesKey: 'charts.energy', height: 360 })}
${chartPanel({ title: '丢包率（%）', seriesKey: 'charts.packetLoss', height: 360 })}
<section class="panel"><h3>故障变化</h3>${recordList(vm.faultChanges, '无故障变化记录。')}<h3>离线区间</h3>${recordList(vm.offlineWindows, '无离线区间。')}</section>`
}

function pageBody(vm: OfflinePageViewModel) {
  if (vm.kind === 'overview') return renderOverview(vm)
  if (vm.kind === 'inverter') return renderInverter(vm)
  return renderDevice(vm)
}

export function renderOfflineHtmlDocument(options: {
  vm: OfflinePageViewModel
  echartsSource: string
  embedEcharts: boolean
  echartsSrc?: string
  title?: string
}): string {
  const title = options.title || (options.vm.kind === 'overview' ? options.vm.title : options.vm.kind === 'device' ? options.vm.title : options.vm.title)
  const echartsTag = options.embedEcharts
    ? `<script>${options.echartsSource}\n</script>`
    : `<script src="${escapeHtml(options.echartsSrc || './assets/echarts.min.js')}"></script>`

  // For inverter pages, flatten nested charts onto vm for runtime series keys
  const runtimeVm =
    options.vm.kind === 'inverter'
      ? {
          ...options.vm,
          'charts.power': options.vm.charts.power,
          'charts.temperature': options.vm.charts.temperature,
          'charts.energy': options.vm.charts.energy,
          'charts.packetLoss': options.vm.charts.packetLoss
        }
      : options.vm

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
<style>${offlineStyles()}</style>
</head>
<body>
<main>
${pageBody(options.vm)}
</main>
<script>window.__OFFLINE_VM__ = ${JSON.stringify(runtimeVm).replace(/</g, '\\u003c')};</script>
${echartsTag}
<script>${clientRuntimeSource()}</script>
</body>
</html>`
}
