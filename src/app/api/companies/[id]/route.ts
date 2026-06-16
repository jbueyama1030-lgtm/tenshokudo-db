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
    include: {
      user: { select: { id: true, name: true } },
      monthlyRecords: {
        orderBy: [{ year: "asc" }, { month: "asc" }],
      },
    },
  })

  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(company)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const existing = await prisma.company.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // salesロールは自分担当のみ編集可
  if (session.user.role === "sales" && existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const company = await prisma.company.update({
    where: { id },
    data: {
      name: body.name,
      companyId: body.companyId || null,
      status: body.status,
      // salesは担当者変更不可
      userId: session.user.role === "sales" ? existing.userId : body.userId,
      persona: body.persona ?? [],
      media: body.media || null,
      phone: body.phone || null,
      address: body.address || null,
      memo: body.memo || null,
      applyCount: body.applyCount ?? 0,
      hireCount: body.hireCount ?? 0,
      temperature: body.temperature || null,
      negotiationMemo: body.negotiationMemo || null,
      nextAction: body.nextAction || null,
      nextActionDate: body.nextActionDate ? new Date(body.nextActionDate) : null,
      vehicleCount: body.vehicleCount != null ? Number(body.vehicleCount) : null,
      driverCount: body.driverCount != null ? Number(body.driverCount) : null,
      annualHiringTarget: body.annualHiringTarget != null ? Number(body.annualHiringTarget) : null,
      adoptionChallenge: body.adoptionChallenge || null,
      apps: body.apps ?? [],
      dispatchRatio: body.dispatchRatio || null,
      shifts: body.shifts ?? [],
      competitorMedia: body.competitorMedia ?? [],
      tenshokudoCostPerHire: body.tenshokudoCostPerHire != null ? Number(body.tenshokudoCostPerHire) : null,
      planName: body.planName || null,
      monthlyFee: body.monthlyFee != null ? Number(body.monthlyFee) : null,
      discountRate: body.discountRate != null ? Number(body.discountRate) : null,
      discountNote: body.discountNote || null,
      options: body.options ?? [],
      contractStart: body.contractStart ? new Date(body.contractStart) : null,
      contractRenewal: body.contractRenewal ? new Date(body.contractRenewal) : null,
      driverSales: body.driverSales ?? null,
    },
    include: { user: { select: { id: true, name: true } } },
  })

  return NextResponse.json(company)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const existing = await prisma.company.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // salesロールは自分担当のみ削除可
  if (session.user.role === "sales" && existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.company.delete({ where: { id } })
  return NextResponse.json({ success: true })
}