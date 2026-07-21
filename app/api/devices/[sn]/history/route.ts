import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { DeviceService } from '@/src/services/device-service'

export async function GET(request: Request, { params }: { params: Promise<{ sn: string }> }) {
  const { sn } = await params
  const service = new DeviceService()

  try {
    const history = await service.getDeviceHistory(sn, new URL(request.url).searchParams)
    if (!history) {
      return NextResponse.json({ error: 'device_not_found' }, { status: 404 })
    }
    return NextResponse.json(history)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'invalid_query' }, { status: 400 })
    }
    throw error
  }
}
