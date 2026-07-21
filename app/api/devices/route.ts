import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { DeviceService } from '@/src/services/device-service'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const service = new DeviceService()

  try {
    const result = await service.listDevices(url.searchParams)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'invalid_query' }, { status: 400 })
    }
    throw error
  }
}
