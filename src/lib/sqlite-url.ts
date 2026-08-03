/**
 * Prisma SQLite honors `socket_timeout` (seconds) as busy_timeout.
 * Plain `busy_timeout=` in the URL is ignored by Quaint and can leave Next
 * parked forever when source:worker holds a write lock.
 */
export function withSqliteClientParams(
  databaseUrl: string,
  options: { socketTimeoutSeconds?: number; connectionLimit?: number } = {}
): string {
  if (!databaseUrl.startsWith('file:')) return databaseUrl

  const socketTimeoutSeconds = options.socketTimeoutSeconds ?? 5
  const connectionLimit = options.connectionLimit ?? 1
  let url = databaseUrl

  if (!/[?&]socket_timeout=/i.test(url)) {
    url += `${url.includes('?') ? '&' : '?'}socket_timeout=${socketTimeoutSeconds}`
  }
  if (!/[?&]connection_limit=/i.test(url)) {
    url += `${url.includes('?') ? '&' : '?'}connection_limit=${connectionLimit}`
  }

  return url
}

/** @deprecated Use withSqliteClientParams — Prisma ignores busy_timeout URL params. */
export function withSqliteBusyTimeout(databaseUrl: string, busyTimeoutMs = 5_000): string {
  return withSqliteClientParams(databaseUrl, {
    socketTimeoutSeconds: Math.max(1, Math.round(busyTimeoutMs / 1000))
  })
}
