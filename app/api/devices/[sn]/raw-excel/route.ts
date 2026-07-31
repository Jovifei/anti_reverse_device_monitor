import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { DeviceService } from '@/src/services/device-service'
import { ZodError } from 'zod'

export async function GET(_: Request, { params }: { params: Promise<{ sn: string }> }) {
  const { sn } = await params
  const service = new DeviceService()
  try {
    const file = await service.findRawExcelForDevice(sn)
    if (!file) {
      return NextResponse.json({ error: 'raw_excel_not_found' }, { status: 404 })
    }

    const absolute = path.join(process.cwd(), file.relativePath)
    const bytes = await readFile(absolute)
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        'Content-Length': String(bytes.byteLength)
      }
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'invalid_sn', message: error.message }, { status: 400 })
    }
    throw error
  }
}
