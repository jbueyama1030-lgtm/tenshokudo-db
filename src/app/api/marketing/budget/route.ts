import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import { canViewMarketing } from "@/lib/permissions"
import { annualRevenue } from "@/lib/revenue"

const prisma = new PrismaClient()

const DEFAULT_RATE = 30

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
]

function extractPref(address: string | null): string {
  if (!address) return "不明"
  for (const pref of PREFECTURES) {
    if (address.includes(pref)) return pref
  }
  return "不明"
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canViewMarketing(session)) {
    return NextResponse.json({ error: "マーケティング分析の閲覧権限がありません" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const yearParam = searchParams.get("year")
  const monthParam = searchParams.get("month")
  const rateParam = searchParams.get("rate")
  const rate = rateParam ? Number(rateParam) : DEFAULT_RATE

  const allMonths = await prisma.applicationRecord.findMany({
    select: { year: true, month: true },
    distinct: ["year", "month"],
    orderBy: [{ year: "desc" }, { month: "desc" }],
  })
  const availableMonths = allMonths.map(m => ({ year: m.year, month: m.month }))

  let targetYear: number | null = null
  let targetMonth: number | null = null
  if (yearParam && monthParam) {
    targetYear = Number(yearParam)
    targetMonth = Number(monthParam)
  } else if (availableMonths.length > 0) {
    targetYear = availableMonths[0].year
    targetMonth = availableMonths[0].month
  }

  if (targetYear == null || targetMonth == null) {
    return NextResponse.json({ availableMonths, target: null, rate, byArea: [], overall: null })
  }

  // 対象月の初日と末日（この期間に契約がアクティブだったかを判定する）
  const monthStart = new Date(Date.UTC(targetYear, targetMonth - 1, 1))
  const monthEnd = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59)) // 翌月0日=当月末日

  // ===== 1. エリア別「かけて良い広告費」 =====
  // 対象月にアクティブだった契約期間を集める
  // アクティブ = contractStart <= 月末 かつ (contractEnd が null または contractEnd >= 月初)
  const activePeriods = await prisma.contractPeriod.findMany({
    where: {
      contractStart: { not: null, lte: monthEnd },
      OR: [
        { contractEnd: null },
        { contractEnd: { gte: monthStart } },
      ],
    },
    include: {
      company: { select: { address: true } },
    },
  })

  const areaMonthlyRevenue: Record<string, number> = {}
  let totalMonthlyRevenue = 0
  for (const p of activePeriods) {
    const pref = extractPref(p.company?.address ?? null)
    const monthly = Math.round(annualRevenue(p) / 12)
    areaMonthlyRevenue[pref] = (areaMonthlyRevenue[pref] ?? 0) + monthly
    totalMonthlyRevenue += monthly
  }

  // ===== 2. エリア別「実際の広告費（概算）」 =====
  const records = await prisma.applicationRecord.findMany({
    where: { year: targetYear, month: targetMonth },
    select: { inflow: true, company: { select: { address: true } } },
  })

  const inflowTotalApply: Record<string, number> = {}
  const inflowAreaApply: Record<string, Record<string, number>> = {}
  for (const r of records) {
    const pref = extractPref(r.company?.address ?? null)
    inflowTotalApply[r.inflow] = (inflowTotalApply[r.inflow] ?? 0) + 1
    if (!inflowAreaApply[r.inflow]) inflowAreaApply[r.inflow] = {}
    inflowAreaApply[r.inflow][pref] = (inflowAreaApply[r.inflow][pref] ?? 0) + 1
  }

  const adCosts = await prisma.adCost.findMany({ where: { year: targetYear, month: targetMonth } })
  const directCostByInflow: Record<string, number> = {}
  let overheadTotal = 0
  for (const a of adCosts) {
    const amount = a.costType === "operation"
      ? (a.totalCost ?? 0)
      : (a.unitPrice != null ? a.unitPrice * (inflowTotalApply[a.inflow ?? ""] ?? 0) : 0)
    if (a.category === "overhead" || !a.inflow) {
      overheadTotal += amount
    } else {
      directCostByInflow[a.inflow] = (directCostByInflow[a.inflow] ?? 0) + amount
    }
  }

  const areaActualCost: Record<string, number> = {}
  for (const [inflow, cost] of Object.entries(directCostByInflow)) {
    const total = inflowTotalApply[inflow] ?? 0
    if (total === 0) continue
    const areaApply = inflowAreaApply[inflow] ?? {}
    for (const [pref, count] of Object.entries(areaApply)) {
      areaActualCost[pref] = (areaActualCost[pref] ?? 0) + cost * (count / total)
    }
  }

  const allocatedDirect = Object.values(areaActualCost).reduce((s, v) => s + v, 0)
  const totalDirect = Object.values(directCostByInflow).reduce((s, v) => s + v, 0)
  const unallocatedDirect = Math.max(0, totalDirect - allocatedDirect)

  // ===== 3. エリア別に統合 =====
  const allAreas = new Set<string>([
    ...Object.keys(areaMonthlyRevenue),
    ...Object.keys(areaActualCost),
  ])

  const byArea = Array.from(allAreas)
    .map(area => {
      const budget = Math.round((areaMonthlyRevenue[area] ?? 0) * (rate / 100))
      const actual = Math.round(areaActualCost[area] ?? 0)
      return {
        area,
        monthlyRevenue: areaMonthlyRevenue[area] ?? 0,
        budget,
        actual,
        diff: budget - actual,
        overRatio: budget > 0 ? Math.round((actual / budget) * 100) : null,
      }
    })
    .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue)

  const totalBudget = Math.round(totalMonthlyRevenue * (rate / 100))
  const totalActual = Math.round(allocatedDirect + unallocatedDirect + overheadTotal)

  const overall = {
    monthlyRevenue: totalMonthlyRevenue,
    budget: totalBudget,
    actual: totalActual,
    diff: totalBudget - totalActual,
    overRatio: totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : null,
    activeContracts: activePeriods.length,
    breakdown: {
      allocatedDirect: Math.round(allocatedDirect),
      unallocatedDirect: Math.round(unallocatedDirect),
      overhead: Math.round(overheadTotal),
    },
  }

  return NextResponse.json({
    availableMonths,
    target: { year: targetYear, month: targetMonth },
    rate,
    byArea,
    overall,
  })
}