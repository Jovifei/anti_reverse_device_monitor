/** Fleet table: CT offline → mark snapshot cells as last-known (visual only). */
export function fleetLastKnownClass(isOnline: boolean) {
  return isOnline ? '' : 'is-last-known'
}

/** Tooltip for last-known cells; keeps optional extra hint (e.g. 在线但是未发电). */
export function fleetLastKnownTitle(isOnline: boolean, extra?: string) {
  if (isOnline) return extra
  return extra ? `最后已知值 · ${extra}` : '最后已知值'
}
