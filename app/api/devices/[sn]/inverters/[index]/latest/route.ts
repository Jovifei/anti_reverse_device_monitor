import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { DeviceService } from '@/src/services/device-service'

export async function GET(_: Request, { params }: { params: Promise<{ sn: string; index: string }> }) {
  const { sn, index } = await params
  const service = new DeviceService()

  try {
    const inverter = await service.getInverterSummary(sn, index)
    if (!inverter) {
      return NextResponse.json({ error: 'inverter_not_found' }, { status: 404 })
    }
    return NextResponse.json(inverter)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    }
    if (error instanceof Error && error.message === 'invalid inverter index') {
      return NextResponse.json({ error: 'invalid inverter index' }, { status: 400 })
    }
    throw error
  }
}
