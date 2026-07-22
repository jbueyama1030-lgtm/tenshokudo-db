import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import { canViewMarketing } from "@/lib/permissions"

const prisma = new PrismaClient()

// ファネル判定（確定した分類）
const NO_CONTACT = ["未対応", "連絡取れず"]
const INTERVIEW_SET = ["面接設定済み", "面接完了", "内定通知済み", "入社", "面接・内定後辞退"]
const INTERVIEW_DONE = ["面接完了", "内定通知済み", "入社", "面接・内定後辞退"]
const HIRED = ["入社"]

type Funnel = {
  apply: number
  contact: number
  interviewSet: number
  interviewDone: number
  hired: number
}

function emptyFunnel(): Funnel {
  return { apply: 0, contact: 0, interviewSet: 0, interviewDone: 0, hired: 0 }
}

function addToFunnel(f: Funnel, status: string) {
  f.apply++
  if (!NO_CONTACT.includes(status)) f.contact++
  if (INTERVIEW_SET.includes(status)) f.interviewSet++
  if (INTERVIEW_DONE.includes(status)) f.interviewDone++
  if (HIRED.includes(status)) f.hired++
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
    return NextResponse.json({
      availableMonths,
      target: null,
      overall: emptyFunnel(),
      byInflow: [],
      overallAdCost: 0,
    })
  }

  // 応募明細
  const records = await prisma.applicationRecord.findMany({
    where: { year: targetYear, month: targetMonth },
    select: { status: true, inflow: true },
  })

  const overall = emptyFunnel()
  const inflowMap: Record<string, Funnel> = {}

  for (const r of records) {
    addToFunnel(overall, r.status)
    if (!inflowMap[r.inflow]) inflowMap[r.inflow] = emptyFunnel()
    addToFunnel(inflowMap[r.inflow], r.status)
  }

  // 広告費（その月）
  const adCosts = await prisma.adCost.findMany({ where: { year: targetYear, month: targetMonth } })
  const adCostByInflow: Record<string, { costType: string; unitPrice: number | null; totalCost: number | null }> = {}
  adCosts.forEach(a => {
    adCostByInflow[a.inflow] = { costType: a.costType, unitPrice: a.unitPrice, totalCost: a.totalCost }
  })

  const adCostOf = (inflow: string, apply: number): number | null => {
    const ac = adCostByInflow[inflow]
    if (!ac) return null
    if (ac.costType === "operation") return ac.totalCost
    if (ac.costType === "performance" && ac.unitPrice != null) return ac.unitPrice * apply
    return null
  }

  const byInflow = Object.entries(inflowMap)
    .map(([inflow, f]) => {
      const adCost = adCostOf(inflow, f.apply)
      return {
        inflow,
        ...f,
        adCost,
        cpaApply: adCost != null && f.apply > 0 ? Math.round(adCost / f.apply) : null,
        cpaHire: adCost != null && f.hired > 0 ? Math.round(adCost / f.hired) : null,
      }
    })
    .sort((a, b) => b.apply - a.apply)

  const overallAdCost = byInflow.reduce((s, r) => s + (r.adCost ?? 0), 0)

  return NextResponse.json({
    availableMonths,
    target: { year: targetYear, month: targetMonth },
    overall,
    byInflow,
    overallAdCost,
  })
}