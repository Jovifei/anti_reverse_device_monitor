import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { TelemetryService } from '@/src/services/telemetry-service'

export async function GET(request: Request, { params }: { params: Promise<{ sn: string }> }) {
  const { sn } = await params
  const searchParams = new URL(request.url).searchParams
  const metric = searchParams.get('metric')

  if (!metric) {
    return NextResponse.json(
      {
        error: 'metric query required'
      },
      { status: 400 }
    )
  }

  const service = new TelemetryService()
  try {
    const points = await service.getTimeline(sn, metric, searchParams)
    return NextResponse.json(points)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'invalid_query' }, { status: 400 })
    }
    throw error
  }
}
