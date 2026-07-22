import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import { canCreateCompany } from "@/lib/permissions"

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

  if (!canCreateCompany(session)) {
    return NextResponse.json({ error: "企業を追加する権限がありません" }, { status: 403 })
  }

  const body = await request.json()

  if (!body.name) return NextResponse.json({ error: "会社名は必須です" }, { status: 400 })

  const company = await prisma.company.create({
    data: {
      // 基本情報
      name: body.name,
      companyId: body.companyId || null,
      status: body.status || "approaching",
      userId: body.userId || session.user.id,
      phone: body.phone || null,
      address: body.address || null,
      persona: body.persona ?? [],
      media: body.media || null,
      memo: body.memo || null,

      // 企業情報
      vehicleCount: body.vehicleCount ? Number(body.vehicleCount) : null,
      driverCount: body.driverCount ? Number(body.driverCount) : null,
      annualHiringTarget: body.annualHiringTarget ? Number(body.annualHiringTarget) : null,
      adoptionChallenge: body.adoptionChallenge || null,
      apps: body.apps ?? [],
      dispatchRatio: body.dispatchRatio || null,
      shifts: body.shifts ?? [],

      // 競合媒体
      competitorMedia: body.competitorMedia ?? [],
      tenshokudoCostPerHire: body.tenshokudoCostPerHire ? Number(body.tenshokudoCostPerHire) : null,

      // 売上管理
      planName: body.planName || null,
      monthlyFee: body.monthlyFee ? Number(body.monthlyFee) : null,
      discountRate: body.discountRate ? Number(body.discountRate) : null,
      discountNote: body.discountNote || null,
      options: body.options ?? [],
      contractStart: body.contractStart ? new Date(body.contractStart) : null,
      contractRenewal: body.contractRenewal ? new Date(body.contractRenewal) : null,

      // 商談管理
      temperature: body.temperature || null,
      negotiationMemo: body.negotiationMemo || null,
      nextAction: body.nextAction || null,
      nextActionDate: body.nextActionDate ? new Date(body.nextActionDate) : null,

      // 実績
      applyCount: body.applyCount ?? 0,
      hireCount: body.hireCount ?? 0,
    },
    include: { user: { select: { id: true, name: true } } },
  })

  return NextResponse.json(company)
}