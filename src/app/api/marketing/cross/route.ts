import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import { canViewMarketing } from "@/lib/permissions"

const prisma = new PrismaClient()

const NO_CONTACT = ["未対応", "連絡取れず"]
const INTERVIEW_SET = ["面接設定済み", "面接完了", "内定通知済み", "入社", "面接・内定後辞退"]
const INTERVIEW_DONE = ["面接完了", "内定通知済み", "入社", "面接・内定後辞退"]
const HIRED = ["入社"]

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
  const areaParam = searchParams.get("area")

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
    return NextResponse.json({ availableMonths, target: null, areas: [], selectedArea: null, byInflow: [] })
  }

  const records = await prisma.applicationRecord.findMany({
    where: { year: targetYear, month: targetMonth },
    select: {
      status: true,
      inflow: true,
      company: { select: { address: true } },
    },
  })

  const areaApplyCount: Record<string, number> = {}
  for (const r of records) {
    const pref = extractPref(r.company?.address ?? null)
    areaApplyCount[pref] = (areaApplyCount[pref] || 0) + 1
  }
  const areas = Object.entries(areaApplyCount)
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => b.count - a.count)

  const selectedArea = areaParam || (areas.length > 0 ? areas[0].area : null)

  const adCosts = await prisma.adCost.findMany({ where: { year: targetYear, month: targetMonth } })
  const perfUnitPrice: Record<string, number> = {}
  adCosts.forEach(a => {
    if (a.costType === "performance" && a.unitPrice != null) {
      perfUnitPrice[a.inflow] = a.unitPrice
    }
  })

  const inflowMap: Record<string, Funnel> = {}
  for (const r of records) {
    const pref = extractPref(r.company?.address ?? null)
    if (pref !== selectedArea) continue
    if (!inflowMap[r.inflow]) inflowMap[r.inflow] = emptyFunnel()
    addToFunnel(inflowMap[r.inflow], r.status)
  }

  const byInflow = Object.entries(inflowMap)
    .map(([inflow, f]) => {
      const unit = perfUnitPrice[inflow]
      const isPerf = unit != null
      const adCost = isPerf ? unit * f.apply : null
      return {
        inflow,
        ...f,
        isPerformance: isPerf,
        adCost,
        cpaApply: adCost != null && f.apply > 0 ? Math.round(adCost / f.apply) : null,
        cpaHire: adCost != null && f.hired > 0 ? Math.round(adCost / f.hired) : null,
      }
    })
    .sort((a, b) => b.apply - a.apply)

  return NextResponse.json({
    availableMonths,
    target: { year: targetYear, month: targetMonth },
    areas,
    selectedArea,
    byInflow,
  })
}