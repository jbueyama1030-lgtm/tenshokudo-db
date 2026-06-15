import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { rows, year, month } = await req.json()

  // 企業IDごとに集計
  const companyMap: Record<string, {
    applyCount: number
    hireCount: number
    inflow: Record<string, number>
  }> = {}

  for (const row of rows) {
    const companyId = row[2]?.trim()
    const status = row[16]?.trim()
    const inflow = row[17]?.trim() || "未設定"

    if (!companyId) continue

    if (!companyMap[companyId]) {
      companyMap[companyId] = { applyCount: 0, hireCount: 0, inflow: {} }
    }

    // 応募数カウント（全行）
    companyMap[companyId].applyCount++

    // 入社数カウント（ステータスが「入社」を含む行）
    if (status?.includes("入社")) {
      companyMap[companyId].hireCount++
    }

    // 流入元集計
    if (!companyMap[companyId].inflow[inflow]) {
      companyMap[companyId].inflow[inflow] = 0
    }
    companyMap[companyId].inflow[inflow]++
  }

  const results = { success: 0, notFound: 0, error: 0 }

  for (const [companyId, data] of Object.entries(companyMap)) {
    // DBの企業を検索
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
            year,
            month,
          },
        },
        update: {
          applyCount: data.applyCount,
          hireCount: data.hireCount,
          inflowBreakdown: data.inflow,
        },
        create: {
          companyId: company.id,
          year,
          month,
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