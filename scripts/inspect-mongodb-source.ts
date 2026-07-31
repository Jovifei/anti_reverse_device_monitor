import fs from 'node:fs'
import path from 'node:path'
import { MongoClient, type Collection, type Document, type Filter } from 'mongodb'
import { loadLocalEnvironment } from '@/src/adapters/source-db/config'

const sourceReportPath = path.join(process.cwd(), 'docs', 'MONGODB_SOURCE_INSPECTION_REPORT.md')
const permissionReportPath = path.join(process.cwd(), 'docs', 'MONGODB_PERMISSION_MATRIX.md')
const timeoutMs = 8_000
const countLimit = 100_000
const maxSampleRows = 3
const maxReportSamples = 5
const deviceFieldNames = ['sn', 'SN', 'deviceSn', 'deviceId', 'device_id', 'productId', 'productSN'] as const
const timeFieldNames = ['timestamp', 'time', 'createdAt', 'reportedAt', 'receivedAt', 'reportTime', 'uploadTime'] as const
const modelFieldNames = ['siid', 'piid', 'identifier', 'property', 'value'] as const
const payloadFieldNames = ['topic', 'payload'] as const

type ProbeStatus = 'PASS' | 'FAIL' | 'NOT_TESTED'
type AccessStatus = 'READY_FOR_MAPPING' | 'COLLECTION_SCOPED' | 'PERMISSION_BLOCKED' | 'FAIL'
type Probe<T = undefined> = { status: ProbeStatus; code?: string; errorType?: string; value?: T }
type Matrix = Record<'ping' | 'authentication' | 'connectionStatus' | 'dbStats' | 'listCollections' | 'find' | 'countDocuments' | 'listIndexes', Probe<unknown>>
type FieldSummary = { path: string; types: string[]; array: boolean }
type CollectionSummary = {
  name: string
  count: number | null
  countLabel: string
  earliest: string | null
  latest: string | null
  fields: FieldSummary[]
  deviceCandidates: string[]
  timeCandidates: string[]
  modelCandidates: string[]
  payloadCandidates: string[]
  samples: unknown[]
}

function maskHost(host: string) {
  const labels = host.split('.')
  return labels.length >= 3 ? `${labels[0]}.${labels[1].slice(0, 2)}***.${labels.at(-1)}` : `${host.slice(0, 2)}***`
}

function maskIdentifier(value: unknown) {
  const text = String(value)
  if (text.length <= 6) return '***'
  return `${text.slice(0, 2)}***${text.slice(-4)}`
}

function isSensitiveKey(key: string) {
  return /(password|passwd|pwd|token|secret|authorization|cookie|mac|user|email|phone|owner|address|account|ip)/i.test(key)
}

function isIdentifierKey(key: string) {
  return /(^sn$|devicesn|device[_-]?id|product[_-]?id|productsn|serial)/i.test(key)
}

function isTelemetryKey(key: string) {
  return /^(siid|piid|property|identifier|value|time|timestamp|createdat|reportedat|receivedat|reporttime|uploadtime)$/i.test(key)
}

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (value instanceof Date) return 'Date'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  return typeof value
}

function sanitizeSample(value: unknown, key = '', depth = 0): unknown {
  if (isSensitiveKey(key)) return '[removed]'
  if (isIdentifierKey(key)) return maskIdentifier(value)
  if (/topic/i.test(key)) return '[mqtt-topic-redacted]'
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return isTelemetryKey(key) ? `[string:${value.length}]` : '[redacted-string]'
  if (Array.isArray(value)) return depth >= 2 ? `[array:${value.length}]` : value.slice(0, 3).map((item) => sanitizeSample(item, key, depth + 1))
  if (typeof value === 'object') {
    if (depth >= 2) return '[object]'
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [childKey, sanitizeSample(childValue, childKey, depth + 1)]))
  }
  return `[${typeof value}]`
}

function displayTime(value: unknown) {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  return null
}

function safeError(error: unknown): Pick<Probe, 'code' | 'errorType'> {
  const candidate = error as { code?: unknown; name?: unknown }
  return {
    code: typeof candidate?.code === 'number' || typeof candidate?.code === 'string' ? String(candidate.code) : undefined,
    errorType: typeof candidate?.name === 'string' ? candidate.name : 'UnknownError'
  }
}

async function probe<T>(operation: () => Promise<T>): Promise<Probe<T>> {
  try {
    return { status: 'PASS', value: await operation() }
  } catch (error) {
    return { status: 'FAIL', ...safeError(error) }
  }
}

