import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { rows } = await req.json()

  // ユーザー一覧取得（名前→IDマップ）
  const users = await prisma.user.findMany({ select: { id: true, name: true } })
  const userMap: Record<string, string> = {}
  users.forEach(u => { userMap[u.name] = u.id })

  // adminのID取得（デフォルト担当）
  const admin = await prisma.user.findFirst({ where: { role: "admin" } })
  const defaultUserId = admin?.id ?? users[0]?.id

  const results = { success: 0, skip: 0, error: 0 }

  for (const row of rows) {
    const [companyId, name, , , , , address, , tantou] = row
    if (!name?.trim()) continue

    const userId = userMap[tantou?.trim()] ?? defaultUserId

    try {
      await prisma.company.upsert({
        where: { companyId: companyId?.trim() || `import-${Date.now()}-${Math.random()}` },
        update: { name: name.trim(), address: address?.trim() || null, userId },
        create: {
          companyId: companyId?.trim() || null,
          name: name.trim(),
          status: "contracted",
          address: address?.trim() || null,
          userId,
        },
      })
      results.success++
    } catch {
      results.error++
    }
  }

  return NextResponse.json(results)
}