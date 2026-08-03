/** Shared display: `online/total` — all green when complete; online green + total red when any offline. */
export function normalizeInverterCounts(online: number, total: number) {
  const safeOnline = Math.max(0, online)
  const safeTotal = Math.max(safeOnline, total)
  return {
    online: safeOnline,
    total: safeTotal,
    offline: Math.max(0, safeTotal - safeOnline),
    allOnline: safeTotal > 0 && safeOnline >= safeTotal
  }
}

export function offlineInverterCount(online: number, total: number) {
  return normalizeInverterCounts(online, total).offline
}

export function formatOnlineInverterCountHtml(online: number, total: number) {
  const counts = normalizeInverterCounts(online, total)
  const onlineClass = counts.allOnline || counts.online > 0 ? 'online-inverter-count-online is-ok' : 'online-inverter-count-online'
  const totalClass = counts.allOnline
    ? 'online-inverter-count-total is-ok'
    : 'online-inverter-count-total is-alert'
  return `<span class="online-inverter-count" title="在线 ${counts.online}，离线 ${counts.offline}（共 ${counts.total}）"><span class="${onlineClass}">${counts.online}</span><span class="online-inverter-count-sep">/</span><span class="${totalClass}">${counts.total}</span></span>`
}
