import fs from 'node:fs'
import path from 'node:path'
import { MongoClient, type Document } from 'mongodb'
import { loadLocalEnvironment } from '@/src/adapters/source-db/config'
import {
  loadDeviceRegistry,
  mergeDeviceIdsIntoRegistry,
  resolveDeviceRegistryPath,
  type DeviceRegistry
} from '@/src/adapters/source-db/device-registry'

function flag(name: string) {
  return process.argv.includes(name)
}

function value(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  loadLocalEnvironment()
  const lookbackDays = Number(value('--days') || process.env.SOURCE_INITIAL_LOOKBACK_DAYS || 7)
  const productId = value('--product-id') || process.env.MONGODB_PRODUCT_ID?.trim()
  const collectionName =
    value('--collection') ||
    process.env.MONGODB_COLLECTION?.trim() ||
    (productId ? `device_log_${productId}` : '')
  const uri = process.env.MONGODB_URI?.trim() ?? ''
  const database = process.env.MONGODB_DATABASE?.trim() ?? ''
  if (!uri || uri.includes('<PASSWORD>') || !database || !collectionName) {
    throw new Error('MONGODB_URI, MONGODB_DATABASE, and collection/product id are required.')
  }

  const root = process.cwd()
  let existing: DeviceRegistry = { version: 1, devices: [] }
  try {
    existing = loadDeviceRegistry(root).registry
  } catch {
    existing = { version: 1, devices: [] }
  }

  const to = new Date()
  const from = new Date(to.getTime() - Math.max(1, lookbackDays) * 86_400_000)
  const fromSec = Math.floor(from.getTime() / 1000)
  const toSec = Math.floor(to.getTime() / 1000)
  const timeoutMs = Math.max(1_000, Number(process.env.SOURCE_QUERY_TIMEOUT_SECONDS || 15) * 1000 || 15_000)

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: timeoutMs,
    connectTimeoutMS: timeoutMs,
    socketTimeoutMS: timeoutMs,
    maxPoolSize: 1
  })

  try {
    await client.connect()
    const collection = client.db(database).collection<Document>(collectionName)
    // Read-only distinct; never write to Mongo.
    const deviceIds = (await collection.distinct('device_id', { time: { $gte: fromSec, $lte: toSec } }))
      .map((item) => String(item))
      .filter(Boolean)
      .sort()

    const merged = mergeDeviceIdsIntoRegistry(existing, deviceIds, {
      product_id: productId,
      collection: collectionName
    })

    const outPath = flag('--write-local')
      ? resolveDeviceRegistryPath(root).mode === 'local'
        ? resolveDeviceRegistryPath(root).path
        : path.join(root, 'config', 'devices.json')
      : path.join(root, 'config', 'devices.draft.json')

    fs.writeFileSync(outPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
    console.log(
      JSON.stringify(
        {
          status: 'ok',
          collection: collectionName,
          discovered: deviceIds.length,
          totalAfterMerge: merged.devices.length,
          output: outPath,
          note: flag('--write-local')
            ? 'Wrote local devices.json — review SN mappings before relying on sync.'
            : 'Wrote devices.draft.json — copy confirmed SN mappings into config/devices.json.'
        },
        null,
        2
      )
    )
  } finally {
    await client.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
