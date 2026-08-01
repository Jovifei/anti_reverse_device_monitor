import { getSourceRuntimeConfig, loadLocalEnvironment } from '@/src/adapters/source-db/config'
import { redactSourceError } from '@/src/adapters/source-db/security'
import { prisma } from '@/src/lib/prisma'
import { createConfiguredSourceAdapter, SourceSyncService } from '@/src/services/source-sync-service'
import { startSourceSyncWorker } from '@/src/services/source-sync-worker'

async function main() {
  loadLocalEnvironment()
  const config = getSourceRuntimeConfig()
  if (!config.enabled) {
    console.log('[source:worker] source database disabled; worker will not start')
    await prisma.$disconnect()
    return
  }
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL is required for source:worker.')

  const handle = startSourceSyncWorker({
    intervalMs: config.syncIntervalSeconds * 1_000,
    sync: async () => {
      const adapter = createConfiguredSourceAdapter({ deviceId: null })
      return new SourceSyncService(adapter).sync({ ignoreCheckpoint: false })
    }
  })
  const stop = () => handle.stop()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    await handle.done
  } finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  const safe = redactSourceError(error)
  console.error(`[source:worker] fatal code=${safe.code} message=${safe.message}`)
  process.exitCode = 1
})
