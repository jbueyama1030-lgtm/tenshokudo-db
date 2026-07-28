import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import { canViewMarketing } from "@/lib/permissions"
import { annualRevenue } from "@/lib/revenue"

const prisma = new PrismaClient()

// かけて良い広告費の売上に対する比率（デフォルト30%）
const DEFAULT_RATE = 30

const CONTRACTED_STATUSES = ["contracted", "referral_only"]

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

  // ===== 1. エリア別「かけて良い広告費」（契約済み企業の月間売上×rate%） =====
  const contractedCompanies = await prisma.company.findMany({
    where: { status: { in: CONTRACTED_STATUSES } },
    select: { address: true, monthlyFee: true, discountRate: true, options: true },
  })

  // エリア → 月間売上合計
  const areaMonthlyRevenue: Record<string, number> = {}
  let totalMonthlyRevenue = 0
  for (const c of contractedCompanies) {
    const pref = extractPref(c.address)
    const monthly = Math.round(annualRevenue(c) / 12)
    areaMonthlyRevenue[pref] = (areaMonthlyRevenue[pref] ?? 0) + monthly
    totalMonthlyRevenue += monthly
  }

  // ===== 2. エリア別「実際の広告費（概算）」 =====
  // direct 広告費を、その媒体の応募がどのエリアに落ちたかの比率で按分する

  // 対象月の応募（流入元とエリアの組）
  const records = await prisma.applicationRecord.findMany({
    where: { year: targetYear, month: targetMonth },
    select: { inflow: true, company: { select: { address: true } } },
  })

  // 流入元ごとの総応募数、および 流入元×エリアの応募数
  const inflowTotalApply: Record<string, number> = {}
  const inflowAreaApply: Record<string, Record<string, number>> = {}
  for (const r of records) {
    const pref = extractPref(r.company?.address ?? null)
    inflowTotalApply[r.inflow] = (inflowTotalApply[r.inflow] ?? 0) + 1
    if (!inflowAreaApply[r.inflow]) inflowAreaApply[r.inflow] = {}
    inflowAreaApply[r.inflow][pref] = (inflowAreaApply[r.inflow][pref] ?? 0) + 1
  }

  // 対象月の direct 広告費（流入元ごとに合算）
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

  // 各流入元の広告費を、応募エリア比でエリアに按分
  const areaActualCost: Record<string, number> = {}
  for (const [inflow, cost] of Object.entries(directCostByInflow)) {
    const total = inflowTotalApply[inflow] ?? 0
    if (total === 0) continue // 応募が無い媒体はエリア按分不能（全体には overhead 的に残す手もあるが概算なので除外）
    const areaApply = inflowAreaApply[inflow] ?? {}
    for (const [pref, count] of Object.entries(areaApply)) {
      areaActualCost[pref] = (areaActualCost[pref] ?? 0) + cost * (count / total)
    }
  }

  // 応募が無くエリア按分できなかった direct 広告費（差額）を集計
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
        budget,               // かけて良い広告費
        actual,               // 実際の広告費（概算）
        diff: budget - actual, // プラス=余力 / マイナス=超過
        overRatio: budget > 0 ? Math.round((actual / budget) * 100) : null,
      }
    })
    .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue)

  // ===== 全体 =====
  const totalBudget = Math.round(totalMonthlyRevenue * (rate / 100))
  const totalActual = Math.round(allocatedDirect + unallocatedDirect + overheadTotal)

  const overall = {
    monthlyRevenue: totalMonthlyRevenue,
    budget: totalBudget,
    actual: totalActual,
    diff: totalBudget - totalActual,
    overRatio: totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : null,
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