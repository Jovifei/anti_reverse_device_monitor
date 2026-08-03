import { describe, expect, it } from 'vitest'
import { withSqliteClientParams } from '@/src/lib/sqlite-url'

describe('withSqliteClientParams', () => {
  it('adds Prisma socket_timeout (seconds) and connection_limit for plain file URLs', () => {
    expect(withSqliteClientParams('file:../data/device-monitor.db')).toBe(
      'file:../data/device-monitor.db?socket_timeout=5&connection_limit=1'
    )
  })

  it('appends with & when a query string already exists', () => {
    expect(withSqliteClientParams('file:../data/device-monitor.db?foo=1')).toBe(
      'file:../data/device-monitor.db?foo=1&socket_timeout=5&connection_limit=1'
    )
  })

  it('does not duplicate params already present', () => {
    expect(withSqliteClientParams('file:./x.db?socket_timeout=10&connection_limit=1')).toBe(
      'file:./x.db?socket_timeout=10&connection_limit=1'
    )
  })

  it('leaves non-file URLs alone', () => {
    expect(withSqliteClientParams('postgresql://localhost/db')).toBe('postgresql://localhost/db')
  })

  it('treats legacy busy_timeout as insufficient and still adds socket_timeout', () => {
    expect(withSqliteClientParams('file:./x.db?busy_timeout=5000')).toBe(
      'file:./x.db?busy_timeout=5000&socket_timeout=5&connection_limit=1'
    )
  })
})
