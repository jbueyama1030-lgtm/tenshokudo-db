import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

function parseTemperature(val: string): string | null {
  if (!val) return null
  if (val.includes("拡大")) return "hot"
  if (val.includes("安定")) return "warm"
  if (val.includes("フォロー")) return "warm"
  if (val.includes("解約")) return "cold"
  return null
}

function parseDate(val: string): Date | null {
  if (!val?.trim()) return null
  try { return new Date(val.trim()) } catch { return null }
}

function parseNum(val: string): number | null {
  const n = Number(val?.trim().replace(/,/g, ""))
  return isNaN(n) || val?.trim() === "" ? null : n
}

function parseShifts(val: string): string[] {
  if (!val) return []
  const result: string[] = []
  if (val.includes("日勤")) result.push("日勤")
  if (val.includes("夜勤")) result.push("夜勤")
  if (val.includes("隔日")) result.push("隔日勤務")
  if (val.includes("自由")) result.push("その他")
  return result
}

function parseApps(val: string): string[] {
  if (!val) return []
  const result: string[] = []
  if (val.includes("GO") || val.includes("Go")) result.push("GO")
  if (val.includes("Uber") || val.includes("uber")) result.push("Uber Taxi")
  if (val.includes("S.RIDE") || val.includes("SRIDE")) result.push("S.RIDE")
  if (val.includes("DiDi") || val.includes("didi")) result.push("DiDi")
  if (val.includes("自社")) result.push("自社アプリ")
  return result
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { rows } = await req.json()

  const users = await prisma.user.findMany({ select: { id: true, name: true } })
  const userMap: Record<string, string> = {}
  users.forEach(u => { userMap[u.name] = u.id })

  const results = { success: 0, skip: 0, error: 0, notFound: 0 }

  for (const row of rows) {
    const companyId = row[32]?.trim()
    const name = row[1]?.trim()

    if (!name) { results.skip++; continue }

    // 企業IDのみでマッチ
    if (!companyId) { results.notFound++; continue }

    const existing = await prisma.company.findUnique({
      where: { companyId },
    })

    if (!existing) { results.notFound++; continue }

    const tantou = row[27]?.trim()
    const userId = (tantou && userMap[tantou]) ? userMap[tantou] : existing.userId

    const competitorMedia = []
    const mediaName = row[20]?.trim()
    if (mediaName) {
      competitorMedia.push({
        name: mediaName,
        monthly: parseNum(row[21]),
        costPerHire: parseNum(row[17]),
        note: row[22]?.trim() || "",
      })
    }

    try {
      await prisma.company.update({
        where: { id: existing.id },
        data: {
          userId,
          vehicleCount: parseNum(row[4]),
          driverCount: parseNum(row[5]),
          annualHiringTarget: parseNum(row[10]),
          adoptionChallenge: row[12]?.trim() || null,
          apps: parseApps(row[9]),
          dispatchRatio: row[8]?.trim() || null,
          shifts: parseShifts(row[14]),
          competitorMedia: competitorMedia.length > 0 ? competitorMedia : undefined,
          tenshokudoCostPerHire: parseNum(row[17]),
          temperature: parseTemperature(row[24]),
          negotiationMemo: row[23]?.trim() || null,
          nextAction: row[25]?.trim() || null,
          nextActionDate: parseDate(row[26]),
          contractStart: parseDate(row[37]),
          contractRenewal: parseDate(row[35]),
          applyCount: parseNum(row[30]) ?? existing.applyCount,
          hireCount: parseNum(row[31]) ?? existing.hireCount,
        },
      })
      results.success++
    } catch {
      results.error++
    }
  }

  return NextResponse.json(results)
}