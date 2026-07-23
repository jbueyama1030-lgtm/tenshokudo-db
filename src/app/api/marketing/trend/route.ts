import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import { canViewMarketing } from "@/lib/permissions"

const prisma = new PrismaClient()

const NO_CONTACT = ["未対応", "連絡取れず"]
const INTERVIEW_DONE = ["面接完了", "内定通知済み", "入社", "面接・内定後辞退"]
const HIRED = ["入社"]

const TOP_INFLOW_COUNT = 6

const ORGANIC_INFLOWS = ["未設定", "直応募"]

type MonthKey = string

function monthKey(y: number, m: number): MonthKey {
  return y + "-" + String(m).padStart(2, "0")
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!canViewMarketing(session)) {
    return NextResponse.json({ error: "マーケティング分析の閲覧権限がありません" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const range = searchParams.get("range") ?? "12"
  const excludeOrganic = searchParams.get("excludeOrganic") === "1"

  const allMonths = await prisma.applicationRecord.findMany({
    select: { year: true, month: true },
    distinct: ["year", "month"],
    orderBy: [{ year: "desc" }, { month: "desc" }],
  })
  if (allMonths.length === 0) {
    return NextResponse.json({ range, excludeOrganic, months: [], topInflows: [], applyTrend: [], rateTrend: [], cpaTrend: [] })
  }

  let targetMonths = allMonths.map(m => ({ year: m.year, month: m.month }))
  if (range !== "all") {
    const n = Number(range)
    targetMonths = targetMonths.slice(0, n)
  }
  targetMonths.reverse()

  const minYear = targetMonths[0].year
  const maxYear = targetMonths[targetMonths.length - 1].year

  const targetSet = new Set(targetMonths.map(t => monthKey(t.year, t.month)))
  const records = await prisma.applicationRecord.findMany({
    where: { year: { gte: minYear, lte: maxYear } },
    select: { year: true, month: true, status: true, inflow: true },
  })
  const filtered = records.filter(r => targetSet.has(monthKey(r.year, r.month)))

  const inflowTotal: Record<string, number> = {}
  for (const r of filtered) {
    if (excludeOrganic && ORGANIC_INFLOWS.includes(r.inflow)) continue
    inflowTotal[r.inflow] = (inflowTotal[r.inflow] || 0) + 1
  }
  const topInflows = Object.entries(inflowTotal)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_INFLOW_COUNT)
    .map(([inflow]) => inflow)
  const topSet = new Set(topInflows)

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

  // 全流入の月別応募数（成果報酬型の金額算出に必要）
  const applyByMonthInflow: Record<string, number> = {}
  for (const r of filtered) {
    const key = monthKey(r.year, r.month) + "|" + r.inflow
    applyByMonthInflow[key] = (applyByMonthInflow[key] ?? 0) + 1
  }

  // 広告費：月×流入元で明細を合算（overhead と inflow なしは除外）
  const adCosts = await prisma.adCost.findMany({
    where: { year: { gte: minYear, lte: maxYear } },
  })
  const costByMonthInflow: Record<string, number> = {}
  for (const a of adCosts) {
    if (a.category === "overhead" || !a.inflow) continue
    const k = monthKey(a.year, a.month) + "|" + a.inflow
    let amount = 0
    if (a.costType === "operation") {
      amount = a.totalCost ?? 0
    } else if (a.costType === "performance" && a.unitPrice != null) {
      amount = a.unitPrice * (applyByMonthInflow[k] ?? 0)
    }
    costByMonthInflow[k] = (costByMonthInflow[k] ?? 0) + amount
  }

  const applyTrend = targetMonths.map(t => {
    const k = monthKey(t.year, t.month)
    const row: Record<string, string | number> = { month: k }
    for (const inf of topInflows) row[inf] = byMonthInflow[k][inf].apply
    return row
  })

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

  const cpaTrend = targetMonths.map(t => {
    const k = monthKey(t.year, t.month)
    const row: Record<string, string | number | null> = { month: k }
    for (const inf of topInflows) {
      const cost = costByMonthInflow[k + "|" + inf]
      const agg = byMonthInflow[k][inf]
      row[inf] = cost != null && cost > 0 && agg.hired > 0 ? Math.round(cost / agg.hired) : null
    }
    return row
  })

  return NextResponse.json({
    range,
    excludeOrganic,
    months: targetMonths.map(t => monthKey(t.year, t.month)),
    topInflows,
    applyTrend,
    rateTrend,
    cpaTrend,
  })
}