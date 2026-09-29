// 置き場所: src/app/api/companies/[id]/article-review/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { isAgencyUser, isInAgencyScope } from "@/lib/permissions"
import { resolvePeriod } from "@/lib/reportPeriod"
import { buildArticleReviewData, REVIEW_DEFAULT_MONTHS } from "@/lib/articleReview"

/**
 * 記事改善（社内向け）のデータ。商談メモ・制作タスクを含むため代理店ユーザーには出さない。
 * query: from=YYYY-MM, to=YYYY-MM（省略時は先月までの6ヶ月）
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (isAgencyUser(session)) {
    return NextResponse.json({ error: "記事改善レポートは社内向けのため表示できません" }, { status: 403 })
  }

  const { id } = await params
  const company = await prisma.company.findUnique({ where: { id }, select: { id: true, agencyId: true } })
  if (!company || !isInAgencyScope(session, company.agencyId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const sp = new URL(req.url).searchParams
  const resolved = await resolvePeriod(sp.get("from"), sp.get("to"), REVIEW_DEFAULT_MONTHS)
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  try {
    const data = await buildArticleReviewData(company.id, resolved.period)
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(data)
  } catch (e) {
    console.error("[article-review] failed", e)
    return NextResponse.json({ error: "記事改善データの集計に失敗しました" }, { status: 500 })
  }
}
