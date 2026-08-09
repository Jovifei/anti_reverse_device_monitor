import { describe, expect, it } from 'vitest'
import { isAfterSourceCursor } from '@/src/adapters/source-db/mongo-log-source-adapter'

const cursor = {
  reportedAt: '2026-08-08T00:00:00.000Z',
  sourceRecordId: 'aaaaaaaaaaaaaaaaaaaaaaaa:2_4'
}

describe('Mongo source cursor ordering', () => {
  it('keeps older rows and later source ids at the same timestamp', () => {
    expect(isAfterSourceCursor({ reportedAt: new Date('2026-08-07T23:59:59.000Z'), sourceRecordId: 'a' }, cursor)).toBe(true)
    expect(isAfterSourceCursor({ reportedAt: new Date(cursor.reportedAt), sourceRecordId: 'aaaaaaaaaaaaaaaaaaaaaaaa:2_5' }, cursor)).toBe(true)
  })

  it('skips the cursor, earlier source ids, and newer rows', () => {
    expect(isAfterSourceCursor({ reportedAt: new Date(cursor.reportedAt), sourceRecordId: cursor.sourceRecordId }, cursor)).toBe(false)
    expect(isAfterSourceCursor({ reportedAt: new Date(cursor.reportedAt), sourceRecordId: 'aaaaaaaaaaaaaaaaaaaaaaaa:2_3' }, cursor)).toBe(false)
    expect(isAfterSourceCursor({ reportedAt: new Date('2026-08-08T00:00:01.000Z'), sourceRecordId: 'z' }, cursor)).toBe(false)
  })
})
