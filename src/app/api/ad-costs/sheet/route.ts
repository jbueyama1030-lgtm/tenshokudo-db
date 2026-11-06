// 置き場所: src/app/api/ad-costs/sheet/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { canImportData } from "@/lib/permissions"

/**
 * 損益表から広告費を取り込む画面用。
 * GET ?fy=2026 → 保存済みの取り込み方、その年度に入っている広告費、流入元の候補、過去の明細名
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canImportData(session)) return NextResponse.json({ error: "権限がありません" }, { status: 403 })

  const fy = Number(new URL(req.url).searchParams.get("fy")) || new Date().getFullYear()
  // 年度 = fy年5月〜(fy+1)年4月
  const monthWhere = {
    OR: [
      { year: fy, month: { gte: 5 } },
      { year: fy + 1, month: { lte: 4 } },
    ],
  }

  const [mappings, existing, history, appInflows] = await Promise.all([
    prisma.adCostMapping.findMany(),
    prisma.adCost.findMany({
      where: monthWhere,
      select: { name: true, inflow: true, category: true, year: true, month: true, totalCost: true, costType: true, unitPrice: true },
    }),
    // 過去の明細名ごとの最新の流入元・区分（名前の対応づけの候補に使う）
    prisma.adCost.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }],
      distinct: ["name"],
      select: { name: true, inflow: true, category: true },
    }),
    prisma.applicationRecord.groupBy({ by: ["inflow"], _count: { _all: true }, orderBy: { _count: { inflow: "desc" } }, take: 80 }),
  ])

  const inflows = Array.from(new Set([
    ...history.map(h => h.inflow).filter((x): x is string => !!x),
    ...appInflows.map(a => a.inflow),
  ]))

  return NextResponse.json({ fy, mappings, existing, history, inflows })
}

type RowIn = { name: string; inflow: string | null; category: string; year: number; month: number; totalCost: number }
type MappingIn = {
  sourceName: string; mode: string; adName?: string | null; inflow?: string | null
  splitAName?: string | null; splitAInflow?: string | null; splitBName?: string | null; splitBInflow?: string | null
}

/**
 * 取り込み。body: { rows: RowIn[], mappings: MappingIn[] }
 * - rows は (明細名・年・月) ごとに上書き、無ければ追加（運用型の金額として保存）
 * - mappings（明細名ごとの取り込み方）は次回のために保存
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canImportData(session)) return NextResponse.json({ error: "権限がありません" }, { status: 403 })

  const body = await req.json().catch(() => null)
  const rows: RowIn[] = Array.isArray(body?.rows) ? body.rows : []
  const mappings: MappingIn[] = Array.isArray(body?.mappings) ? body.mappings : []

  for (const r of rows) {
    if (!r.name || !Number.isInteger(r.year) || !Number.isInteger(r.month) || !Number.isFinite(r.totalCost)) {
      return NextResponse.json({ error: "不正な行があります: " + JSON.stringify(r) }, { status: 400 })
    }
  }

  let created = 0
  let updated = 0
  await prisma.$transaction(async tx => {
    for (const r of rows) {
      const category = r.category === "overhead" ? "overhead" : "direct"
      const inflow = category === "overhead" ? null : r.inflow || null
      const existing = await tx.adCost.findUnique({
        where: { uniqueAdCost: { name: r.name, year: r.year, month: r.month } },
        select: { id: true },
      })
      if (existing) {
        await tx.adCost.update({
          where: { id: existing.id },
          data: { inflow, category, costType: "operation", unitPrice: null, totalCost: Math.round(r.totalCost) },
        })
        updated++
      } else {
        await tx.adCost.create({
          data: { name: r.name, inflow, category, year: r.year, month: r.month, costType: "operation", totalCost: Math.round(r.totalCost) },
        })
        created++
      }
    }
    for (const m of mappings) {
      if (!m.sourceName) continue
      const data = {
        mode: ["direct", "overhead", "split", "skip"].includes(m.mode) ? m.mode : "direct",
        adName: m.adName || null,
        inflow: m.inflow || null,
        splitAName: m.splitAName || null,
        splitAInflow: m.splitAInflow || null,
        splitBName: m.splitBName || null,
        splitBInflow: m.splitBInflow || null,
      }
      await tx.adCostMapping.upsert({ where: { sourceName: m.sourceName }, update: data, create: { sourceName: m.sourceName, ...data } })
    }
  }, { timeout: 60_000 })

  return NextResponse.json({ created, updated })
}
