// 置き場所: src/app/api/companies/[id]/article-review/insight/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { isAgencyUser, isInAgencyScope } from "@/lib/permissions"
import { resolvePeriod } from "@/lib/reportPeriod"
import { buildArticleReviewData, REVIEW_DEFAULT_MONTHS, writeArticleReviewInsight } from "@/lib/articleReview"

/** 記事改善のAI所見（社内向け）。body: { from, to } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (isAgencyUser(session)) {
    return NextResponse.json({ error: "記事改善レポートは社内向けのため利用できません" }, { status: 403 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AIのAPIキーが設定されていません（ANTHROPIC_API_KEY）" }, { status: 503 })
  }

  const { id } = await params
  const company = await prisma.company.findUnique({ where: { id }, select: { id: true, agencyId: true } })
  if (!company || !isInAgencyScope(session, company.agencyId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const resolved = await resolvePeriod(body?.from, body?.to, REVIEW_DEFAULT_MONTHS)
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  try {
    const data = await buildArticleReviewData(company.id, resolved.period)
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(await writeArticleReviewInsight(data))
  } catch (e) {
    console.error("[article-review/insight] failed", e)
    return NextResponse.json({ error: "所見の生成に失敗しました。時間をおいて再度お試しください" }, { status: 500 })
  }
}
