import { loadLocalEnvironment } from '@/src/adapters/source-db/config'
import { MockSourceAdapter } from '@/src/adapters/source-db/mock-source-adapter'
import { prisma } from '@/src/lib/prisma'
import { createConfiguredSourceAdapter, SourceSyncService } from '@/src/services/source-sync-service'

function flag(name: string) {
  return process.argv.includes(name)
}

function value(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  loadLocalEnvironment()
  const dryRun = flag('--dry-run')
  const deviceId = value('--device-id')
  const configured = process.env.SOURCE_DB_ENABLED === 'true'
  if (!configured && dryRun) {
    console.log(
      JSON.stringify(
        {
          status: 'dry-run',
          sourceConfigured: false,
          recordsRead: 0,
          message: 'No approved source is configured; validated the offline sync command without opening SQLite.'
        },
        null,
        2
      )
    )
    return
  }
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL is required for a non-dry-run source synchronization.')
  const from = value('--from')
  console.error(
    `[source:sync] starting${dryRun ? ' (dry-run)' : ''}${deviceId ? ` device_id=${deviceId}` : ''} — connecting to Mongo may take 30–60s…`
  )
  const adapter = configured ? createConfiguredSourceAdapter({ deviceId }) : new MockSourceAdapter()
  const result = await new SourceSyncService(adapter).sync({
    dryRun,
    from: from ? new Date(from) : undefined,
    sn: value('--sn'),
    // Shared SyncCheckpoint is source-wide; filtering by device_id must not reuse/advance it.
    ignoreCheckpoint: Boolean(deviceId)
  })
  console.log(JSON.stringify(result, null, 2))
  await prisma.$disconnect()
  if (result.status === 'failed') process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
