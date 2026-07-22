import { describe, expect, it } from 'vitest'
import { compareSourceCursor, MockSourceAdapter } from '@/src/adapters/source-db/mock-source-adapter'
import { validateSourceFieldMapping } from '@/src/adapters/source-db/field-mapping'
import { redactSourceError } from '@/src/adapters/source-db/security'
describe('source-db contract', () => {
  it('uses reported time and record ID for stable pagination', async () => {
    const time = new Date('2026-07-21T00:00:00.000Z'); const adapter = new MockSourceAdapter([{ sourceRecordId: 'b', deviceSn: 'GC2001000000252', siid: '2', piid: '9', inverterIndex: null, reportedAt: time, receivedAt: time, value: 2 }, { sourceRecordId: 'a', deviceSn: 'GC2001000000252', siid: '2', piid: '9', inverterIndex: null, reportedAt: time, receivedAt: time, value: 1 }])
    const first = await adapter.fetchTelemetry({ from: new Date('2026-07-20T00:00:00.000Z'), to: new Date('2026-07-22T00:00:00.000Z'), limit: 1 }); const second = await adapter.fetchTelemetry({ cursor: first.nextCursor, from: new Date('2026-07-20T00:00:00.000Z'), to: new Date('2026-07-22T00:00:00.000Z'), limit: 1 })
    expect(first.records[0].sourceRecordId).toBe('a'); expect(second.records[0].sourceRecordId).toBe('b'); expect(compareSourceCursor({ reportedAt: time.toISOString(), sourceRecordId: 'a' }, { reportedAt: time.toISOString(), sourceRecordId: 'b' })).toBeLessThan(0)
  })
  it('redacts credentials and validates the checked-in mapping template', () => { const value = ['not', '-a', '-credential'].join(''); expect(redactSourceError(new Error(`postgres://reader:${value}@host/db`)).message).not.toContain(value); expect(validateSourceFieldMapping().valid).toBe(true) })
})
