import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import { canEditCompanyFull } from "@/lib/permissions"
import { recalcCompanyStatus } from "@/lib/contractStatus"

const prisma = new PrismaClient()

async function assertCanEdit(session: Parameters<typeof canEditCompanyFull>[0], companyId: string) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { userId: true } })
  if (!company) return { ok: false as const, status: 404, error: "企業が見つかりません" }
  if (!canEditCompanyFull(session, company.userId)) {
    return { ok: false as const, status: 403, error: "編集権限がありません" }
  }
  return { ok: true as const }
}

// 契約期間を編集（解約日入力を含む）
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; periodId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "未認証です" }, { status: 401 })

  const { id, periodId } = await params
  const check = await assertCanEdit(session, id)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

  const body = await req.json()

  const updated = await prisma.contractPeriod.update({
    where: { id: periodId },
    data: {
      externalId: body.externalId ?? undefined,
      contractStart: body.contractStart !== undefined ? (body.contractStart ? new Date(body.contractStart) : null) : undefined,
      contractRenewal: body.contractRenewal !== undefined ? (body.contractRenewal ? new Date(body.contractRenewal) : null) : undefined,
      contractEnd: body.contractEnd !== undefined ? (body.contractEnd ? new Date(body.contractEnd) : null) : undefined,
      planName: body.planName ?? undefined,
      monthlyFee: body.monthlyFee !== undefined ? (body.monthlyFee !== "" && body.monthlyFee != null ? Number(body.monthlyFee) : null) : undefined,
      discountRate: body.discountRate !== undefined ? (body.discountRate !== "" && body.discountRate != null ? Number(body.discountRate) : null) : undefined,
      discountNote: body.discountNote ?? undefined,
      options: body.options ?? undefined,
      contractNote: body.contractNote ?? undefined,
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
  const check = await assertCanEdit(session, id)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

  await prisma.contractPeriod.delete({ where: { id: periodId } })
  await recalcCompanyStatus(prisma, id)
  return NextResponse.json({ ok: true })
}