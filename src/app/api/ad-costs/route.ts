import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import { canImportData } from "@/lib/permissions"

const prisma = new PrismaClient()

// GET /api/ad-costs?year=2026&month=6
// その月の広告費明細と、流入元ごとの応募数を返す
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "未認証です" }, { status: 401 })
  if (!canImportData(session)) return NextResponse.json({ error: "権限がありません" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const yearParam = searchParams.get("year")
  const monthParam = searchParams.get("month")

  // 応募データが存在する月の一覧（新しい順）
  const monthGroups = await prisma.applicationRecord.groupBy({
    by: ["year", "month"],
    orderBy: [{ year: "desc" }, { month: "desc" }],
  })
  const availableMonths = monthGroups.map(g => ({ year: g.year, month: g.month }))

  // 対象月の決定：指定がなければ最新月
  let target: { year: number; month: number } | null = null
  if (yearParam && monthParam) {
    target = { year: Number(yearParam), month: Number(monthParam) }
  } else if (availableMonths.length > 0) {
    target = availableMonths[0]
  }

  if (!target) {
    return NextResponse.json({ availableMonths, target: null, inflows: [], costs: [] })
  }

  // 対象月の流入元ごと応募数
  const inflowGroups = await prisma.applicationRecord.groupBy({
    by: ["inflow"],
    where: { year: target.year, month: target.month },
    _count: { _all: true },
  })
  const inflows = inflowGroups
    .map(g => ({ inflow: g.inflow, applyCount: g._count._all }))
    .sort((a, b) => b.applyCount - a.applyCount)

  // 対象月の広告費明細
  const costs = await prisma.adCost.findMany({
    where: { year: target.year, month: target.month },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  })

  return NextResponse.json({ availableMonths, target, inflows, costs })
}

// POST /api/ad-costs
// 明細1行の作成・更新（name + year + month が一意キー）
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "未認証です" }, { status: 401 })
  if (!canImportData(session)) return NextResponse.json({ error: "権限がありません" }, { status: 403 })

  const body = await req.json()
  const { name, inflow, year, month, category, costType, unitPrice, totalCost, memo } = body

  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: "費用名は必須です" }, { status: 400 })
  }
  if (!year || !month) {
    return NextResponse.json({ error: "年月は必須です" }, { status: 400 })
  }

  const cat = category === "overhead" ? "overhead" : "direct"
  // overhead は流入に紐づかないので inflow を強制的に null にする
  const inflowValue = cat === "overhead" ? null : (inflow || null)
  const type = costType === "performance" ? "performance" : "operation"

  const data = {
    name: String(name).trim(),
    inflow: inflowValue,
    year: Number(year),
    month: Number(month),
    category: cat,
    costType: type,
    unitPrice: type === "performance" && unitPrice != null ? Number(unitPrice) : null,
    totalCost: type === "operation" && totalCost != null ? Number(totalCost) : null,
    memo: memo ? String(memo) : null,
  }

  const saved = await prisma.adCost.upsert({
    where: { uniqueAdCost: { name: data.name, year: data.year, month: data.month } },
    update: data,
    create: data,
  })

  return NextResponse.json(saved)
}

// DELETE /api/ad-costs?id=xxx
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "未認証です" }, { status: 401 })
  if (!canImportData(session)) return NextResponse.json({ error: "権限がありません" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 })

  await prisma.adCost.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}