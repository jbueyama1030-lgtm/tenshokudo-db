import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companies = await prisma.company.findMany({
    include: { user: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  })

  return NextResponse.json(companies)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { name, companyId, status, persona, media, phone, address, memo } = body

  if (!name) return NextResponse.json({ error: "会社名は必須です" }, { status: 400 })

  const company = await prisma.company.create({
    data: {
      name,
      companyId: companyId || null,
      status: status || "approaching",
      persona: persona || [],
      media: media || null,
      phone: phone || null,
      address: address || null,
      memo: memo || null,
      userId: session.user.id,
    },
  })

  return NextResponse.json(company)
}