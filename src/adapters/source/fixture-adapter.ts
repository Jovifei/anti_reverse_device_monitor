import { z } from 'zod'
import { ReadOnlySourceAdapter } from './source-adapter'
import type { NormalizedMetricRecord } from './types'

const fixtureSchema = z.object({
  deviceSn: z.string(),
  siid: z.union([z.number(), z.string()]).transform(String),
  piid: z.union([z.number(), z.string()]).transform(String),
  inverterIndex: z.union([z.number().int().min(1).max(8), z.null()]).optional(),
  inverterSn: z.string().nullable().optional(),
  reportedAt: z.string().or(z.date()).transform((value) =>
    value instanceof Date ? value : new Date(value)
  ),
  metricKey: z.string(),
  value: z.union([z.number(), z.string(), z.null()]),
  valueText: z.string().nullable().optional(),
  sourceRecordId: z.string()
})

export class FixtureAdapter extends ReadOnlySourceAdapter {
  constructor(private records: unknown[]) {
    super()
  }

  async read(): Promise<NormalizedMetricRecord[]> {
    return this.records.map((raw) => {
      const parsed = fixtureSchema.parse(raw)
      return {
        deviceSn: parsed.deviceSn,
        siid: String(parsed.siid),
        piid: String(parsed.piid),
        inverterIndex: parsed.inverterIndex ?? null,
        inverterSn: parsed.inverterSn ?? null,
        reportedAt: parsed.reportedAt,
        metricKey: parsed.metricKey,
        value: parsed.value,
        valueText: parsed.valueText ?? null,
        sourceRecordId: parsed.sourceRecordId
      }
    })
  }
}
