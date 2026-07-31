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
      // Same device/metric/time can arrive from different Mongo docs; keep last in-batch.
      const deduped = new Map<string, (typeof rows)[number]>()
      for (const row of rows) {
        const key = `${row.deviceSn}|${row.inverterIndex ?? 0}|${row.metricKey}|${row.reportedAt.toISOString()}`
        deduped.set(key, row)
      }

      for (const row of deduped.values()) {
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

        const valueUpdate = {
          valueNumber: telemetryData.valueNumber,
          valueText: telemetryData.valueText,
          receivedAt: telemetryData.receivedAt,
          metricKey: telemetryData.metricKey,
          siid: telemetryData.siid,
          piid: telemetryData.piid,
          inverterId: telemetryData.inverterId,
          reportedAt: telemetryData.reportedAt
        }

        let created
        const bySource = await tx.telemetry.findUnique({ where: { sourceRecordId: row.sourceRecordId } })
        if (bySource) {
          created = await tx.telemetry.update({ where: { id: bySource.id }, data: valueUpdate })
        } else {
          const byNatural = await tx.telemetry.findFirst({
            where: {
              deviceId: device.id,
              inverterId,
              metricKey: row.metricKey,
              reportedAt: row.reportedAt
            }
          })
          if (byNatural) {
            // Keep existing sourceRecordId to avoid unique collisions across re-syncs.
            created = await tx.telemetry.update({
              where: { id: byNatural.id },
              data: {
                valueNumber: valueUpdate.valueNumber,
                valueText: valueUpdate.valueText,
                receivedAt: valueUpdate.receivedAt,
                siid: valueUpdate.siid,
                piid: valueUpdate.piid
              }
            })
          } else {
            try {
              created = await tx.telemetry.create({ data: telemetryData })
            } catch (error) {
              if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
                throw error
              }
              const raced = await tx.telemetry.findFirst({
                where: {
                  deviceId: device.id,
                  inverterId,
                  metricKey: row.metricKey,
                  reportedAt: row.reportedAt
                }
              })
              if (!raced) throw error
              created = await tx.telemetry.update({
                where: { id: raced.id },
                data: {
                  valueNumber: valueUpdate.valueNumber,
                  valueText: valueUpdate.valueText,
                  receivedAt: valueUpdate.receivedAt,
                  siid: valueUpdate.siid,
                  piid: valueUpdate.piid
                }
              })
            }
          }
        }

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
          select: { id: true, reportedAt: true }
        })
        const latestData = {
            valueNumber: row.valueNumber ?? null,
            valueText: row.valueText ?? null,
            reportedAt: row.reportedAt,
            receivedAt: row.receivedAt
        }
        // Imports are not guaranteed to be chronological. Keep the newest
        // observation rather than letting a later-processed historical row
        // overwrite the current dashboard value.
        if (latest && row.reportedAt >= latest.reportedAt) {
          await tx.deviceLatest.update({ where: { id: latest.id }, data: latestData })
        } else if (!latest) {
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
