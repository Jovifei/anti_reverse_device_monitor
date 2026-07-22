import { NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { ExcelSourceAdapter } from '@/src/adapters/source/excel-adapter'
import { DeviceRepository } from '@/src/repositories/device-repository'
import { TelemetryRepository } from '@/src/repositories/telemetry-repository'
import { Prisma } from '@prisma/client'
import { prisma } from '@/src/lib/prisma'

function normalizeMetricKey(input: string): string {
  return input.trim().toLowerCase()
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const filePath = String(body?.filePath || '')

  if (!filePath) {
    return NextResponse.json(
      {
        error: 'filePath required'
      },
      { status: 400 }
    )
  }

  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    return NextResponse.json(
      {
        error: 'filePath not found'
      },
      { status: 400 }
    )
  }

  const adapter = new ExcelSourceAdapter(resolvedPath)
  const rows = await adapter.read()

  const deviceRepository = new DeviceRepository()
  const telemetryRepository = new TelemetryRepository()
  const batch = await prisma.importBatch.create({ data: { source: 'excel', fileName: path.basename(resolvedPath), status: 'running' } })

  let inserted = 0
  let skippedDuplicates = 0
  let failures = 0

  for (const row of rows) {
    const device = await deviceRepository.upsertDevice({
      deviceSn: row.deviceSn
    })

    if (row.inverterIndex) {
      await deviceRepository.findOrCreateInverterBinding({
        deviceId: device.id,
        inverterIndex: row.inverterIndex,
        inverterSn: row.inverterSn
      })
    }

    const numeric =
      typeof row.value === 'number' ? row.value : Number.parseFloat(String(row.value))

    try {
      await telemetryRepository.upsertBatch([
        {
          deviceSn: row.deviceSn,
          inverterSn: row.inverterSn,
          inverterIndex: row.inverterIndex,
          siid: row.siid,
          piid: row.piid,
          metricKey: normalizeMetricKey(row.metricKey),
          reportedAt: row.reportedAt,
          receivedAt: new Date(),
          valueNumber: Number.isNaN(numeric) ? null : numeric,
          valueText: typeof row.value === 'number' ? null : String(row.value ?? row.valueText ?? ''),
          sourceRecordId: row.sourceRecordId
        }
      ])
      inserted += 1
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        skippedDuplicates += 1
      } else {
        failures += 1
      }
    }
  }

  await prisma.importBatch.update({ where: { id: batch.id }, data: { recordCount: inserted, status: failures > 0 ? 'completed_with_errors' : 'completed' } })
  return NextResponse.json({
    importBatchId: batch.id,
    imported: inserted,
    duplicatesSkipped: skippedDuplicates,
    failures
  })
}
