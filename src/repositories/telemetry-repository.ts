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
  ) {
    const results = await this.db.$transaction(async (tx) => {
      const savedRows = []

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

        const created = await tx.telemetry.create({
          data: {
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
        })

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

        const latest = await tx.deviceLatest.findFirst({
          where: { deviceId: device.id, inverterId, metricKey: row.metricKey },
          select: { id: true }
        })
        const latestData = {
            valueNumber: row.valueNumber ?? null,
            valueText: row.valueText ?? null,
            reportedAt: row.reportedAt,
            receivedAt: row.receivedAt
        }
        if (latest) {
          await tx.deviceLatest.update({ where: { id: latest.id }, data: latestData })
        } else {
          await tx.deviceLatest.create({ data: {
            deviceId: device.id,
            inverterId,
            metricKey: row.metricKey,
            ...latestData
          } })
        }

        savedRows.push(created)
      }

      return savedRows
    })

    return results
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
