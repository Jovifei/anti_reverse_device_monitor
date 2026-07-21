import { NextResponse } from 'next/server'
import { DeviceService } from '@/src/services/device-service'
import { ZodError } from 'zod'

export async function GET(request: Request, { params }: { params: Promise<{ sn: string }> }) {
  const { sn } = await params
  const service = new DeviceService()
  try {
    const latest = await service.getTelemetryLatest(sn, new URL(request.url).searchParams)
    return NextResponse.json(latest)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'invalid_query' }, { status: 400 })
    }
    throw error
  }
}