function writeFile(file: string, contents: string) {
  fs.writeFileSync(file, contents, 'utf8')
}

function summarizeFields(documents: Document[]) {
  const fields = new Map<string, { types: Set<string>; array: boolean }>()
  const visit = (value: unknown, currentPath: string, depth: number) => {
    if (!currentPath || depth > 3) return
    const current = fields.get(currentPath) ?? { types: new Set<string>(), array: false }
    current.types.add(typeOf(value))
    current.array ||= Array.isArray(value)
    fields.set(currentPath, current)
    if (Array.isArray(value)) value.slice(0, 3).forEach((item) => visit(item, `${currentPath}[]`, depth + 1))
    if (value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) Object.entries(value as Record<string, unknown>).forEach(([key, child]) => visit(child, `${currentPath}.${key}`, depth + 1))
  }
  documents.forEach((document) => Object.entries(document).filter(([key]) => key !== '_id').forEach(([key, value]) => visit(value, key, 0)))
  return [...fields.entries()].map(([pathName, details]) => ({ path: pathName, types: [...details.types].sort(), array: details.array })).sort((left, right) => left.path.localeCompare(right.path))
}

function fieldCandidates(fields: FieldSummary[], candidates: readonly string[]) {
  return fields.filter((field) => candidates.some((candidate) => field.path === candidate || field.path.endsWith(`.${candidate}`))).map((field) => field.path)
}

function topLevelCandidate(fields: FieldSummary[], candidates: readonly string[]) {
  return fields.find((field) => candidates.includes(field.path as (typeof candidates)[number]) && field.types.some((type) => ['Date', 'number', 'string'].includes(type)))?.path
}

async function inspectCollection(collection: Collection<Document>, name: string, remainingSamples: number): Promise<CollectionSummary> {
  const sampleLimit = Math.min(maxSampleRows, remainingSamples)
  const samples = sampleLimit > 0 ? await collection.find({}, { limit: sampleLimit, sort: { _id: -1 }, maxTimeMS: timeoutMs }).toArray() : []
  const count = await collection.countDocuments({}, { limit: countLimit, maxTimeMS: timeoutMs })
  const fields = summarizeFields(samples)
  const timeField = topLevelCandidate(fields, timeFieldNames)
  const timeProjection = timeField ? { [timeField]: 1 } : undefined
  const earliest = timeField ? await collection.find({}, { projection: timeProjection, limit: 1, sort: { [timeField]: 1 }, maxTimeMS: timeoutMs }).toArray() : []
  const latest = timeField ? await collection.find({}, { projection: timeProjection, limit: 1, sort: { [timeField]: -1 }, maxTimeMS: timeoutMs }).toArray() : []
  return {
    name,
    count,
    countLabel: count >= countLimit ? `at least ${countLimit} (capped countDocuments probe)` : String(count),
    earliest: timeField ? displayTime(earliest[0]?.[timeField]) : null,
    latest: timeField ? displayTime(latest[0]?.[timeField]) : null,
    fields,
    deviceCandidates: fieldCandidates(fields, deviceFieldNames),
    timeCandidates: fieldCandidates(fields, timeFieldNames),
    modelCandidates: fieldCandidates(fields, modelFieldNames),
    payloadCandidates: fieldCandidates(fields, payloadFieldNames),
    samples: samples.map((sample) => sanitizeSample(sample))
  }
}

function renderMatrix(matrix: Matrix) {
  const entries: [keyof Matrix, string][] = [
    ['ping', 'ping'], ['authentication', 'authentication'], ['connectionStatus', 'connectionStatus'], ['dbStats', 'dbStats'], ['listCollections', 'listCollections'], ['find', 'find'], ['countDocuments', 'countDocuments'], ['listIndexes', 'listIndexes']
  ]
  return entries.map(([key, label]) => {
    const result = matrix[key]
    return `| ${label} | ${result.status} | ${result.code ?? '—'} | ${result.errorType ?? '—'} |`
  }).join('\n')
}

