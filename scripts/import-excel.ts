import { ExcelSourceAdapter } from '@/src/adapters/source/excel-adapter'
import { DeviceRepository } from '@/src/repositories/device-repository'
import { TelemetryRepository } from '@/src/repositories/telemetry-repository'
import { parseSn } from '@/src/domain/validation'
import { Prisma } from '@prisma/client'
import path from 'node:path'
import { prisma } from '@/src/lib/prisma'

function normalizeMetricKey(input: string): string {
  return input.trim().toLowerCase()
}


async function main() {
  const filePath = process.argv[2]
  const overrideSn = process.argv[3]

  if (!filePath) {
    throw new Error('Usage: npm run import:excel <excel_file> [target_sn]')
  }

  if (overrideSn) {
    parseSn(overrideSn)
  }

  const adapter = new ExcelSourceAdapter(filePath)
  const adapterRows = await adapter.read()

  const deviceRepo = new DeviceRepository()
  const telemetryRepo = new TelemetryRepository()
  const batch = await prisma.importBatch.create({ data: { source: 'excel', fileName: path.basename(filePath), status: 'running' } })

  let count = 0
  let skippedDuplicates = 0

  for (const row of adapterRows) {
    const deviceSn = overrideSn || row.deviceSn
    parseSn(deviceSn)

    const device = await deviceRepo.upsertDevice({
      deviceSn
    })

    if (row.inverterIndex && Number.isInteger(row.inverterIndex)) {
      await deviceRepo.findOrCreateInverterBinding({
        deviceId: device.id,
        inverterIndex: row.inverterIndex,
        inverterSn: row.inverterSn
      })
    }

    const numberValue =
      typeof row.value === 'number' ? row.value : Number.parseFloat(String(row.value))
    try {
      await telemetryRepo.upsertBatch([
        {
          deviceSn,
          inverterIndex: row.inverterIndex,
          inverterSn: row.inverterSn,
          siid: row.siid,
          piid: row.piid,
          metricKey: normalizeMetricKey(String(row.metricKey)),
          reportedAt: row.reportedAt,
          receivedAt: new Date(),
          valueNumber: Number.isNaN(numberValue) ? null : numberValue,
          valueText: typeof row.value === 'number' ? null : String(row.value ?? row.valueText ?? ''),
          sourceRecordId: row.sourceRecordId
        }
      ])
      count += 1
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        skippedDuplicates += 1
        continue
      }
      throw error
    }
  }

  await prisma.importBatch.update({ where: { id: batch.id }, data: { recordCount: count, status: 'completed' } })
  console.log(
    JSON.stringify(
      {
        importBatchId: batch.id,
        imported: count,
        duplicatesSkipped: skippedDuplicates
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
