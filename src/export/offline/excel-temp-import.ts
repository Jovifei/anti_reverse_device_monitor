import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DeviceLogExcelAdapter, isDeviceLogExcel } from '@/src/adapters/source/device-log-excel-adapter'
import { ExcelSourceAdapter } from '@/src/adapters/source/excel-adapter'
import { parseSn } from '@/src/domain/validation'
import { Prisma } from '@prisma/client'

function normalizeMetricKey(input: string): string {
  return input.trim().toLowerCase()
}

export async function importExcelToDatabase(filePath: string, overrideSn?: string) {
  if (overrideSn) parseSn(overrideSn)
  const useDeviceLog = isDeviceLogExcel(filePath)
  const adapter = useDeviceLog ? new DeviceLogExcelAdapter(filePath) : new ExcelSourceAdapter(filePath)
  const adapterRows = await adapter.read()
  // Do not import repositories before withTempSqliteFromExcel sets APP_DATABASE_URL.
  const [{ DeviceRepository }, { TelemetryRepository }, { prisma }] = await Promise.all([
    import('@/src/repositories/device-repository'),
    import('@/src/repositories/telemetry-repository'),
    import('@/src/lib/prisma')
  ])
  const deviceRepo = new DeviceRepository()
  const telemetryRepo = new TelemetryRepository()
  const batch = await prisma.importBatch.create({
    data: { source: 'excel', fileName: path.basename(filePath), status: 'running' }
  })

  let count = 0
  let skippedDuplicates = 0
  const deviceCache = new Map<string, number>()
  const bindingCache = new Set<string>()
  const chunkSize = 500

  async function ensureDevice(deviceSn: string, reportedAt: Date) {
    const cached = deviceCache.get(deviceSn)
    if (cached) return cached
    const device = await deviceRepo.upsertDevice({
      deviceSn,
      platformOnline: true,
      lastReportedAt: reportedAt
    })
    deviceCache.set(deviceSn, device.id)
    return device.id
  }

  for (let offset = 0; offset < adapterRows.length; offset += chunkSize) {
    const chunk = adapterRows.slice(offset, offset + chunkSize)
    for (const row of chunk) {
      const deviceSn = overrideSn || row.deviceSn
      parseSn(deviceSn)
      const deviceId = await ensureDevice(deviceSn, row.reportedAt)
      if (row.inverterIndex && Number.isInteger(row.inverterIndex)) {
        const key = `${deviceId}:${row.inverterIndex}`
        if (!bindingCache.has(key)) {
          await deviceRepo.findOrCreateInverterBinding({
            deviceId,
            inverterIndex: row.inverterIndex,
            inverterSn: row.inverterSn
          })
          bindingCache.add(key)
        }
      }
    }
    const payload = chunk.map((row) => {
      const deviceSn = overrideSn || row.deviceSn
      const numberValue = typeof row.value === 'number' ? row.value : Number.parseFloat(String(row.value))
      return {
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
    })
    try {
      await telemetryRepo.upsertBatch(payload)
      count += payload.length
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        for (const item of payload) {
          try {
            await telemetryRepo.upsertBatch([item])
            count += 1
          } catch (inner) {
            if (inner instanceof Prisma.PrismaClientKnownRequestError && inner.code === 'P2002') {
              skippedDuplicates += 1
              continue
            }
            throw inner
          }
        }
        continue
      }
      throw error
    }
  }

  await prisma.importBatch.update({ where: { id: batch.id }, data: { recordCount: count, status: 'completed' } })
  return { count, skippedDuplicates, adapter: useDeviceLog ? 'device-log' : 'normalized' }
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
    await importExcelToDatabase(excelPath, sn)
    return await run()
  } finally {
    try {
      // Callers may lazily import view-model builders inside the callback.
      // Disconnect the shared singleton that opened the temporary SQLite file,
      // rather than a new client that never held the file handle.
      const { prisma } = await import('@/src/lib/prisma')
      await prisma.$disconnect()
    } catch {
      // ignore
    }
    if (previousUrl === undefined) delete process.env.APP_DATABASE_URL
    else process.env.APP_DATABASE_URL = previousUrl
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}
