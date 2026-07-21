import { prisma } from '@/src/lib/prisma'

function getRetentionDays(): number {
  const value = Number(process.env.DATA_RETENTION_DAYS ?? '7')
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 7
}

async function cleanup() {
  const retention = getRetentionDays()
  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setDate(now.getDate() - retention)

  const telemetryCount = await prisma.telemetry.deleteMany({
    where: {
      reportedAt: {
        lt: cutoff
      }
    }
  })

  const latestCount = await prisma.deviceLatest.deleteMany({
    where: {
      reportedAt: {
        lt: cutoff
      }
    }
  })

  const eventCount = await prisma.deviceEvent.deleteMany({
    where: {
      happenedAt: {
        lt: cutoff
      }
    }
  })

  const faultEventCount = await prisma.faultEvent.deleteMany({
    where: {
      startedAt: {
        lt: cutoff
      }
    }
  })

  const reverseFlowCount = await prisma.reverseFlowAlert.deleteMany({
    where: {
      startedAt: {
        lt: cutoff
      }
    }
  })

  console.log(
    JSON.stringify(
      {
        retentionDays: retention,
        cutoff: cutoff.toISOString(),
        telemetry: telemetryCount.count,
        deviceLatest: latestCount.count,
        deviceEvents: eventCount.count,
        faultEvents: faultEventCount.count,
        reverseFlowAlerts: reverseFlowCount.count
      },
      null,
      2
    )
  )
}

cleanup().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
