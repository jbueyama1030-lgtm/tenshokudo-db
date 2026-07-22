import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import { canEditCompanyFull, canEditReferralOnly, canDeleteCompany, REFERRAL_FIELDS } from "@/lib/permissions"

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

  const canFull = canEditCompanyFull(session, existing.userId)
  const canReferral = canEditReferralOnly(session, existing.userId)

  if (!canFull && !canReferral) {
    return NextResponse.json({ error: "この企業を編集する権限がありません" }, { status: 403 })
  }

  // advisor（紹介項目のみ編集可）の場合、送られてきたキーを紹介系だけに絞る
  // 画面側で隠していても直接APIを叩かれる可能性があるため、サーバー側で必ず制限する
  let payload = body
  if (!canFull && canReferral) {
    const filtered: Record<string, unknown> = {}
    for (const key of REFERRAL_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        filtered[key] = body[key]
      }
    }
    payload = filtered
  }

  // 送られてきたキーだけ更新する（部分更新対応）
  const data: Record<string, unknown> = {}
  const has = (key: string) => Object.prototype.hasOwnProperty.call(payload, key)

  // 文字列系（空文字は null に）
  if (has("name")) data.name = payload.name
  if (has("companyId")) data.companyId = payload.companyId || null
  if (has("status")) data.status = payload.status
  if (has("media")) data.media = payload.media || null
  if (has("phone")) data.phone = payload.phone || null
  if (has("contactPerson")) data.contactPerson = payload.contactPerson || null
  if (has("contactPosition")) data.contactPosition = payload.contactPosition || null
  if (has("address")) data.address = payload.address || null
  if (has("memo")) data.memo = payload.memo || null
  if (has("adoptionChallenge")) data.adoptionChallenge = payload.adoptionChallenge || null
  if (has("dispatchRatio")) data.dispatchRatio = payload.dispatchRatio || null
  if (has("planName")) data.planName = payload.planName || null
  if (has("discountNote")) data.discountNote = payload.discountNote || null
  if (has("contractNote")) data.contractNote = payload.contractNote || null
  if (has("websiteUrl")) data.websiteUrl = payload.websiteUrl || null
  if (has("temperature")) data.temperature = payload.temperature || null
  if (has("negotiationMemo")) data.negotiationMemo = payload.negotiationMemo || null
  if (has("nextAction")) data.nextAction = payload.nextAction || null

  // 担当者（全項目編集できる人のみ、かつ営業は変更不可）
  if (has("userId") && canFull && !session.user.roles?.includes("sales")) {
    data.userId = payload.userId
  }

  // 数値系
  if (has("applyCount")) data.applyCount = payload.applyCount ?? 0
  if (has("hireCount")) data.hireCount = payload.hireCount ?? 0
  if (has("vehicleCount")) data.vehicleCount = payload.vehicleCount != null ? Number(payload.vehicleCount) : null
  if (has("driverCount")) data.driverCount = payload.driverCount != null ? Number(payload.driverCount) : null
  if (has("annualHiringTarget")) data.annualHiringTarget = payload.annualHiringTarget != null ? Number(payload.annualHiringTarget) : null
  if (has("tenshokudoCostPerHire")) data.tenshokudoCostPerHire = payload.tenshokudoCostPerHire != null ? Number(payload.tenshokudoCostPerHire) : null
  if (has("monthlyFee")) data.monthlyFee = payload.monthlyFee != null ? Number(payload.monthlyFee) : null
  if (has("discountRate")) data.discountRate = payload.discountRate != null ? Number(payload.discountRate) : null
  if (has("workplaceCertLevel")) data.workplaceCertLevel = payload.workplaceCertLevel != null ? Number(payload.workplaceCertLevel) : 0

  // 配列系
  if (has("persona")) data.persona = payload.persona ?? []
  if (has("apps")) data.apps = payload.apps ?? []
  if (has("shifts")) data.shifts = payload.shifts ?? []
  if (has("competitorMedia")) data.competitorMedia = payload.competitorMedia ?? []
  if (has("options")) data.options = payload.options ?? []

  // 日付系
  if (has("nextActionDate")) data.nextActionDate = payload.nextActionDate ? new Date(payload.nextActionDate) : null
  if (has("contractStart")) data.contractStart = payload.contractStart ? new Date(payload.contractStart) : null
  if (has("contractRenewal")) data.contractRenewal = payload.contractRenewal ? new Date(payload.contractRenewal) : null

  // JSON系
  if (has("driverSales")) data.driverSales = payload.driverSales ?? null

  // ===== 人材紹介（キャリアアドバイザー向け） =====
  if (has("hasReferralContract")) data.hasReferralContract = Boolean(payload.hasReferralContract)
  if (has("referralFees")) data.referralFees = payload.referralFees ?? []

  const CONDITION_3 = [
    "condWorkSide", "condFemale", "condLgbtq", "condForeign",
    "condSpecialTrain", "condAge64", "condTattoo", "condAccident",
  ]
  for (const key of CONDITION_3) {
    if (has(key)) data[key] = payload[key] || null
  }

  const CONDITION_2 = [
    "condDorm", "condHousingSupport", "condFemaleFacility",
    "condJobChangeLimit", "condGuarantor",
  ]
  for (const key of CONDITION_2) {
    if (has(key)) data[key] = payload[key] === null || payload[key] === "" ? null : Boolean(payload[key])
  }

  const CONDITION_TEXT = [
    "condAgeRange", "condRetirementAge", "condIdealPerson",
    "condHiringStandard", "condAppearance", "condMedicalHistory", "condNote",
  ]
  for (const key of CONDITION_TEXT) {
    if (has(key)) data[key] = payload[key] || null
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

  if (!canDeleteCompany(session, existing.userId)) {
    return NextResponse.json({ error: "この企業を削除する権限がありません" }, { status: 403 })
  }

  await prisma.company.delete({ where: { id } })
  return NextResponse.json({ success: true })
}