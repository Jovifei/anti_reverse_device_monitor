import { ReadOnlySourceAdapter } from './source-adapter'
import type { NormalizedMetricRecord } from './types'

export interface SourceDbConfig {
  readonly databaseUrl: string
  readonly enabled: boolean
}

export class SourceDbReadOnlyAdapter extends ReadOnlySourceAdapter {
  constructor(private readonly _config: SourceDbConfig) {
    super()
  }

  async read(): Promise<NormalizedMetricRecord[]> {
    if (!this._config.enabled) {
      return []
    }

    throw new Error(
      'Source DB adapter is prepared as a placeholder and requires approved read-only implementation details.'
    )
  }
}
