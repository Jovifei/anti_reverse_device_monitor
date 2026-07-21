import { prisma } from '@/src/lib/prisma'

async function verifyData() {
  const deviceCount = await prisma.device.count()
  const inverterCount = await prisma.inverterBinding.count()
  const telemetryCount = await prisma.telemetry.count()
  const latestCount = await prisma.deviceLatest.count()
  const faultEventCount = await prisma.faultEvent.count()
  const reverseFlowAlertCount = await prisma.reverseFlowAlert.count()

  const missingReported = await prisma.device.count({
    where: {
      lastReportedAt: null
    }
  })

  console.log(
    JSON.stringify(
      {
        checks: {
          deviceCount,
          inverterCount,
          telemetryCount,
          latestCount,
          faultEventCount,
          reverseFlowAlertCount,
          devicesMissingLastReported: missingReported
        }
      },
      null,
      2
    )
  )
}

verifyData().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
