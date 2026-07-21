import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const NO_CONTACT = ["未対応", "連絡取れず"]
const INTERVIEW_DONE = ["面接完了", "内定通知済み", "入社", "面接・内定後辞退"]
const HIRED = ["入社"]

const TOP_INFLOW_COUNT = 6

type MonthKey = string  // "2026-07"

function monthKey(y: number, m: number): MonthKey {
  return y + "-" + String(m).padStart(2, "0")
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role
  const isAdmin = role !== "sales" && role !== "production"
  if (!isAdmin) {
    return NextResponse.json({ error: "管理者のみ閲覧できます" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  // range: "12" | "24" | "all"
  const range = searchParams.get("range") ?? "12"

  // データのある月の範囲を把握
  const allMonths = await prisma.applicationRecord.findMany({
    select: { year: true, month: true },
    distinct: ["year", "month"],
    orderBy: [{ year: "desc" }, { month: "desc" }],
  })
  if (allMonths.length === 0) {
    return NextResponse.json({ range, months: [], topInflows: [], applyTrend: [], rateTrend: [], cpaTrend: [] })
  }

  // 対象月リストを作る（新しい順に並んでいるので、必要な件数だけ取って昇順に戻す）
  let targetMonths = allMonths.map(m => ({ year: m.year, month: m.month }))
  if (range !== "all") {
    const n = Number(range)
    targetMonths = targetMonths.slice(0, n)
  }
  targetMonths.reverse()  // 古い順

  const minYear = targetMonths[0].year
  const maxYear = targetMonths[targetMonths.length - 1].year

  // 対象期間の応募明細を取得（年で粗く絞ってからJS側で月をフィルタ）
  const targetSet = new Set(targetMonths.map(t => monthKey(t.year, t.month)))
  const records = await prisma.applicationRecord.findMany({
    where: { year: { gte: minYear, lte: maxYear } },
    select: { year: true, month: true, status: true, inflow: true },
  })
  const filtered = records.filter(r => targetSet.has(monthKey(r.year, r.month)))

  // 期間内の応募数上位媒体を決める
  const inflowTotal: Record<string, number> = {}
  for (const r of filtered) {
    inflowTotal[r.inflow] = (inflowTotal[r.inflow] || 0) + 1
  }
  const topInflows = Object.entries(inflowTotal)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_INFLOW_COUNT)
    .map(([inflow]) => inflow)
  const topSet = new Set(topInflows)

  // 月 × 媒体 の集計器
  type Agg = { apply: number; contact: number; interviewDone: number; hired: number }
  const emptyAgg = (): Agg => ({ apply: 0, contact: 0, interviewDone: 0, hired: 0 })

  const byMonthInflow: Record<MonthKey, Record<string, Agg>> = {}
  const byMonthTotal: Record<MonthKey, Agg> = {}

  for (const t of targetMonths) {
    const k = monthKey(t.year, t.month)
    byMonthInflow[k] = {}
    byMonthTotal[k] = emptyAgg()
    for (const inf of topInflows) byMonthInflow[k][inf] = emptyAgg()
  }

  for (const r of filtered) {
    const k = monthKey(r.year, r.month)
    if (!byMonthTotal[k]) continue

    const bump = (a: Agg) => {
      a.apply++
      if (!NO_CONTACT.includes(r.status)) a.contact++
      if (INTERVIEW_DONE.includes(r.status)) a.interviewDone++
      if (HIRED.includes(r.status)) a.hired++
    }
    bump(byMonthTotal[k])
    if (topSet.has(r.inflow)) bump(byMonthInflow[k][r.inflow])
  }

  // 広告費（対象期間）
  const adCosts = await prisma.adCost.findMany({
    where: { year: { gte: minYear, lte: maxYear } },
  })
  // month-inflow → 広告費算出用
  const adCostMap: Record<string, { costType: string; unitPrice: number | null; totalCost: number | null }> = {}
  adCosts.forEach(a => {
    const k = monthKey(a.year, a.month) + "|" + a.inflow
    adCostMap[k] = { costType: a.costType, unitPrice: a.unitPrice, totalCost: a.totalCost }
  })

  // A: 応募数トレンド（月 × 上位媒体）
  const applyTrend = targetMonths.map(t => {
    const k = monthKey(t.year, t.month)
    const row: Record<string, string | number> = { month: k }
    for (const inf of topInflows) row[inf] = byMonthInflow[k][inf].apply
    return row
  })

  // C: 歩留まり率トレンド（全体の接触率・入社率）
  const rateTrend = targetMonths.map(t => {
    const k = monthKey(t.year, t.month)
    const a = byMonthTotal[k]
    return {
      month: k,
      apply: a.apply,
      contactRate: a.apply > 0 ? Number(((a.contact / a.apply) * 100).toFixed(1)) : 0,
      interviewRate: a.apply > 0 ? Number(((a.interviewDone / a.apply) * 100).toFixed(1)) : 0,
      hireRate: a.apply > 0 ? Number(((a.hired / a.apply) * 100).toFixed(1)) : 0,
    }
  })

  // B: 入社CPAトレンド（月 × 上位媒体。広告費のある月だけ値が入る）
  const cpaTrend = targetMonths.map(t => {
    const k = monthKey(t.year, t.month)
    const row: Record<string, string | number | null> = { month: k }
    for (const inf of topInflows) {
      const ac = adCostMap[k + "|" + inf]
      const agg = byMonthInflow[k][inf]
      let cost: number | null = null
      if (ac) {
        if (ac.costType === "operation") cost = ac.totalCost
        else if (ac.costType === "performance" && ac.unitPrice != null) cost = ac.unitPrice * agg.apply
      }
      row[inf] = cost != null && agg.hired > 0 ? Math.round(cost / agg.hired) : null
    }
    return row
  })

  return NextResponse.json({
    range,
    months: targetMonths.map(t => monthKey(t.year, t.month)),
    topInflows,
    applyTrend,
    rateTrend,
    cpaTrend,
  })
}