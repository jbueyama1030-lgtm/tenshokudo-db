import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const company = await prisma.company.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true } } },
  })

  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(company)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const company = await prisma.company.update({
    where: { id },
    data: {
      name: body.name,
      companyId: body.companyId || null,
      status: body.status,
      persona: body.persona ?? [],
      media: body.media || null,
      phone: body.phone || null,
      address: body.address || null,
      memo: body.memo || null,
      applyCount: body.applyCount ?? 0,
      hireCount: body.hireCount ?? 0,
    },
    include: { user: { select: { id: true, name: true } } },
  })

  return NextResponse.json(company)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  await prisma.company.delete({ where: { id } })
  return NextResponse.json({ success: true })
}