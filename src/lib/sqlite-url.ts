/** Ensure SQLite URLs fail fast under writer lock instead of parking Next request handlers forever. */
export function withSqliteBusyTimeout(databaseUrl: string, busyTimeoutMs = 5_000): string {
  if (!databaseUrl.startsWith('file:')) return databaseUrl
  if (/[?&]busy_timeout=/i.test(databaseUrl)) return databaseUrl
  const separator = databaseUrl.includes('?') ? '&' : '?'
  return `${databaseUrl}${separator}busy_timeout=${busyTimeoutMs}`
}
