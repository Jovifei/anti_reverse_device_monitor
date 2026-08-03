import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'

export const dynamic = 'force-dynamic'

/** Cheap fingerprint for diagnostics / optional clients. */
export async function GET() {
  const [checkpoint, deviceAgg] = await Promise.all([
    prisma.syncCheckpoint.findFirst({ orderBy: { syncedAt: 'desc' } }),
    prisma.device.aggregate({ _max: { lastReportedAt: true } })
  ])

  return NextResponse.json({
    syncedAt: checkpoint?.lastSuccessAt?.toISOString() ?? checkpoint?.syncedAt?.toISOString() ?? null,
    lastReportedAt: deviceAgg._max.lastReportedAt?.toISOString() ?? null,
    status: checkpoint?.status ?? null
  })
}

/** Bust devices route cache so the next router.refresh() re-reads SQLite. */
export async function POST() {
  revalidatePath('/devices', 'layout')
  revalidatePath('/devices')
  return NextResponse.json({ ok: true, at: new Date().toISOString() })
}