function renderPermissionReport(config: { host: string; port: string; database: string; authSource: string; authMechanism: string; directConnection: boolean; usernameLoaded: boolean }, matrix: Matrix, status: AccessStatus, collectionName?: string) {
  const required = status === 'PERMISSION_BLOCKED' ? '1. Grant the authenticated account the approved read role on `log`, including `listCollections`, `dbStats`, and `find`; or\n2. Provide `MONGODB_COLLECTION` locally with an administrator-confirmed collection name and collection-level `find` permission.' : 'No additional access request is required for this probe state.'
  return `# MongoDB permission matrix\n\nMONGODB_SOURCE_ACCESS_STATUS: ${status}\n\n## Redacted connection parameters\n\n- Host: ${config.host}\n- Port: ${config.port}\n- Database: ${config.database}\n- authSource: ${config.authSource}\n- authMechanism: ${config.authMechanism}\n- directConnection: ${config.directConnection}\n- Username loaded: ${config.usernameLoaded ? 'yes' : 'no'}\n- Password output: prohibited\n\n## Permission matrix\n\n| Command | Result | MongoDB error code | Error type |\n|---|---|---|---|\n${renderMatrix(matrix)}\n\n## Collection scope\n\n- Administrator-confirmed local collection: ${collectionName ? 'configured' : 'not configured'}\n\n## Required administrator action\n\n${required}\n\nNo write command, business-data field inference outside an authorized collection, password, full URI, Token, raw document, or device identifier was written to this report.\n`
}

function renderSourceReport(status: AccessStatus, config: { host: string; port: string; database: string; authSource: string; authMechanism: string; directConnection: boolean }, summaries: CollectionSummary[]) {
  const collectionDetails = summaries.map((summary) => `### ${summary.name}\n\n- Document count estimate: ${summary.countLabel}\n- Earliest/latest time: ${summary.earliest ?? 'UNKNOWN'} / ${summary.latest ?? 'UNKNOWN'}\n- Device identifier candidates: ${summary.deviceCandidates.length ? `${summary.deviceCandidates.join(', ')} (CONFIRMED presence; semantic LIKELY)` : 'UNKNOWN'}\n- Time candidates: ${summary.timeCandidates.length ? `${summary.timeCandidates.join(', ')} (CONFIRMED presence; semantic LIKELY)` : 'UNKNOWN'}\n- SIID/PIID/value candidates: ${summary.modelCandidates.length ? `${summary.modelCandidates.join(', ')} (CONFIRMED presence; semantic LIKELY)` : 'UNKNOWN'}\n- MQTT topic/payload fields: ${summary.payloadCandidates.length ? `${summary.payloadCandidates.join(', ')} (CONFIRMED presence; semantic UNKNOWN)` : 'UNKNOWN'}\n- Product ID, device ID and SN co-presence: ${summary.deviceCandidates.length ? 'UNKNOWN until a mapping review; identifiers are masked.' : 'UNKNOWN'}\n- Field structure:\n\n\`\`\`json\n${JSON.stringify(summary.fields, null, 2)}\n\`\`\``).join('\n\n')
  const samples = summaries.flatMap((summary) => summary.samples.map((sample) => ({ collection: summary.name, sample }))).slice(0, maxReportSamples)
  const sampleText = samples.map((entry, index) => `### Sample ${index + 1}: ${entry.collection}\n\n\`\`\`json\n${JSON.stringify(entry.sample, null, 2)}\n\`\`\``).join('\n\n') || 'No business samples were read.'
  return `# MongoDB source inspection report\n\nMONGODB_SOURCE_ACCESS_STATUS: ${status}\n\n## Connection\n\n- Host: ${config.host}\n- Port: ${config.port}\n- Database: ${config.database}\n- authSource: ${config.authSource}\n- authMechanism: ${config.authMechanism}\n- directConnection: ${config.directConnection}\n\n## Collection inspection\n\n${collectionDetails || 'Permission did not allow an authorized collection to be inspected. No collection name was guessed.'}\n\n## Redacted samples (maximum 5)\n\n${sampleText}\n\nNo password, full URI, Token, MAC, IP, user information, unmasked identifier, complete MQTT topic, raw payload, or MongoDB write operation is included.\n`
}

