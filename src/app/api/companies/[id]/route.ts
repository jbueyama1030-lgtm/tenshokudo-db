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
  // 制作ロールは企業データを編集不可（閲覧のみ）
  if (session.user.role === "production") {
    return NextResponse.json({ error: "制作ロールは企業データを編集できません" }, { status: 403 })
  }

  // 送られてきたキーだけ更新する（部分更新対応）
  const data: Record<string, unknown> = {}

  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key)

  // 文字列系（空文字は null に）
  if (has("name")) data.name = body.name
  if (has("companyId")) data.companyId = body.companyId || null
  if (has("status")) data.status = body.status
  if (has("media")) data.media = body.media || null
  if (has("phone")) data.phone = body.phone || null
  if (has("contactPerson")) data.contactPerson = body.contactPerson || null
  if (has("contactPosition")) data.contactPosition = body.contactPosition || null
  if (has("address")) data.address = body.address || null
  if (has("memo")) data.memo = body.memo || null
  if (has("adoptionChallenge")) data.adoptionChallenge = body.adoptionChallenge || null
  if (has("dispatchRatio")) data.dispatchRatio = body.dispatchRatio || null
  if (has("planName")) data.planName = body.planName || null
  if (has("discountNote")) data.discountNote = body.discountNote || null
  if (has("contractNote")) data.contractNote = body.contractNote || null
  if (has("websiteUrl")) data.websiteUrl = body.websiteUrl || null
  if (has("temperature")) data.temperature = body.temperature || null
  if (has("negotiationMemo")) data.negotiationMemo = body.negotiationMemo || null
  if (has("nextAction")) data.nextAction = body.nextAction || null

  // 担当者（salesは変更不可）
  if (has("userId") && session.user.role !== "sales") data.userId = body.userId

  // 数値系
  if (has("applyCount")) data.applyCount = body.applyCount ?? 0
  if (has("hireCount")) data.hireCount = body.hireCount ?? 0
  if (has("vehicleCount")) data.vehicleCount = body.vehicleCount != null ? Number(body.vehicleCount) : null
  if (has("driverCount")) data.driverCount = body.driverCount != null ? Number(body.driverCount) : null
  if (has("annualHiringTarget")) data.annualHiringTarget = body.annualHiringTarget != null ? Number(body.annualHiringTarget) : null
  if (has("tenshokudoCostPerHire")) data.tenshokudoCostPerHire = body.tenshokudoCostPerHire != null ? Number(body.tenshokudoCostPerHire) : null
  if (has("monthlyFee")) data.monthlyFee = body.monthlyFee != null ? Number(body.monthlyFee) : null
  if (has("discountRate")) data.discountRate = body.discountRate != null ? Number(body.discountRate) : null
  if (has("workplaceCertLevel")) data.workplaceCertLevel = body.workplaceCertLevel != null ? Number(body.workplaceCertLevel) : 0

  // 配列系
  if (has("persona")) data.persona = body.persona ?? []
  if (has("apps")) data.apps = body.apps ?? []
  if (has("shifts")) data.shifts = body.shifts ?? []
  if (has("competitorMedia")) data.competitorMedia = body.competitorMedia ?? []
  if (has("options")) data.options = body.options ?? []

  // 日付系
  if (has("nextActionDate")) data.nextActionDate = body.nextActionDate ? new Date(body.nextActionDate) : null
  if (has("contractStart")) data.contractStart = body.contractStart ? new Date(body.contractStart) : null
  if (has("contractRenewal")) data.contractRenewal = body.contractRenewal ? new Date(body.contractRenewal) : null

  // JSON系
  if (has("driverSales")) data.driverSales = body.driverSales ?? null

  // ===== 人材紹介（キャリアアドバイザー向け） =====
  if (has("hasReferralContract")) data.hasReferralContract = Boolean(body.hasReferralContract)
  if (has("referralFees")) data.referralFees = body.referralFees ?? []

  // 受け入れ条件（3択: "ok" / "ng" / "consult" / null）
  const CONDITION_3 = [
    "condWorkSide", "condFemale", "condLgbtq", "condForeign",
    "condSpecialTrain", "condAge64", "condTattoo", "condAccident",
  ]
  for (const key of CONDITION_3) {
    if (has(key)) data[key] = body[key] || null
  }

  // 受け入れ条件（2択: true / false / null）
  const CONDITION_2 = [
    "condDorm", "condHousingSupport", "condFemaleFacility",
    "condJobChangeLimit", "condGuarantor",
  ]
  for (const key of CONDITION_2) {
    if (has(key)) data[key] = body[key] === null || body[key] === "" ? null : Boolean(body[key])
  }

  // 受け入れ条件（自由記入）
  const CONDITION_TEXT = [
    "condAgeRange", "condRetirementAge", "condIdealPerson",
    "condHiringStandard", "condAppearance", "condMedicalHistory", "condNote",
  ]
  for (const key of CONDITION_TEXT) {
    if (has(key)) data[key] = body[key] || null
  }

  const company = await prisma.company.update({
    where: { id },
    data,
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
  // 制作ロールは企業を削除不可
  if (session.user.role === "production") {
    return NextResponse.json({ error: "制作ロールは企業を削除できません" }, { status: 403 })
  }

  await prisma.company.delete({ where: { id } })
  return NextResponse.json({ success: true })
}