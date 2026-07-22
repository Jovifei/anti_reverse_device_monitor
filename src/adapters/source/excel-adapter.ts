import fs from 'node:fs'
import path from 'node:path'
import { read, utils, WorkBook } from 'xlsx'
import { ReadOnlySourceAdapter } from './source-adapter'
import { z } from 'zod'
import type { NormalizedMetricRecord } from './types'

const fileRecordSchema = z.object({
  device_sn: z.string(),
  siid: z.union([z.number(), z.string()]).transform(String),
  piid: z.union([z.number(), z.string()]).transform(String),
  inverter_index: z.union([z.number().int().min(1).max(8), z.string(), z.undefined(), z.null()]).transform((value) => {
    if (value === null || value === undefined || value === '') {
      return null
    }
    const parsed = Number(value)
    return Number.isNaN(parsed) ? null : parsed
  }),
  inverter_sn: z.string().nullable().transform((value) => (value && value.trim().length > 0 ? value : null)).optional(),
  reported_at: z.union([z.string(), z.date()]).transform((value) => (value instanceof Date ? value : new Date(value))),
  metric_key: z.string(),
  value: z.union([z.number(), z.string(), z.null()]),
  value_text: z.string().nullable().optional(),
  source_record_id: z.string().optional()
})

function readWorkBook(filePath: string): WorkBook {
  const resolved = path.resolve(process.cwd(), filePath)
  const content = fs.readFileSync(resolved)
  return read(content, { type: 'buffer' })
}

function toRows(workbook: WorkBook): Record<string, unknown>[] {
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('No worksheet found in the Excel file.')
  }

  return utils.sheet_to_json(workbook.Sheets[sheetName], {
    raw: false,
    defval: null
  }) as Record<string, unknown>[]
}

export class ExcelSourceAdapter extends ReadOnlySourceAdapter {
  constructor(private filePath: string) {
    super()
  }

  async read(): Promise<NormalizedMetricRecord[]> {
    const workbook = readWorkBook(this.filePath)
    const rows = toRows(workbook)

    return rows
      .map((row, idx) => {
        const parsed = fileRecordSchema.parse(row)

        return {
          deviceSn: parsed.device_sn,
          siid: parsed.siid,
          piid: parsed.piid,
          inverterIndex: parsed.inverter_index ?? null,
          inverterSn: parsed.inverter_sn ?? null,
          reportedAt: parsed.reported_at,
          metricKey: parsed.metric_key,
          value: parsed.value,
          valueText: parsed.value_text ?? null,
          sourceRecordId: parsed.source_record_id?.trim() || `${path.resolve(this.filePath)}-${idx}`
        }
      })
  }
}
