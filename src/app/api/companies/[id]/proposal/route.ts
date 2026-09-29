// 置き場所: src/app/api/companies/[id]/proposal/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { isInAgencyScope } from "@/lib/permissions"
import { resolvePeriod } from "@/lib/reportPeriod"
import { buildProposalData, PROPOSAL_DEFAULT_MONTHS } from "@/lib/proposal"

/**
 * 新規提案（未掲載企業向け）のデータ。
 * query: from=YYYY-MM, to=YYYY-MM（省略時は先月までの12ヶ月）
 * 権限: その企業を閲覧できる人なら誰でも（代理店ユーザー含む）
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const company = await prisma.company.findUnique({ where: { id }, select: { id: true, agencyId: true } })
  if (!company || !isInAgencyScope(session, company.agencyId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const sp = new URL(req.url).searchParams
  const resolved = await resolvePeriod(sp.get("from"), sp.get("to"), PROPOSAL_DEFAULT_MONTHS)
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  try {
    const data = await buildProposalData(company.id, resolved.period)
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(data)
  } catch (e) {
    console.error("[proposal] failed", e)
    return NextResponse.json({ error: "提案データの集計に失敗しました" }, { status: 500 })
  }
}
