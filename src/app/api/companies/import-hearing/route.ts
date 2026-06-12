import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// 温度感の変換
function parseTemperature(val: string): string | null {
  if (!val) return null
  if (val.includes("拡大")) return "hot"
  if (val.includes("安定")) return "warm"
  if (val.includes("フォロー")) return "warm"
  if (val.includes("解約")) return "cold"
  return null
}

// 日付パース
function parseDate(val: string): Date | null {
  if (!val?.trim()) return null
  try { return new Date(val.trim()) } catch { return null }
}

// 数値パース
function parseNum(val: string): number | null {
  const n = Number(val?.trim().replace(/,/g, ""))
  return isNaN(n) || val?.trim() === "" ? null : n
}

// シフトパース
function parseShifts(val: string): string[] {
  if (!val) return []
  const result: string[] = []
  if (val.includes("日勤")) result.push("日勤")
  if (val.includes("夜勤")) result.push("夜勤")
  if (val.includes("隔日")) result.push("隔日勤務")
  if (val.includes("自由")) result.push("その他")
  return result
}

// アプリパース
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

  const admin = await prisma.user.findFirst({ where: { role: "admin" } })
  const defaultUserId = admin?.id ?? users[0]?.id

  const results = { success: 0, skip: 0, error: 0, notFound: 0 }

  for (const row of rows) {
    // 列インデックス（0始まり）
    // 0:タイムスタンプ 1:会社名 2:都道府県 3:市区町村
    // 4:保有車両数 5:ドライバー数 6:平均売上 7:担当者名
    // 8:配車割合 9:導入アプリ 10:年間採用目標 11:月間採用実績
    // 12:採用課題 13:定着率 14:募集シフト 15:求める年齢層
    // 16:免許取得支援 17:掲載型採用単価 18:紹介型採用単価
    // 19:紹介手数料率 20:利用媒体 21:月額広告費 22:辞めた媒体
    // 23:商談メモ 24:温度感 25:次回アクション 26:期日
    // 27:担当営業 28:トップ売上 29:契約ステータス
    // 30:転職道応募数 31:転職道入社数 32:企業ID
    // 33:競合媒体単価 34:ドライバー充足率 35:契約更新日
    // 36:担当者役職 37:契約開始日

    const companyId = row[32]?.trim()
    const name = row[1]?.trim()

    if (!name) { results.skip++; continue }

    // 企業IDで既存レコードを検索
    let existing = null
    if (companyId) {
      existing = await prisma.company.findUnique({ where: { companyId } })
    }
    if (!existing) {
      // 企業名で検索
      existing = await prisma.company.findFirst({ where: { name } })
    }
    if (!existing) { results.notFound++; continue }

    const tantou = row[27]?.trim()
    const userId = (tantou && userMap[tantou]) ? userMap[tantou] : existing.userId

    // 競合媒体情報をJSON構築
    const competitorMedia = []
    const mediaName = row[20]?.trim()
    const costPerHire = parseNum(row[17])
    if (mediaName) {
      competitorMedia.push({
        name: mediaName,
        monthly: parseNum(row[21]),
        costPerHire,
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