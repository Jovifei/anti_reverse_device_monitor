import type { DeviceQuery, SourceCursor, SourceDevice, SourceDeviceProperties, SourceHealthResult, SourceInverterProperties, SourceTelemetryAdapter, SourceTelemetryBatch } from './types'

export interface CompanySourceAdapterConfig { enabled: boolean; queryTimeoutMs: number; sourceName: string; sourceType: string }
export class SourceAdapterUnavailableError extends Error { readonly code = 'SOURCE_ADAPTER_UNAVAILABLE'; constructor(message: string) { super(message); this.name = 'SourceAdapterUnavailableError' } }

/** This template deliberately contains no database driver or SQL until an approved read-only view is supplied. */
export class CompanySourceAdapterStub implements SourceTelemetryAdapter {
  constructor(private readonly config: CompanySourceAdapterConfig) {}
  async healthCheck(): Promise<SourceHealthResult> { return { healthy: false, source: this.config.sourceName, detail: this.config.enabled ? 'approved read-only driver, view and mapping are required' : 'source adapter disabled', checkedAt: new Date(), errorCode: 'SOURCE_ADAPTER_UNAVAILABLE' } }
  async fetchDevices(_: DeviceQuery): Promise<SourceDevice[]> { throw this.unavailable() }
  async fetchTelemetry(_: { cursor?: SourceCursor; from: Date; to: Date; limit: number }): Promise<SourceTelemetryBatch> { throw this.unavailable() }
  async fetchDeviceProperties(_: string): Promise<SourceDeviceProperties> { throw this.unavailable() }
  async fetchInverterProperties(_: string, __: number): Promise<SourceInverterProperties> { throw this.unavailable() }
  async close(): Promise<void> {}
  private unavailable() { return new SourceAdapterUnavailableError(`No read-only adapter is installed for source type '${this.config.sourceType || 'unset'}'.`) }
}
