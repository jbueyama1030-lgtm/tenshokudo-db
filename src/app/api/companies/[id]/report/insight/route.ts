import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { isInAgencyScope } from "@/lib/permissions"
import { analyzeCompanyFunnel, type YearMonth } from "@/lib/funnelAnalysis"
import { writeInsight } from "@/lib/reportWriter"

function parseYm(s: unknown): YearMonth | null {
  if (typeof s !== "string") return null
  const m = /^(\d{4})-(\d{1,2})$/.exec(s.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  return { year, month }
}

/**
 * レポートのAI所見を生成する。
 * body: { from: "YYYY-MM", to: "YYYY-MM" }（レポート画面に表示中の期間）
 *
 * 数字はクライアントから受け取らず、サーバー側で集計し直す
 * （画面の値を書き換えて送られても、AIに渡る数字は変わらない）。
 * 生成のたびに課金されるため、ボタンを押したときだけ呼ぶ。
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AIのAPIキーが設定されていません（ANTHROPIC_API_KEY）" }, { status: 503 })
  }

  const { id } = await params

  const company = await prisma.company.findUnique({
    where: { id },
    select: { id: true, agencyId: true },
  })
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!isInAgencyScope(session, company.agencyId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const from = parseYm(body?.from)
  const to = parseYm(body?.to)
  if (!from || !to) {
    return NextResponse.json({ error: "期間は YYYY-MM 形式で指定してください" }, { status: 400 })
  }

  try {
    const report = await analyzeCompanyFunnel(company.id, { from, to })
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const insight = await writeInsight(report)
    return NextResponse.json(insight)
  } catch (e) {
    console.error("[report/insight] failed", e)
    return NextResponse.json({ error: "所見の生成に失敗しました。時間をおいて再度お試しください" }, { status: 500 })
  }
}