import { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/src/lib/prisma'

export interface DeviceWithSummary {
  id: number
  deviceSn: string
  productModel: string | null
  platformOnline: boolean
  lastReportedAt: Date | null
  inverterCount: number
}

export class DeviceRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async findMany({ page, pageSize }: { page: number; pageSize: number }) {
    const [items, total] = await Promise.all([
      this.db.device.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          inverterBindings: {
            where: { paired: true }
          }
        },
        orderBy: [{ deviceSn: 'asc' }]
      }),
      this.db.device.count()
    ])

    return {
      total,
      items: items.map((item) => ({
        id: item.id,
        deviceSn: item.deviceSn,
        productModel: item.productModel,
        platformOnline: item.platformOnline,
        lastReportedAt: item.lastReportedAt,
        inverterCount: item.inverterBindings.length
      })) as DeviceWithSummary[]
    }
  }

  async findManyWithKeyword({
    page,
    pageSize,
    keyword
  }: {
    page: number
    pageSize: number
    keyword?: string
  }) {
    const where = keyword
      ? {
          deviceSn: {
            contains: keyword
          }
        }
      : {}

    const [items, total] = await Promise.all([
      this.db.device.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          inverterBindings: {
            where: { paired: true }
          }
        },
        orderBy: [{ deviceSn: 'asc' }]
      }),
      this.db.device.count({ where })
    ])

    return {
      total,
      items: items.map((item) => ({
        id: item.id,
        deviceSn: item.deviceSn,
        productModel: item.productModel,
        platformOnline: item.platformOnline,
        lastReportedAt: item.lastReportedAt,
        inverterCount: item.inverterBindings.length
      })) as DeviceWithSummary[]
    }
  }

  async findBySn(deviceSn: string) {
    return this.db.device.findFirst({
      where: { deviceSn },
      include: {
        inverterBindings: {
          where: { paired: true },
          orderBy: { inverterIndex: 'asc' }
        },
        latestRows: {
          where: {
            inverterId: null
          },
          orderBy: {
            reportedAt: 'desc'
          }
        }
      }
    })
  }

  async findHealthSnapshot(deviceSn: string) {
    return this.db.device.findFirst({
      where: { deviceSn },
      include: {
        inverterBindings: {
          where: { paired: true },
          orderBy: { inverterIndex: 'asc' },
          select: {
            id: true,
            inverterIndex: true,
            inverterSn: true
          }
        }
      }
    })
  }

  async upsertDevice(payload: {
    deviceSn: string
    productModel?: string | null
    softwareVersion?: string | null
    hardwareVersion?: string | null
    productConfig?: string | null
    sub1gVersion?: string | null
    sub1gAddress?: string | null
    platformOnline?: boolean | null
    lastReportedAt?: Date | null
    macAddress?: string | null
  }) {
    const data: Prisma.DeviceUncheckedCreateInput = {
      deviceSn: payload.deviceSn,
      productModel: payload.productModel ?? null,
      softwareVersion: payload.softwareVersion ?? null,
      hardwareVersion: payload.hardwareVersion ?? null,
      productConfig: payload.productConfig ?? null,
      sub1gVersion: payload.sub1gVersion ?? null,
      sub1gAddress: payload.sub1gAddress ?? null,
      platformOnline: payload.platformOnline ?? false,
      lastReportedAt: payload.lastReportedAt ?? null,
      macAddress: payload.macAddress ?? null
    }

    return this.db.device.upsert({
      where: { deviceSn: payload.deviceSn },
      update: {
        productModel: payload.productModel ?? null,
        softwareVersion: payload.softwareVersion ?? null,
        hardwareVersion: payload.hardwareVersion ?? null,
        productConfig: payload.productConfig ?? null,
        sub1gVersion: payload.sub1gVersion ?? null,
        sub1gAddress: payload.sub1gAddress ?? null,
        platformOnline: payload.platformOnline ?? false,
        lastReportedAt: payload.lastReportedAt ?? null,
        macAddress: payload.macAddress ?? null,
        updatedAt: new Date()
      },
      create: data
    })
  }

  async findOrCreateInverterBinding(params: {
    deviceId: number
    inverterIndex: number
    inverterSn?: string | null
  }) {
    return this.db.inverterBinding.upsert({
      where: {
        deviceId_inverterIndex: {
          deviceId: params.deviceId,
          inverterIndex: params.inverterIndex
        }
      },
      update: {
        inverterSn: params.inverterSn ?? null
      },
      create: {
        deviceId: params.deviceId,
        inverterIndex: params.inverterIndex,
        inverterSn: params.inverterSn ?? null,
        paired: true
      }
    })
  }

  async count() {
    return this.db.device.count()
  }
}
