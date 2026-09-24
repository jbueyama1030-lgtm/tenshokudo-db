import { PrismaClient } from "@prisma/client"

/**
 * PrismaClient のシングルトン。
 * 開発時はホットリロードのたびに new PrismaClient() されて接続が増えるため、
 * globalThis に保持して使い回す。
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}