async function main() {
  loadLocalEnvironment()
  const configuredUri = process.env.MONGODB_URI?.trim() ?? ''
  const database = process.env.MONGODB_DATABASE?.trim() ?? ''
  const selectedCollection = process.env.MONGODB_COLLECTION?.trim() || undefined
  const directConnection = process.env.MONGODB_DIRECT_CONNECTION === 'true'
  const authMechanism = process.env.MONGODB_AUTH_MECHANISM?.trim() || ''
  if (process.env.SOURCE_DB_ENABLED !== 'true' || !configuredUri || !database || !directConnection || authMechanism !== 'SCRAM-SHA-1') throw new Error('Local inspection configuration must explicitly enable directConnection=true and SCRAM-SHA-1.')
  const uri = new URL(configuredUri)
  if (configuredUri.includes('<PASSWORD>')) throw new Error('MONGODB_URI still contains a password placeholder.')
  uri.searchParams.set('authSource', uri.searchParams.get('authSource') || '')
  uri.searchParams.set('directConnection', 'true')
  uri.searchParams.set('authMechanism', 'SCRAM-SHA-1')
  const config = { host: maskHost(uri.hostname), port: uri.port || 'default', database, authSource: uri.searchParams.get('authSource') || '(missing)', authMechanism, directConnection, usernameLoaded: Boolean(uri.username) }
  const matrix: Matrix = { ping: { status: 'NOT_TESTED' }, authentication: { status: 'NOT_TESTED' }, connectionStatus: { status: 'NOT_TESTED' }, dbStats: { status: 'NOT_TESTED' }, listCollections: { status: 'NOT_TESTED' }, find: { status: 'NOT_TESTED' }, countDocuments: { status: 'NOT_TESTED' }, listIndexes: { status: 'NOT_TESTED' } }
  const client = new MongoClient(uri.toString(), { serverSelectionTimeoutMS: timeoutMs, connectTimeoutMS: timeoutMs, socketTimeoutMS: timeoutMs, maxPoolSize: 1 })
  let accessStatus: AccessStatus = 'FAIL'
  const summaries: CollectionSummary[] = []
  try {
    const authentication = await probe(() => client.connect())
    matrix.authentication = authentication
    if (authentication.status === 'FAIL') {
      writeFile(permissionReportPath, renderPermissionReport(config, matrix, accessStatus, selectedCollection))
      writeFile(sourceReportPath, renderSourceReport(accessStatus, config, summaries))
      console.log(JSON.stringify({ status: accessStatus, connection: 'authentication-failed' }))
      process.exitCode = 1
      return
    }
    const db = client.db(database)
    matrix.ping = await probe(() => db.command({ ping: 1, maxTimeMS: timeoutMs }))
    matrix.connectionStatus = await probe(() => client.db('admin').command({ connectionStatus: 1, showPrivileges: false, maxTimeMS: timeoutMs }))
    matrix.dbStats = await probe(() => db.command({ dbStats: 1, maxTimeMS: timeoutMs }))
    const listed = await probe(() => db.listCollections({}, { nameOnly: true, batchSize: 100 }).toArray())
    matrix.listCollections = listed
    const names = listed.status === 'PASS' ? ((listed.value as { name: string }[] | undefined) ?? []).map((item) => item.name).sort() : []
    const authorizedNames = names.length ? names : selectedCollection ? [selectedCollection] : []
    if (!authorizedNames.length) {
      accessStatus = 'PERMISSION_BLOCKED'
    } else {
      const firstCollection = db.collection<Document>(authorizedNames[0])
      const firstSamples = await probe(() => firstCollection.find({}, { limit: maxSampleRows, sort: { _id: -1 }, maxTimeMS: timeoutMs }).toArray())
      matrix.find = firstSamples
      matrix.countDocuments = await probe(() => firstCollection.countDocuments({}, { limit: countLimit, maxTimeMS: timeoutMs }))
      matrix.listIndexes = await probe(() => firstCollection.listIndexes({ maxTimeMS: timeoutMs }).toArray())
      if (firstSamples.status === 'PASS') {
        accessStatus = listed.status === 'PASS' ? 'READY_FOR_MAPPING' : 'COLLECTION_SCOPED'
        let remainingSamples = maxReportSamples
        for (const name of authorizedNames) {
          const summary = await inspectCollection(db.collection<Document>(name), name, remainingSamples)
          summaries.push(summary)
          remainingSamples -= summary.samples.length
        }
      } else {
        accessStatus = 'PERMISSION_BLOCKED'
      }
    }
    writeFile(permissionReportPath, renderPermissionReport(config, matrix, accessStatus, selectedCollection))
    writeFile(sourceReportPath, renderSourceReport(accessStatus, config, summaries))
    console.log(JSON.stringify({ status: accessStatus, database, collectionCount: summaries.length, permissions: Object.fromEntries(Object.entries(matrix).map(([key, value]) => [key, value.status])) }))
    process.exitCode = accessStatus === 'PERMISSION_BLOCKED' ? 2 : 0
  } finally {
    await client.close().catch(() => undefined)
  }
}

main().catch((error) => {
  const safe = safeError(error)
  console.error(JSON.stringify({ status: 'FAIL', errorCode: safe.code ?? null, errorType: safe.errorType ?? 'UnknownError' }))
  process.exitCode = 1
})
