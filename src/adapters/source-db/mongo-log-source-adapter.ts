import { MongoClient, type Collection, type Db, type Document } from 'mongodb'
import { loadLocalEnvironment } from '@/src/adapters/source-db/config'
import {
  collectionForEntry,
  loadDeviceRegistry,
  resolveDeviceSn,
  type DeviceRegistryEntry
} from '@/src/adapters/source-db/device-registry'
import { expandDeviceLogDocument, type DeviceLogDocument } from '@/src/adapters/source-db/expand-device-log'
import { expandIotEventLogDocument, type IotEventLogDocument } from '@/src/adapters/source-db/expand-iot-event-log'
import { loadMongoFieldMapping } from '@/src/adapters/source-db/mongo-field-mapping'
import { resolveMongoCollectionName, resolveMongoProductId } from '@/src/adapters/source-db/mongo-defaults'
import { redactSourceError } from '@/src/adapters/source-db/security'
import { shardTimeRange } from '@/src/adapters/source-db/time-shards'
import type {
  DeviceQuery,
  SourceCursor,
  SourceDevice,
  SourceDeviceProperties,
  SourceHealthResult,
  SourceInverterProperties,
  SourceTelemetryAdapter,
  SourceTelemetryBatch,
  SourceTelemetryRecord
} from '@/src/adapters/source-db/types'

export type MongoLogSourceConfig = {
  enabled: boolean
  sourceName: string
  queryTimeoutMs: number
  uri: string
  database: string
  productId?: string
  collection?: string
  directConnection: boolean
  authMechanism: string
  deviceIdFilter?: string
  root?: string
}

const DEFAULT_TIME_SHARD_MS = 6 * 60 * 60 * 1000

function readEnvConfig(root?: string): MongoLogSourceConfig {
  loadLocalEnvironment(root)
  return {
    enabled: process.env.SOURCE_DB_ENABLED === 'true',
    sourceName: process.env.SOURCE_DB_VIEW?.trim() || 'mongo-device-log',
    queryTimeoutMs: Math.max(1_000, Number(process.env.SOURCE_QUERY_TIMEOUT_SECONDS || 15) * 1000 || 15_000),
    uri: process.env.MONGODB_URI?.trim() ?? '',
    database: process.env.MONGODB_DATABASE?.trim() ?? '',
    productId: resolveMongoProductId(process.env.MONGODB_PRODUCT_ID),
    collection: resolveMongoCollectionName({
      collection: process.env.MONGODB_COLLECTION,
      productId: process.env.MONGODB_PRODUCT_ID
    }),
    directConnection: process.env.MONGODB_DIRECT_CONNECTION !== 'false',
    authMechanism: process.env.MONGODB_AUTH_MECHANISM?.trim() || 'SCRAM-SHA-1',
    deviceIdFilter: process.env.MONGODB_DEVICE_ID?.trim() || undefined,
    root
  }
}

function assertConnectionConfig(config: MongoLogSourceConfig) {
  if (!config.uri || config.uri.includes('<PASSWORD>')) {
    throw new Error('MONGODB_URI must be set locally without a password placeholder.')
  }
  if (!config.database) throw new Error('MONGODB_DATABASE is required for the Mongo log source adapter.')
}

function buildUri(config: MongoLogSourceConfig): string {
  const uri = new URL(config.uri)
  if (config.directConnection) uri.searchParams.set('directConnection', 'true')
  if (config.authMechanism) uri.searchParams.set('authMechanism', config.authMechanism)
  if (!uri.searchParams.get('authSource') && process.env.MONGODB_AUTH_SOURCE?.trim()) {
    uri.searchParams.set('authSource', process.env.MONGODB_AUTH_SOURCE.trim())
  }
  return uri.toString()
}

function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000)
}

