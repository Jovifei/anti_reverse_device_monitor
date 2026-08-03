import { describe, expect, it } from 'vitest'
import { withSqliteBusyTimeout } from '@/src/lib/sqlite-url'

describe('withSqliteBusyTimeout', () => {
  it('appends busy_timeout for plain sqlite file URLs', () => {
    expect(withSqliteBusyTimeout('file:../data/device-monitor.db')).toBe(
      'file:../data/device-monitor.db?busy_timeout=5000'
    )
  })

  it('appends with & when query string already exists', () => {
    expect(withSqliteBusyTimeout('file:../data/device-monitor.db?connection_limit=1')).toBe(
      'file:../data/device-monitor.db?connection_limit=1&busy_timeout=5000'
    )
  })

  it('leaves existing busy_timeout and non-file URLs alone', () => {
    expect(withSqliteBusyTimeout('file:./x.db?busy_timeout=1000')).toBe('file:./x.db?busy_timeout=1000')
    expect(withSqliteBusyTimeout('postgresql://localhost/db')).toBe('postgresql://localhost/db')
  })
})
