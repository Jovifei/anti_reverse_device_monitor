import { z } from 'zod'

export const snSchema = z.string().trim().min(6).max(64).regex(/^[A-Za-z0-9_-]+$/)
export const snLookupSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/)

export const deviceListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  q: z.string().trim().min(1).max(64).optional()
})

export const telemetryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
  metric: z.string().trim().min(2).optional(),
  inverterIndex: z.coerce.number().int().min(1).max(8).optional()
})

export function parseSn(value: string | null): string {
  return snSchema.parse(value)
}

export function parseSnLookup(value: string | null): string {
  return snLookupSchema.parse(value)
}

function firstValue(record: unknown, key: string): string | undefined {
  if (!record) {
    return undefined
  }

  if (record instanceof URLSearchParams) {
    return record.get(key) ?? undefined
  }

  if (typeof record === 'object') {
    const bag = record as Record<string, unknown>
    const value = bag[key]

    if (typeof value === 'string') {
      return value
    }

    if (Array.isArray(value)) {
      const first = value[0]
      return typeof first === 'string' ? first : undefined
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }
  }

  return undefined
}

export function toFlatQuery(raw: unknown) {
  return {
    page: firstValue(raw, 'page'),
    pageSize: firstValue(raw, 'pageSize'),
    q: firstValue(raw, 'q'),
    days: firstValue(raw, 'days'),
    metric: firstValue(raw, 'metric'),
    inverterIndex: firstValue(raw, 'inverterIndex')
  }
}

export function parseDeviceListQuery(raw: unknown) {
  const flat = toFlatQuery(raw)
  return deviceListSchema.parse({
    page: flat.page,
    pageSize: flat.pageSize,
    q: flat.q
  })
}

export function parseTelemetryQuery(raw: unknown) {
  const flat = toFlatQuery(raw)
  return telemetryQuerySchema.parse({
    days: flat.days,
    metric: flat.metric,
    inverterIndex: flat.inverterIndex
  })
}
