// 置き場所: src/app/api/companies/[id]/proposal/insight/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { isInAgencyScope } from "@/lib/permissions"
import { resolvePeriod } from "@/lib/reportPeriod"
import { buildProposalData, PROPOSAL_DEFAULT_MONTHS, writeProposalInsight } from "@/lib/proposal"

/** 新規提案のAI所見。body: { from, to }。数字はサーバー側で集計し直す */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AIのAPIキーが設定されていません（ANTHROPIC_API_KEY）" }, { status: 503 })
  }

  const { id } = await params
  const company = await prisma.company.findUnique({ where: { id }, select: { id: true, agencyId: true } })
  if (!company || !isInAgencyScope(session, company.agencyId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const resolved = await resolvePeriod(body?.from, body?.to, PROPOSAL_DEFAULT_MONTHS)
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  try {
    const data = await buildProposalData(company.id, resolved.period)
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(await writeProposalInsight(data))
  } catch (e) {
    console.error("[proposal/insight] failed", e)
    return NextResponse.json({ error: "所見の生成に失敗しました。時間をおいて再度お試しください" }, { status: 500 })
  }
}
