import { PrismaClient } from '@prisma/client'
import { withSqliteBusyTimeout } from '@/src/lib/sqlite-url'

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

function createPrismaClient() {
  const rawUrl = process.env.APP_DATABASE_URL
  const url = rawUrl ? withSqliteBusyTimeout(rawUrl) : undefined
  return new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
    ...(url ? { datasources: { db: { url } } } : {})
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
