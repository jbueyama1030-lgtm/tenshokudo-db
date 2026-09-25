import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { isInAgencyScope } from "@/lib/permissions"
import {
  analyzeCompanyFunnel,
  addMonths,
  currentYmJst,
  periodEndingAt,
  ymKey,
  type Period,
  type YearMonth,
} from "@/lib/funnelAnalysis"

/** 期間未指定時の月数 */
const DEFAULT_MONTHS = 6
/** 指定できる最大月数（重くなりすぎないように） */
const MAX_MONTHS = 24

/** "2026-08" → { year: 2026, month: 8 }。不正なら null */
function parseYm(s: string | null): YearMonth | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{1,2})$/.exec(s.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  return { year, month }
}

function monthsBetween(p: Period): number {
  return (p.to.year - p.from.year) * 12 + (p.to.month - p.from.month) + 1
}

/**
 * 1社ぶんのレポート用データ（ファネル・月次推移・比較）を返す。
 *
 * クエリ:
 *   from=YYYY-MM, to=YYYY-MM（どちらも省略可）
 *   - 両方省略 → 先月までの直近6ヶ月（集計途中の今月は含めない）
 *   - to のみ  → to までの直近6ヶ月
 *   - from のみ → from から先月まで
 *   ※データが先月まで無い場合は、データがある最新月を終端にする
 *
 * 権限: その企業を閲覧できる人なら誰でも（代理店ユーザー含む）。
 * 比較値は全社の匿名集計なので、個社名は一切返さない。
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const company = await prisma.company.findUnique({
    where: { id },
    select: { id: true, agencyId: true },
  })
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // 存在を推測されないよう 403 ではなく 404
  if (!isInAgencyScope(session, company.agencyId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // ---- 期間の決定 ----
  const { searchParams } = new URL(req.url)
  const fromRaw = searchParams.get("from")
  const toRaw = searchParams.get("to")
  const fromParam = parseYm(fromRaw)
  const toParam = parseYm(toRaw)

  if ((fromRaw && !fromParam) || (toRaw && !toParam)) {
    return NextResponse.json({ error: "期間は YYYY-MM 形式で指定してください" }, { status: 400 })
  }

  let to: YearMonth
  if (toParam) {
    to = toParam
  } else {
    // 既定の終端 = 先月。ただしデータがそこまで無ければデータの最新月
    const last = await prisma.applicationRecord.findFirst({
      select: { year: true, month: true },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    })
    if (!last) {
      return NextResponse.json({ error: "応募データがありません" }, { status: 404 })
    }
    const lastMonth = addMonths(currentYmJst(), -1)
    const latestData: YearMonth = { year: last.year, month: last.month }
    to = ymKey(latestData) < ymKey(lastMonth) ? latestData : lastMonth
  }

  const period: Period = fromParam ? { from: fromParam, to } : periodEndingAt(to, DEFAULT_MONTHS)

  if (ymKey(period.from) > ymKey(period.to)) {
    return NextResponse.json({ error: "期間の開始が終了より後になっています" }, { status: 400 })
  }
  if (monthsBetween(period) > MAX_MONTHS) {
    return NextResponse.json({ error: `期間は最大${MAX_MONTHS}ヶ月までです` }, { status: 400 })
  }

  // ---- 集計 ----
  try {
    const report = await analyzeCompanyFunnel(company.id, period)
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(report)
  } catch (e) {
    console.error("[report] analyzeCompanyFunnel failed", e)
    return NextResponse.json({ error: "レポートの集計に失敗しました" }, { status: 500 })
  }
}