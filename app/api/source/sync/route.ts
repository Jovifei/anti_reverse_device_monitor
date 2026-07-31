import { NextResponse } from 'next/server'
import { loadLocalEnvironment } from '@/src/adapters/source-db/config'
import { createConfiguredSourceAdapter, SourceSyncService } from '@/src/services/source-sync-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

let activeSync: Promise<unknown> | null = null

export async function POST() {
  loadLocalEnvironment()
  if (process.env.SOURCE_DB_ENABLED !== 'true') {
    return NextResponse.json({ status: 'skipped', reason: 'source_disabled', imported: 0 })
  }

  if (activeSync) {
    return NextResponse.json({ status: 'busy', imported: 0 })
  }

  activeSync = (async () => {
    // Clear one-shot CLI device filter so live poll covers the full registry.
    const previousDeviceId = process.env.MONGODB_DEVICE_ID
    delete process.env.MONGODB_DEVICE_ID
    try {
      const adapter = createConfiguredSourceAdapter()
      return await new SourceSyncService(adapter).sync({
        // Checkpoint-based: only rows newer than last success.
        ignoreCheckpoint: false
      })
    } finally {
      if (previousDeviceId) process.env.MONGODB_DEVICE_ID = previousDeviceId
      else delete process.env.MONGODB_DEVICE_ID
    }
  })()

  try {
    const result = await activeSync
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      {
        status: 'failed',
        imported: 0,
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  } finally {
    activeSync = null
  }
}
