import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// ファネル判定（確定した分類）
const NO_CONTACT = ["未対応", "連絡取れず"]                                  // 接触なし
const INTERVIEW_SET = ["面接設定済み", "面接完了", "内定通知済み", "入社", "面接・内定後辞退"] // 面接設定以降
const INTERVIEW_DONE = ["面接完了", "内定通知済み", "入社", "面接・内定後辞退"]              // 面接実施以降
const HIRED = ["入社"]                                                       // 入社

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

  // 管理者のみ
  const role = session.user.role
  const isAdmin = role !== "sales" && role !== "production"
  if (!isAdmin) {
    return NextResponse.json({ error: "マーケティングダッシュボードは管理者のみ閲覧できます" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const yearParam = searchParams.get("year")
  const monthParam = searchParams.get("month")

  // 利用可能な年月リスト（データがある月）を作る
  const allMonths = await prisma.applicationRecord.findMany({
    select: { year: true, month: true },
    distinct: ["year", "month"],
    orderBy: [{ year: "desc" }, { month: "desc" }],
  })
  const availableMonths = allMonths.map(m => ({ year: m.year, month: m.month }))

  // 対象月：指定が無ければ最新月
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
    })
  }

  // 対象月の全応募明細を取得
  const records = await prisma.applicationRecord.findMany({
    where: { year: targetYear, month: targetMonth },
    select: { status: true, inflow: true },
  })

  // 全体ファネル
  const overall = emptyFunnel()
  // 流入元別ファネル
  const inflowMap: Record<string, Funnel> = {}

  for (const r of records) {
    addToFunnel(overall, r.status)
    if (!inflowMap[r.inflow]) inflowMap[r.inflow] = emptyFunnel()
    addToFunnel(inflowMap[r.inflow], r.status)
  }

  // 流入元別を応募数の多い順に並べる
  const byInflow = Object.entries(inflowMap)
    .map(([inflow, f]) => ({ inflow, ...f }))
    .sort((a, b) => b.apply - a.apply)

  return NextResponse.json({
    availableMonths,
    target: { year: targetYear, month: targetMonth },
    overall,
    byInflow,
  })
}