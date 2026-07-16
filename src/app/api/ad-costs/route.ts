import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

function checkAdmin(role: string) {
  return role !== "sales" && role !== "production"
}

// GET: ?year=2026&month=5 → その月の広告費 + 流入元候補 + 応募数
export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!checkAdmin(session.user.role)) {
    return NextResponse.json({ error: "管理者のみ" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get("year"))
  const month = Number(searchParams.get("month"))

  // 応募明細のある月リスト
  const allMonths = await prisma.applicationRecord.findMany({
    select: { year: true, month: true },
    distinct: ["year", "month"],
    orderBy: [{ year: "desc" }, { month: "desc" }],
  })
  const availableMonths = allMonths.map(m => ({ year: m.year, month: m.month }))

  if (!year || !month) {
    return NextResponse.json({ availableMonths, target: null, rows: [] })
  }

  // その月の応募明細を取得 → 流入元ごとの応募数を数える
  const records = await prisma.applicationRecord.findMany({
    where: { year, month },
    select: { inflow: true },
  })
  const applyCountByInflow: Record<string, number> = {}
  for (const r of records) {
    applyCountByInflow[r.inflow] = (applyCountByInflow[r.inflow] || 0) + 1
  }

  // その月の登録済み広告費
  const adCosts = await prisma.adCost.findMany({ where: { year, month } })
  const adCostByInflow: Record<string, typeof adCosts[number]> = {}
  adCosts.forEach(a => { adCostByInflow[a.inflow] = a })

  // 流入元の和集合（応募明細に実在するもの ∪ 広告費登録済みのもの）
  const inflowSet = new Set<string>([
    ...Object.keys(applyCountByInflow),
    ...adCosts.map(a => a.inflow),
  ])

  // 行データを組み立て（応募数の多い順）
  const rows = Array.from(inflowSet).map(inflow => {
    const ac = adCostByInflow[inflow]
    return {
      inflow,
      applyCount: applyCountByInflow[inflow] ?? 0,
      costType: ac?.costType ?? "operation",
      unitPrice: ac?.unitPrice ?? null,
      totalCost: ac?.totalCost ?? null,
    }
  }).sort((a, b) => b.applyCount - a.applyCount)

  return NextResponse.json({
    availableMonths,
    target: { year, month },
    rows,
  })
}

// POST: 広告費を保存（1件ずつ upsert）
// body: { year, month, inflow, costType, unitPrice, totalCost }
export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!checkAdmin(session.user.role)) {
    return NextResponse.json({ error: "管理者のみ" }, { status: 403 })
  }

  const body = await req.json()
  const { year, month, inflow, costType } = body

  if (!year || !month || !inflow) {
    return NextResponse.json({ error: "年月と流入元は必須です" }, { status: 400 })
  }

  const unitPrice = body.unitPrice != null && body.unitPrice !== "" ? Number(body.unitPrice) : null
  const totalCost = body.totalCost != null && body.totalCost !== "" ? Number(body.totalCost) : null

  const saved = await prisma.adCost.upsert({
    where: {
      uniqueAdCost: { inflow, year: Number(year), month: Number(month) },
    },
    update: {
      costType: costType || "operation",
      unitPrice,
      totalCost,
    },
    create: {
      inflow,
      year: Number(year),
      month: Number(month),
      costType: costType || "operation",
      unitPrice,
      totalCost,
    },
  })

  return NextResponse.json(saved)
}