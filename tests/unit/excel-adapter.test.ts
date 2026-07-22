import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { utils, writeFile } from 'xlsx'
import { ExcelSourceAdapter } from '@/src/adapters/source/excel-adapter'

describe('ExcelSourceAdapter', () => {
  it('parses normalized fields and derives a deterministic source ID when absent', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'anti-reverse-excel-'))
    const filePath = path.join(directory, 'telemetry.xlsx')
    const workbook = utils.book_new()
    const sheet = utils.json_to_sheet([{ device_sn: 'GC2001000000252', siid: 2, piid: 9, inverter_index: null, reported_at: '2026-07-21T00:00:00.000Z', metric_key: 'load_power', value: 321 }])
    utils.book_append_sheet(workbook, sheet, 'Telemetry')
    writeFile(workbook, filePath)
    try {
      const adapter = new ExcelSourceAdapter(filePath)
      const [first] = await adapter.read()
      const [second] = await adapter.read()
      expect(first.deviceSn).toBe('GC2001000000252')
      expect(first.siid).toBe('2')
      expect(first.sourceRecordId).toBe(second.sourceRecordId)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
