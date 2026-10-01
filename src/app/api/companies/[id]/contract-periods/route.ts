// 置き場所: src/app/api/companies/[id]/contract-periods/route.ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { canEditCompanyFull, isInAgencyScope } from "@/lib/permissions"
import { recalcCompanyStatus } from "@/lib/contractStatus"

const END_REASONS = ["cancel", "plan_change"]

/** 終了理由は終了日があるときだけ保存する */
function parseEndReason(v: unknown, hasEnd: boolean): string | null {
  if (!hasEnd) return null
  return typeof v === "string" && END_REASONS.includes(v) ? v : "cancel"
}

function parseIntOrNull(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

// その企業の契約期間を新しい順で返す
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "未認証です" }, { status: 401 })

  const { id } = await params

  // 親企業が閲覧範囲外なら存在ごと隠す
  const company = await prisma.company.findUnique({ where: { id }, select: { agencyId: true } })
  if (!company) return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 })
  if (!isInAgencyScope(session, company.agencyId)) {
    return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 })
  }

  const periods = await prisma.contractPeriod.findMany({
    where: { companyId: id },
    orderBy: [{ contractStart: "desc" }],
  })
  return NextResponse.json(periods)
}

// 契約期間を追加
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "未認証です" }, { status: 401 })

  const { id } = await params

  // 掲載契約の編集は全項目編集権限に準じる
  const company = await prisma.company.findUnique({ where: { id }, select: { userId: true, agencyId: true } })
  if (!company) return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 })
  if (!isInAgencyScope(session, company.agencyId)) {
    return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 })
  }
  if (!canEditCompanyFull(session, company.userId)) {
    return NextResponse.json({ error: "編集権限がありません" }, { status: 403 })
  }

  const body = await req.json()

  const created = await prisma.contractPeriod.create({
    data: {
      companyId: id,
      externalId: body.externalId || null,
      status: "contracted",
      contractStart: body.contractStart ? new Date(body.contractStart) : null,
      contractRenewal: body.contractRenewal ? new Date(body.contractRenewal) : null,
      contractEnd: body.contractEnd ? new Date(body.contractEnd) : null,
      endReason: parseEndReason(body.endReason, !!body.contractEnd),
      planName: body.planName || null,
      monthlyFee: parseIntOrNull(body.monthlyFee),
      discountRate: body.discountRate != null && body.discountRate !== "" ? Number(body.discountRate) : null,
      discountNote: body.discountNote || null,
      options: body.options ?? undefined,
      contractNote: body.contractNote || null,
      revenueOverride: parseIntOrNull(body.revenueOverride),
    },
  })

  await recalcCompanyStatus(prisma, id)
  return NextResponse.json(created)
}
