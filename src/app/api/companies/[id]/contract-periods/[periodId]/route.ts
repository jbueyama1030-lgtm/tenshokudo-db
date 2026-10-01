// 置き場所: src/app/api/companies/[id]/contract-periods/[periodId]/route.ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { canEditCompanyFull, isInAgencyScope } from "@/lib/permissions"
import { recalcCompanyStatus } from "@/lib/contractStatus"

const END_REASONS = ["cancel", "plan_change"]

function parseIntOrNull(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

// 企業の権限と、periodId が本当にその企業のものかを両方チェックする
async function assertCanEdit(
  session: Parameters<typeof canEditCompanyFull>[0],
  companyId: string,
  periodId: string
) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { userId: true, agencyId: true },
  })
  if (!company) return { ok: false as const, status: 404, error: "企業が見つかりません" }

  // 代理店スコープ外は存在ごと隠す
  if (!isInAgencyScope(session, company.agencyId)) {
    return { ok: false as const, status: 404, error: "企業が見つかりません" }
  }

  if (!canEditCompanyFull(session, company.userId)) {
    return { ok: false as const, status: 403, error: "編集権限がありません" }
  }

  // URLの企業IDと契約期間の所属が一致しているか（他企業の期間を書き換えられないように）
  const period = await prisma.contractPeriod.findUnique({
    where: { id: periodId },
    select: { companyId: true },
  })
  if (!period || period.companyId !== companyId) {
    return { ok: false as const, status: 404, error: "契約期間が見つかりません" }
  }

  return { ok: true as const }
}

// 契約期間を編集（終了日・終了理由・売上の手入力を含む）
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; periodId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "未認証です" }, { status: 401 })

  const { id, periodId } = await params
  const check = await assertCanEdit(session, id, periodId)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

  const body = await req.json()

  // 終了日を消したら終了理由も消す。終了日があれば理由（未指定なら解約）を入れる
  let endReason: string | null | undefined = undefined
  if (body.contractEnd !== undefined) {
    endReason = body.contractEnd
      ? (typeof body.endReason === "string" && END_REASONS.includes(body.endReason) ? body.endReason : "cancel")
      : null
  } else if (body.endReason !== undefined) {
    endReason = typeof body.endReason === "string" && END_REASONS.includes(body.endReason) ? body.endReason : null
  }

  const updated = await prisma.contractPeriod.update({
    where: { id: periodId },
    data: {
      externalId: body.externalId ?? undefined,
      contractStart: body.contractStart !== undefined ? (body.contractStart ? new Date(body.contractStart) : null) : undefined,
      contractRenewal: body.contractRenewal !== undefined ? (body.contractRenewal ? new Date(body.contractRenewal) : null) : undefined,
      contractEnd: body.contractEnd !== undefined ? (body.contractEnd ? new Date(body.contractEnd) : null) : undefined,
      endReason,
      planName: body.planName ?? undefined,
      monthlyFee: body.monthlyFee !== undefined ? parseIntOrNull(body.monthlyFee) : undefined,
      discountRate: body.discountRate !== undefined ? (body.discountRate !== "" && body.discountRate != null ? Number(body.discountRate) : null) : undefined,
      discountNote: body.discountNote ?? undefined,
      options: body.options ?? undefined,
      contractNote: body.contractNote ?? undefined,
      revenueOverride: body.revenueOverride !== undefined ? parseIntOrNull(body.revenueOverride) : undefined,
    },
  })

  await recalcCompanyStatus(prisma, id)
  return NextResponse.json(updated)
}

// 契約期間を削除
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; periodId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "未認証です" }, { status: 401 })

  const { id, periodId } = await params
  const check = await assertCanEdit(session, id, periodId)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

  await prisma.contractPeriod.delete({ where: { id: periodId } })
  await recalcCompanyStatus(prisma, id)
  return NextResponse.json({ ok: true })
}
