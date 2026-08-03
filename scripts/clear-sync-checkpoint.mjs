import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
try {
  const result = await prisma.syncCheckpoint.deleteMany({ where: { sourceName: 'mongo-device-log' } })
  console.log(`[checkpoint] cleared ${result.count} row(s)`)
} finally {
  await prisma.$disconnect()
}
