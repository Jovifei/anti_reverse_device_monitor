import type { SourceAdapter, NormalizedMetricRecord } from './types'

export abstract class ReadOnlySourceAdapter implements SourceAdapter {
  abstract read(): Promise<NormalizedMetricRecord[]>

  protected parseDate(value: string): Date {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid datetime: ${value}`)
    }

    return parsed
  }
}
