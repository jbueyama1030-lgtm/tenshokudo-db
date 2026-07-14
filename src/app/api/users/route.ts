import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, chatworkAccountId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json(users)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { name, email, password, role, chatworkAccountId } = body

  if (!name || !email || !password) {
    return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: "このメールアドレスは既に登録されています" }, { status: 400 })
  }

  const hashedPassword = await bcrypt.hash(password, 12)

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: role || "sales",
      chatworkAccountId: chatworkAccountId || null,
    },
    select: { id: true, name: true, email: true, role: true, chatworkAccountId: true, createdAt: true },
  })

  return NextResponse.json(user)
}

// PATCH: 既存ユーザーの ChatWorkアカウントID を更新
export async function PATCH(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { id, chatworkAccountId } = body

  if (!id) {
    return NextResponse.json({ error: "ユーザーIDが必要です" }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id },
    data: { chatworkAccountId: chatworkAccountId || null },
    select: { id: true, name: true, email: true, role: true, chatworkAccountId: true, createdAt: true },
  })

  return NextResponse.json(user)
}