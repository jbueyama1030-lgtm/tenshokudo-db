import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { rows } = await req.json()

  // 企業ID × 年月 ごとに集計
  const recordMap: Record<string, {
    year: number
    month: number
    applyCount: number
    hireCount: number
    inflow: Record<string, number>
  }> = {}

  for (const row of rows) {
    const dateStr = row[0]?.trim()   // 例: 2026/06/15(月)10:40
    const companyId = row[2]?.trim()
    const status = row[16]?.trim()
    const inflow = row[17]?.trim() || "未設定"

    if (!companyId || !dateStr) continue

    // 年月をパース
    const match = dateStr.match(/(\d{4})\/(\d{2})/)
    if (!match) continue
    const year = parseInt(match[1])
    const month = parseInt(match[2])

    const key = `${companyId}_${year}_${month}`

    if (!recordMap[key]) {
      recordMap[key] = { year, month, applyCount: 0, hireCount: 0, inflow: {} }
    }

    recordMap[key].applyCount++

    if (status?.includes("入社")) {
      recordMap[key].hireCount++
    }

    recordMap[key].inflow[inflow] = (recordMap[key].inflow[inflow] || 0) + 1
  }

  const results = { success: 0, notFound: 0, error: 0 }

  for (const [key, data] of Object.entries(recordMap)) {
    const companyId = key.split("_")[0]

    const company = await prisma.company.findUnique({
      where: { companyId },
    })

    if (!company) {
      results.notFound++
      continue
    }

    try {
      await prisma.monthlyRecord.upsert({
        where: {
          companyId_year_month: {
            companyId: company.id,
            year: data.year,
            month: data.month,
          },
        },
        update: {
          applyCount: data.applyCount,
          hireCount: data.hireCount,
          inflowBreakdown: data.inflow,
        },
        create: {
          companyId: company.id,
          year: data.year,
          month: data.month,
          applyCount: data.applyCount,
          hireCount: data.hireCount,
          inflowBreakdown: data.inflow,
        },
      })
      results.success++
    } catch {
      results.error++
    }
  }

  return NextResponse.json(results)
}