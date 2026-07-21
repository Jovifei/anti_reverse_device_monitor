import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { DeviceService } from '@/src/services/device-service'

export async function GET(_: Request, { params }: { params: Promise<{ sn: string }> }) {
  const { sn } = await params
  const service = new DeviceService()

  try {
    const summary = await service.getDeviceHealth(sn)
    if (!summary) {
      return NextResponse.json({ error: 'device_not_found' }, { status: 404 })
    }
    return NextResponse.json(summary)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'invalid_sn' }, { status: 400 })
    }
    throw error
  }
}