function iotEventLogCollectionName(entry: DeviceRegistryEntry, fallbackProductId?: string): string | null {
  if (entry.collection?.trim().startsWith('device_log_')) {
    return entry.collection.trim().replace(/^device_log_/, 'iot_event_log_')
  }
  const productId = entry.product_id?.trim() || fallbackProductId?.trim()
  return productId ? `iot_event_log_${productId}` : null
}

export class MongoLogSourceAdapter implements SourceTelemetryAdapter {
  private client: MongoClient | null = null
  private readonly config: MongoLogSourceConfig

  constructor(config: Partial<MongoLogSourceConfig> = {}) {
    this.config = { ...readEnvConfig(config.root), ...config }
  }

  async healthCheck(): Promise<SourceHealthResult> {
    const checkedAt = new Date()
    if (!this.config.enabled) {
      return { healthy: false, source: this.config.sourceName, detail: 'source adapter disabled', checkedAt, errorCode: 'SOURCE_ADAPTER_DISABLED' }
    }
    const started = Date.now()
    try {
      const db = await this.db()
      await db.command({ ping: 1, maxTimeMS: this.config.queryTimeoutMs })
      return {
        healthy: true,
        source: this.config.sourceName,
        detail: 'mongo ping ok (read-only)',
        checkedAt,
        queryDurationMs: Date.now() - started
      }
    } catch (error) {
      const safe = redactSourceError(error)
      return { healthy: false, source: this.config.sourceName, detail: safe.message, checkedAt, errorCode: safe.code, queryDurationMs: Date.now() - started }
    }
  }

  async fetchDevices(params: DeviceQuery): Promise<SourceDevice[]> {
    const { registry } = loadDeviceRegistry(this.config.root)
    const entries = this.filterEntries(registry.devices)
    const start = params.cursor ? Number(params.cursor) || 0 : 0
    return entries.slice(start, start + params.limit).map((entry) => ({
      sourceRecordId: entry.device_id,
      deviceSn: resolveDeviceSn(entry),
      reportedAt: undefined,
      receivedAt: undefined
    }))
  }

  async fetchTelemetry(params: {
    cursor?: SourceCursor
    from: Date
    to: Date
    limit: number
  }): Promise<SourceTelemetryBatch> {
    if (!this.config.enabled) {
      return { records: [], hasMore: false }
    }
    const started = Date.now()
    const { registry } = loadDeviceRegistry(this.config.root)
    const { mapping } = loadMongoFieldMapping(this.config.root)
    const entries = this.filterEntries(registry.devices)
    if (!entries.length) {
      return { records: [], hasMore: false, queryDurationMs: Date.now() - started }
    }

    const snByDeviceId = new Map(entries.map((entry) => [entry.device_id, resolveDeviceSn(entry)]))
    const byCollection = new Map<string, string[]>()
    const byIotCollection = new Map<string, string[]>()
    for (const entry of entries) {
      const collection = collectionForEntry(entry, this.config.productId) || this.config.collection
      if (!collection) {
        throw new Error(`Device ${entry.device_id} is missing collection/product_id and MONGODB_COLLECTION is unset.`)
      }
      const list = byCollection.get(collection) ?? []
      list.push(entry.device_id)
      byCollection.set(collection, list)

      const iotCollection = iotEventLogCollectionName(entry, this.config.productId)
      if (iotCollection) {
        const iotList = byIotCollection.get(iotCollection) ?? []
        iotList.push(entry.device_id)
        byIotCollection.set(iotCollection, iotList)
      }
    }

    const cursorTime = params.cursor ? Date.parse(params.cursor.reportedAt) : Number.NaN
    const effectiveTo = Number.isFinite(cursorTime) ? new Date(Math.min(params.to.getTime(), cursorTime)) : params.to
    const windows = shardTimeRange(params.from, effectiveTo, DEFAULT_TIME_SHARD_MS)
    const records: SourceTelemetryRecord[] = []
    let lastCursor: SourceCursor | undefined
    const db = await this.db()

    // Pull event-only WiFi first so a full device_log page cannot starve P_0_0.
    for (const [collectionName, deviceIds] of byIotCollection) {
      const collection = db.collection<Document>(collectionName)
      for (const window of windows) {
        const page = await this.queryIotWifiWindow({
          collection,
          deviceIds,
          from: window.from,
          to: window.to,
          limit: Math.max(50, Math.min(200, params.limit)),
          snByDeviceId,
          mapping,
          cursor: params.cursor
        })
        records.push(...page.records)
        if (page.nextCursor) lastCursor = page.nextCursor
      }
    }

    for (const [collectionName, deviceIds] of byCollection) {
      const collection = db.collection<Document>(collectionName)
      for (const window of windows) {
        if (records.length >= params.limit) break
        const page = await this.queryWindow({
          collection,
          deviceIds,
          from: window.from,
          to: window.to,
          limit: params.limit - records.length,
          snByDeviceId,
          mapping,
          cursor: params.cursor
        })
        records.push(...page.records)
        if (page.nextCursor) lastCursor = page.nextCursor
      }
    }

    records.sort((left, right) => right.reportedAt.getTime() - left.reportedAt.getTime() || left.sourceRecordId.localeCompare(right.sourceRecordId))
    const trimmed = records.slice(0, params.limit)
    const hasMore = records.length > params.limit || Boolean(lastCursor && trimmed.length === params.limit)
    const nextCursor =
      trimmed.length > 0
        ? {
            reportedAt: trimmed[trimmed.length - 1].reportedAt.toISOString(),
            sourceRecordId: trimmed[trimmed.length - 1].sourceRecordId
          }
        : lastCursor

    return { records: trimmed, nextCursor: hasMore ? nextCursor : undefined, hasMore, queryDurationMs: Date.now() - started }
  }

