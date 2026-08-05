import { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/src/lib/prisma'
import { hasCriticalFault } from '@/src/domain/faults'

export interface LatestTelemetryRow {
  metricKey: string
  valueNumber: number | null
  valueText: string | null
  reportedAt: Date
  isFaultCritical?: boolean
}

export type TelemetryWriteConflict = {
  sourceRecordId: string
  reason: 'source_record_conflict'
}

export type TelemetryWriteResult = {
  created: number
  duplicatesSkipped: number
  conflicts: TelemetryWriteConflict[]
}

function sameSourceTelemetry(
  existing: {
    deviceId: number
    inverterId: number | null
    siid: string
    piid: string
    metricKey: string
    reportedAt: Date
    valueNumber: number | null
    valueText: string | null
    sourceName: string
  },
  next: {
    deviceId: number
    inverterId: number | null
    siid: string
    piid: string
    metricKey: string
    reportedAt: Date
    valueNumber: number | null
    valueText: string | null
    sourceName: string
  }
) {
  return existing.deviceId === next.deviceId &&
    existing.inverterId === next.inverterId &&
    existing.siid === next.siid &&
    existing.piid === next.piid &&
    existing.metricKey === next.metricKey &&
    existing.reportedAt.getTime() === next.reportedAt.getTime() &&
    existing.valueNumber === next.valueNumber &&
    existing.valueText === next.valueText &&
    existing.sourceName === next.sourceName
}

export class TelemetryRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async upsertBatch(
    rows: Array<{
      deviceSn: string
      inverterSn?: string | null
      inverterIndex?: number | null
      siid?: string | null
      piid?: string | null
      metricKey: string
      reportedAt: Date
      receivedAt: Date
      valueNumber?: number | null
      valueText?: string | null
      sourceRecordId: string
      sourceName?: string
    }>
  ): Promise<TelemetryWriteResult> {
    return this.db.$transaction(async (tx) => {
      const result: TelemetryWriteResult = { created: 0, duplicatesSkipped: 0, conflicts: [] }
      const affectedKeys = new Map<string, { deviceId: number; inverterId: number | null; metricKey: string }>()

      for (const row of rows) {
        const device = await tx.device.findUnique({
          where: { deviceSn: row.deviceSn }
        })

        if (!device) {
          continue
        }

        let inverterId: number | null = null
        if (row.inverterIndex && row.inverterIndex > 0) {
          const binding = await tx.inverterBinding.findFirst({
            where: {
              deviceId: device.id,
              inverterIndex: row.inverterIndex
            }
          })

          inverterId = binding?.id ?? null
        }

        const telemetryData = {
          deviceId: device.id,
          inverterId: inverterId,
          siid: row.siid ?? '0',
          piid: row.piid ?? '0',
          metricKey: row.metricKey,
          reportedAt: row.reportedAt,
          receivedAt: row.receivedAt,
          valueNumber: row.valueNumber ?? null,
          valueText: row.valueText ?? null,
          sourceRecordId: row.sourceRecordId,
          sourceName: row.sourceName ?? 'excel'
        }

        let createdCurrent = false
        const bySource = await tx.telemetry.findUnique({ where: { sourceRecordId: row.sourceRecordId } })
        if (bySource) {
          if (sameSourceTelemetry(bySource, telemetryData)) result.duplicatesSkipped += 1
          else result.conflicts.push({ sourceRecordId: row.sourceRecordId, reason: 'source_record_conflict' })
          continue
        } else {
          try {
            await tx.telemetry.create({ data: telemetryData })
            result.created += 1
            createdCurrent = true
          } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
            const raced = await tx.telemetry.findUnique({ where: { sourceRecordId: row.sourceRecordId } })
            if (!raced) throw error
            if (sameSourceTelemetry(raced, telemetryData)) result.duplicatesSkipped += 1
            else result.conflicts.push({ sourceRecordId: row.sourceRecordId, reason: 'source_record_conflict' })
          }
        }

        if (!createdCurrent) continue
        affectedKeys.set(`${device.id}|${inverterId ?? 'null'}|${row.metricKey}`, { deviceId: device.id, inverterId, metricKey: row.metricKey })

        if (!device.lastReportedAt || row.reportedAt > device.lastReportedAt) {
          await tx.device.update({
            where: { id: device.id },
            data: {
              platformOnline: true,
              lastReportedAt: row.reportedAt
            }
          })
          device.lastReportedAt = row.reportedAt
        }
      }

      for (const key of affectedKeys.values()) {
        const latest = await tx.telemetry.findFirst({
          where: { deviceId: key.deviceId, inverterId: key.inverterId, metricKey: key.metricKey },
          orderBy: [{ reportedAt: 'desc' }, { sourceRecordId: 'desc' }],
          select: { valueNumber: true, valueText: true, reportedAt: true, receivedAt: true }
        })
        if (!latest) continue
        const existing = await tx.deviceLatest.findFirst({ where: key, select: { id: true } })
        if (existing) await tx.deviceLatest.update({ where: { id: existing.id }, data: latest })
        else await tx.deviceLatest.create({ data: { deviceId: key.deviceId, inverterId: key.inverterId, metricKey: key.metricKey, ...latest } })
      }

      return result
    })
  }

  async getLatestAnyBefore({
    deviceSn,
    inverterIndex,
    beforeAt
  }: {
    deviceSn: string
    inverterIndex?: number | null
    beforeAt: Date
  }) {
    const device = await this.db.device.findUnique({ where: { deviceSn }, select: { id: true } })
    if (!device) {
      return null
    }

    let inverterId: number | null = null
    if (inverterIndex) {
      const binding = await this.db.inverterBinding.findFirst({
        where: { deviceId: device.id, inverterIndex },
        select: { id: true }
      })
      inverterId = binding?.id ?? null
    }

    return this.db.telemetry.findFirst({
      where: {
        deviceId: device.id,
        inverterId,
        reportedAt: {
          lte: beforeAt
        }
      },
      orderBy: { reportedAt: 'desc' }
    })
  }

  async listLatest({
    deviceSn,
    inverterIndex,
    metricKey,
    metricKeyContains,
    page,
    pageSize
  }: {
    deviceSn: string
    inverterIndex?: number | null
    metricKey?: string
    metricKeyContains?: string
    page?: number
    pageSize?: number
  }) {
    const take = pageSize ?? 200
    const skip = ((page ?? 1) - 1) * take

    const device = await this.db.device.findUnique({ where: { deviceSn }, select: { id: true } })
    if (!device) {
      return [] as LatestTelemetryRow[]
    }

    const where: Prisma.DeviceLatestWhereInput = {
      deviceId: device.id
    }

    if (metricKeyContains) {
      where.metricKey = {
        contains: metricKeyContains
      }
    } else if (metricKey) {
      where.metricKey = metricKey
    }

    if (inverterIndex) {
      const binding = await this.db.inverterBinding.findFirst({
        where: { deviceId: device.id, inverterIndex },
        select: { id: true }
      })
      if (!binding) return [] as LatestTelemetryRow[]
      where.inverterId = binding.id
    }

    const rows = await this.db.deviceLatest.findMany({
      where,
      orderBy: { reportedAt: 'desc' },
      skip,
      take
    })

    return rows.map((row) => ({
      metricKey: row.metricKey,
      valueNumber: row.valueNumber,
      valueText: row.valueText,
      reportedAt: row.reportedAt,
      isFaultCritical: row.metricKey.includes('fault') ? hasCriticalFault(Number(row.valueNumber ?? 0)) : undefined
    }))
  }

  async listLatestFaultKeys({
    deviceSn,
    inverterIndex,
    page,
    pageSize
  }: {
    deviceSn: string
    inverterIndex?: number | null
    page?: number
    pageSize?: number
  }) {
    return this.listLatest({
      deviceSn,
      inverterIndex,
      metricKeyContains: 'fault',
      page,
      pageSize
    })
  }

  async hasTelemetryForDevice(deviceSn: string) {
    const device = await this.db.device.findUnique({ where: { deviceSn }, select: { id: true } })
    if (!device) return false
    return Boolean(await this.db.telemetry.findFirst({ where: { deviceId: device.id }, select: { id: true } }))
  }

  async getLatestSourceNameForDevice(deviceSn: string) {
    const device = await this.db.device.findUnique({ where: { deviceSn }, select: { id: true } })
    if (!device) return null
    const row = await this.db.telemetry.findFirst({
      where: { deviceId: device.id },
      orderBy: [{ reportedAt: 'desc' }, { id: 'desc' }],
      select: { sourceName: true }
    })
    return row?.sourceName ?? null
  }

  async listTelemetryByMetric({
    deviceSn,
    metricKey,
    inverterIndex,
    startAt,
    endAt
  }: {
    deviceSn: string
    metricKey: string
    inverterIndex?: number | null
    startAt: Date
    endAt: Date
  }) {
    const device = await this.db.device.findUnique({ where: { deviceSn }, select: { id: true } })
    if (!device) {
      return []
    }

    let inverterId: number | null = null
    if (inverterIndex) {
      const binding = await this.db.inverterBinding.findFirst({
        where: { deviceId: device.id, inverterIndex },
        select: { id: true }
      })
      if (!binding) return []
      inverterId = binding.id
    }

    return this.db.telemetry.findMany({
      where: {
        deviceId: device.id,
        inverterId,
        metricKey,
        reportedAt: {
          gte: startAt,
          lte: endAt
        }
      },
      orderBy: [{ reportedAt: 'asc' }, { id: 'asc' }]
    })
  }

  async listTelemetryByMetricContains({
    deviceSn,
    metricKeyContains,
    inverterIndex,
    startAt,
    endAt
  }: {
    deviceSn: string
    metricKeyContains: string
    inverterIndex?: number | null
    startAt: Date
    endAt: Date
  }) {
    const device = await this.db.device.findUnique({ where: { deviceSn }, select: { id: true } })
    if (!device) {
      return []
    }

    let inverterId: number | null = null
    if (inverterIndex) {
      const binding = await this.db.inverterBinding.findFirst({
        where: { deviceId: device.id, inverterIndex },
        select: { id: true }
      })
      if (!binding) return []
      inverterId = binding.id
    }

    return this.db.telemetry.findMany({
      where: {
        deviceId: device.id,
        inverterId,
        metricKey: { contains: metricKeyContains },
        reportedAt: {
          gte: startAt,
          lte: endAt
        }
      },
      orderBy: [{ reportedAt: 'asc' }, { id: 'asc' }]
    })
  }

  async countTelemetry({ deviceSn, metricKey, inverterIndex, startAt, endAt }: { deviceSn: string; metricKey: string; inverterIndex?: number | null; startAt: Date; endAt: Date }) {
    const device = await this.db.device.findUnique({ where: { deviceSn }, select: { id: true } })
    if (!device) {
      return 0
    }

    let inverterId: number | null = null
    if (inverterIndex) {
      const binding = await this.db.inverterBinding.findFirst({
        where: { deviceId: device.id, inverterIndex },
        select: { id: true }
      })
      if (!binding) return 0
      inverterId = binding.id
    }

    return this.db.telemetry.count({
      where: {
        deviceId: device.id,
        inverterId,
        metricKey,
        reportedAt: {
          gte: startAt,
          lte: endAt
        }
      }
    })
  }

  async listTelemetryWindow({
    deviceSn,
    inverterIndex,
    startAt,
    endAt
  }: {
    deviceSn: string
    inverterIndex?: number | null
    startAt: Date
    endAt: Date
  }) {
    const device = await this.db.device.findUnique({ where: { deviceSn }, select: { id: true } })
    if (!device) {
      return []
    }

    let inverterId: number | null = null
    if (inverterIndex) {
      const binding = await this.db.inverterBinding.findFirst({
        where: { deviceId: device.id, inverterIndex },
        select: { id: true }
      })
      if (!binding) return []
      inverterId = binding.id
    }

    return this.db.telemetry.findMany({
      where: {
        deviceId: device.id,
        inverterId,
        reportedAt: {
          gte: startAt,
          lte: endAt
        }
      },
      orderBy: [{ reportedAt: 'asc' }, { id: 'asc' }]
    })
  }

  /** CT body phase-power samples only — used by fleet sustained-reverse summary. */
  async listCtPhasePowerForDevices({
    deviceIds,
    metricKeys,
    startAt,
    endAt
  }: {
    deviceIds: number[]
    metricKeys: string[]
    startAt: Date
    endAt: Date
  }) {
    if (!deviceIds.length || !metricKeys.length) return []
    return this.db.telemetry.findMany({
      where: {
        deviceId: { in: deviceIds },
        inverterId: null,
        metricKey: { in: metricKeys },
        reportedAt: { gte: startAt, lte: endAt }
      },
      select: {
        deviceId: true,
        metricKey: true,
        valueNumber: true,
        reportedAt: true
      },
      orderBy: [{ deviceId: 'asc' }, { reportedAt: 'asc' }, { id: 'asc' }]
    })
  }

  /** Paired-inverter fault masks in a window — used by fleet “近7天微逆故障”. */
  async listInverterFaultMasksForDevices({
    deviceIds,
    startAt,
    endAt
  }: {
    deviceIds: number[]
    startAt: Date
    endAt: Date
  }) {
    if (!deviceIds.length) return []
    return this.db.telemetry.findMany({
      where: {
        deviceId: { in: deviceIds },
        inverterId: { not: null },
        metricKey: { contains: 'fault' },
        reportedAt: { gte: startAt, lte: endAt },
        valueNumber: { not: null, gt: 0 }
      },
      select: {
        deviceId: true,
        valueNumber: true
      }
    })
  }

  async getLatestReportedAt({
    deviceSn,
    inverterIndex
  }: {
    deviceSn: string
    inverterIndex?: number | null
  }) {
    const device = await this.db.device.findUnique({ where: { deviceSn }, select: { id: true } })
    if (!device) return null

    let inverterId: number | null | undefined
    if (inverterIndex) {
      const binding = await this.db.inverterBinding.findFirst({
        where: { deviceId: device.id, inverterIndex },
        select: { id: true }
      })
      if (!binding) return null
      inverterId = binding.id
    }

    const row = await this.db.telemetry.findFirst({
      where: {
        deviceId: device.id,
        ...(inverterId !== undefined ? { inverterId } : {})
      },
      orderBy: { reportedAt: 'desc' },
      select: { reportedAt: true }
    })
    return row?.reportedAt ?? null
  }

  async getLatestBefore({
    deviceSn,
    metricKey,
    inverterIndex,
    beforeAt
  }: {
    deviceSn: string
    metricKey: string
    inverterIndex?: number | null
    beforeAt: Date
  }) {
    const device = await this.db.device.findUnique({ where: { deviceSn }, select: { id: true } })
    if (!device) {
      return null
    }

    let inverterId: number | null = null
    if (inverterIndex) {
      const binding = await this.db.inverterBinding.findFirst({
        where: { deviceId: device.id, inverterIndex },
        select: { id: true }
      })
      if (!binding) return null
      inverterId = binding.id
    }

    return this.db.telemetry.findFirst({
      where: {
        deviceId: device.id,
        inverterId,
        metricKey,
        reportedAt: {
          lte: beforeAt
        }
      },
      orderBy: { reportedAt: 'desc' }
    })
  }

  async getLatestBeforeMetricContains({
    deviceSn,
    metricKeyContains,
    inverterIndex,
    beforeAt
  }: {
    deviceSn: string
    metricKeyContains: string
    inverterIndex?: number | null
    beforeAt: Date
  }) {
    const device = await this.db.device.findUnique({ where: { deviceSn }, select: { id: true } })
    if (!device) return null

    let inverterId: number | null = null
    if (inverterIndex) {
      const binding = await this.db.inverterBinding.findFirst({
        where: { deviceId: device.id, inverterIndex },
        select: { id: true }
      })
      if (!binding) return null
      inverterId = binding.id
    }

    return this.db.telemetry.findFirst({
      where: { deviceId: device.id, inverterId, metricKey: { contains: metricKeyContains }, reportedAt: { lte: beforeAt } },
      orderBy: [{ reportedAt: 'desc' }, { id: 'desc' }]
    })
  }
}
