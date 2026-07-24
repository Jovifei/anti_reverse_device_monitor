import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ExcelSourceAdapter } from '@/src/adapters/source/excel-adapter'
import { parseSn } from '@/src/domain/validation'
import { DeviceRepository } from '@/src/repositories/device-repository'
import { TelemetryRepository } from '@/src/repositories/telemetry-repository'
import { Prisma, PrismaClient } from '@prisma/client'

function normalizeMetricKey(input: string): string {
  return input.trim().toLowerCase()
}

export async function importExcelToDatabase(filePath: string, overrideSn?: string) {
  if (overrideSn) parseSn(overrideSn)
  const adapter = new ExcelSourceAdapter(filePath)
  const adapterRows = await adapter.read()
  const deviceRepo = new DeviceRepository()
  const telemetryRepo = new TelemetryRepository()
  const { prisma } = await import('@/src/lib/prisma')
  const batch = await prisma.importBatch.create({
    data: { source: 'excel', fileName: path.basename(filePath), status: 'running' }
  })

  let count = 0
  let skippedDuplicates = 0
  for (const row of adapterRows) {
    const deviceSn = overrideSn || row.deviceSn
    parseSn(deviceSn)
    const device = await deviceRepo.upsertDevice({ deviceSn })
    if (row.inverterIndex && Number.isInteger(row.inverterIndex)) {
      await deviceRepo.findOrCreateInverterBinding({
        deviceId: device.id,
        inverterIndex: row.inverterIndex,
        inverterSn: row.inverterSn
      })
    }
    const numberValue = typeof row.value === 'number' ? row.value : Number.parseFloat(String(row.value))
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
          sourceRecordId: row.sourceRecordId,
          sourceName: 'excel'
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
  return { count, skippedDuplicates }
}

export async function withTempSqliteFromExcel<T>(
  excelPath: string,
  sn: string | undefined,
  run: () => Promise<T>
): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'offline-html-excel-'))
  const dbPath = path.join(tempDir, 'excel-export.db')
  await fs.writeFile(dbPath, '')
  const previousUrl = process.env.APP_DATABASE_URL
  process.env.APP_DATABASE_URL = `file:${dbPath.replace(/\\/g, '/')}`
  try {
    const prismaCommand =
      process.platform === 'win32'
        ? { file: 'cmd.exe', args: ['/d', '/s', '/c', 'npx prisma db push --skip-generate'] }
        : { file: 'npx', args: ['prisma', 'db', 'push', '--skip-generate'] }
    execFileSync(prismaCommand.file, prismaCommand.args, { cwd: process.cwd(), env: process.env, stdio: 'inherit' })
    // Re-import prisma after URL change by using a fresh client for import path via env already set
    await importExcelToDatabase(excelPath, sn)
    return await run()
  } finally {
    try {
      const client = new PrismaClient()
      await client.$disconnect()
    } catch {
      // ignore
    }
    if (previousUrl === undefined) delete process.env.APP_DATABASE_URL
    else process.env.APP_DATABASE_URL = previousUrl
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}