  async fetchDeviceProperties(sn: string): Promise<SourceDeviceProperties> {
    const { registry } = loadDeviceRegistry(this.config.root)
    const entry = registry.devices.find((item) => resolveDeviceSn(item) === sn)
    return {
      deviceSn: sn,
      properties: {
        device_id: entry?.device_id ?? null,
        product_id: entry?.product_id ?? null,
        label: entry?.label ?? null
      }
    }
  }

  async fetchInverterProperties(sn: string, inverterIndex: number): Promise<SourceInverterProperties> {
    return { deviceSn: sn, inverterIndex, properties: {} }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close().catch(() => undefined)
      this.client = null
    }
  }

  private filterEntries(entries: DeviceRegistryEntry[]): DeviceRegistryEntry[] {
    const filter = this.config.deviceIdFilter
    if (!filter) return entries
    return entries.filter((entry) => entry.device_id === filter)
  }

  private async db(): Promise<Db> {
    if (!this.client) {
      assertConnectionConfig(this.config)
      this.client = new MongoClient(buildUri(this.config), {
        serverSelectionTimeoutMS: this.config.queryTimeoutMs,
        connectTimeoutMS: this.config.queryTimeoutMs,
        socketTimeoutMS: this.config.queryTimeoutMs,
        maxPoolSize: 2
      })
      await this.client.connect()
    }
    return this.client.db(this.config.database)
  }

  private async queryWindow(params: {
    collection: Collection<Document>
    deviceIds: string[]
    from: Date
    to: Date
    limit: number
    snByDeviceId: Map<string, string>
    mapping: ReturnType<typeof loadMongoFieldMapping>['mapping']
    cursor?: SourceCursor
  }): Promise<SourceTelemetryBatch> {
    if (params.limit <= 0 || params.deviceIds.length === 0) return { records: [], hasMore: false }

    const fromSec = toUnixSeconds(params.from)
    const toSec = toUnixSeconds(params.to)
    const filter: Document = {
      device_id: params.deviceIds.length === 1 ? params.deviceIds[0] : { $in: params.deviceIds },
      time: { $gte: fromSec, $lte: toSec }
    }

    // Read-only find; never insert/update/delete/createIndex.
    const docs = await params.collection
      .find(filter, {
        projection: { device_id: 1, time: 1, data: 1 },
        sort: { time: -1 },
        limit: Math.min(Math.max(params.limit, 1), 500),
        maxTimeMS: this.config.queryTimeoutMs
      })
      .toArray()

    const records: SourceTelemetryRecord[] = []
    for (const doc of docs) {
      const deviceId = typeof doc.device_id === 'string' ? doc.device_id : ''
      const deviceSn = params.snByDeviceId.get(deviceId)
      if (!deviceSn) continue
      const expanded = expandDeviceLogDocument({
        document: doc as DeviceLogDocument,
        deviceSn,
        mapping: params.mapping
      })
      for (const row of expanded) {
        if (params.cursor && row.reportedAt.toISOString() === params.cursor.reportedAt && row.sourceRecordId >= params.cursor.sourceRecordId) {
          continue
        }
        records.push(row)
        if (records.length >= params.limit) break
      }
      if (records.length >= params.limit) break
    }

    const nextCursor =
      records.length > 0
        ? { reportedAt: records[records.length - 1].reportedAt.toISOString(), sourceRecordId: records[records.length - 1].sourceRecordId }
        : undefined
    return { records, nextCursor, hasMore: docs.length > 0 && records.length >= params.limit }
  }

  /** Event-only WiFi RSSI (`P_0_0`) from iot_event_log_<productId>. */
  private async queryIotWifiWindow(params: {
    collection: Collection<Document>
    deviceIds: string[]
    from: Date
    to: Date
    limit: number
    snByDeviceId: Map<string, string>
    mapping: ReturnType<typeof loadMongoFieldMapping>['mapping']
    cursor?: SourceCursor
  }): Promise<SourceTelemetryBatch> {
    if (params.limit <= 0 || params.deviceIds.length === 0) return { records: [], hasMore: false }

    const filter: Document = {
      deviceId: params.deviceIds.length === 1 ? params.deviceIds[0] : { $in: params.deviceIds },
      en: 'P_0_0',
      t: { $gte: params.from, $lte: params.to }
    }

    const docs = await params.collection
      .find(filter, {
        projection: { deviceId: 1, sn: 1, et: 1, en: 1, ec: 1, t: 1 },
        sort: { t: -1 },
        limit: Math.min(Math.max(params.limit, 1), 200),
        maxTimeMS: this.config.queryTimeoutMs
      })
      .toArray()

    const records: SourceTelemetryRecord[] = []
    for (const doc of docs) {
      const deviceId = typeof doc.deviceId === 'string' ? doc.deviceId : ''
      const deviceSn = params.snByDeviceId.get(deviceId) || (typeof doc.sn === 'string' ? doc.sn : '')
      if (!deviceSn) continue
      const row = expandIotEventLogDocument({
        document: doc as IotEventLogDocument,
        deviceSn,
        mapping: params.mapping
      })
      if (!row) continue
      if (params.cursor && row.reportedAt.toISOString() === params.cursor.reportedAt && row.sourceRecordId >= params.cursor.sourceRecordId) {
        continue
      }
      records.push(row)
      if (records.length >= params.limit) break
    }

    const nextCursor =
      records.length > 0
        ? { reportedAt: records[records.length - 1].reportedAt.toISOString(), sourceRecordId: records[records.length - 1].sourceRecordId }
        : undefined
    return { records, nextCursor, hasMore: docs.length > 0 && records.length >= params.limit }
  }
}

export { shardTimeRange } from '@/src/adapters/source-db/time-shards'

export function createMongoLogSourceAdapterFromEnv(overrides: Partial<MongoLogSourceConfig> = {}): MongoLogSourceAdapter {
  return new MongoLogSourceAdapter(overrides)
}
