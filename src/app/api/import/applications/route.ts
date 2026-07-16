import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// 応募日文字列をパース：「2026/07/16(木)14:20:02」「2026/07/16(木)14:20」両対応
// 曜日カッコを除去して Date にする
function parseAppliedAt(raw: string): Date | null {
  if (!raw) return null
  // 曜日カッコ (木) などを除去
  const cleaned = raw.replace(/\([^)]*\)/g, " ").trim()
  // 例: "2026/07/16 14:20:02" または "2026/07/16 14:20"
  const m = cleaned.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  const date = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    s ? Number(s) : 0
  )
  return isNaN(date.getTime()) ? null : date
}

// 企業IDを正規化：全角→半角、.0除去、前後空白除去
function normalizeCompanyId(raw: string): string {
  if (!raw) return ""
  let s = String(raw).trim()
  // 全角数字→半角
  s = s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  // "3843.0" のような小数表記を整数に
  if (/^\d+\.0+$/.test(s)) s = s.split(".")[0]
  return s
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // 管理者のみ取り込み可
  const role = session.user.role
  const isAdmin = role !== "sales" && role !== "production"
  if (!isAdmin) {
    return NextResponse.json({ error: "取り込みは管理者のみ可能です" }, { status: 403 })
  }

  const { rows } = await req.json()
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "データ形式が不正です" }, { status: 400 })
  }

  // 企業マスタを一括取得（companyId → Company.id のマップ）
  const companies = await prisma.company.findMany({ select: { id: true, companyId: true } })
  const companyMap: Record<string, string> = {}
  companies.forEach(c => {
    if (c.companyId) companyMap[c.companyId] = c.id
  })

  const results = { success: 0, skip: 0, error: 0, shifted: 0, unmatched: 0 }

  // このバッチ内で使用済みの (sourceCompanyId, 時刻ms, inflow) を記録し、
  // 同一キー衝突時は appliedAt を1秒ずつ後ろにずらす（案B）
  const usedKeys = new Set<string>()

  for (const row of rows) {
    // row: { appliedAt, companyId, status, inflow }
    const rawDate = row.appliedAt
    const sourceCompanyId = normalizeCompanyId(row.companyId)
    const status = (row.status ?? "").toString().trim()
    const inflow = (row.inflow ?? "").toString().trim() || "未設定"

    if (!rawDate || !sourceCompanyId) { results.skip++; continue }

    let appliedAt = parseAppliedAt(rawDate)
    if (!appliedAt) { results.skip++; continue }

    // 案B：同一キー（企業ID＋時刻＋流入）が既に使われていたら1秒ずつずらす
    let keyStr = sourceCompanyId + "|" + appliedAt.getTime() + "|" + inflow
    let wasShifted = false
    while (usedKeys.has(keyStr)) {
      appliedAt = new Date(appliedAt.getTime() + 1000) // +1秒
      keyStr = sourceCompanyId + "|" + appliedAt.getTime() + "|" + inflow
      wasShifted = true
    }
    usedKeys.add(keyStr)
    if (wasShifted) results.shifted++

    const companyRef = companyMap[sourceCompanyId] ?? null
    if (!companyRef) results.unmatched++

    try {
      await prisma.applicationRecord.upsert({
        where: {
          uniqueApplication: {
            sourceCompanyId,
            appliedAt,
            inflow,
          },
        },
        update: {
          status,
          companyRef,
          year: appliedAt.getFullYear(),
          month: appliedAt.getMonth() + 1,
        },
        create: {
          sourceCompanyId,
          companyRef,
          appliedAt,
          year: appliedAt.getFullYear(),
          month: appliedAt.getMonth() + 1,
          status,
          inflow,
        },
      })
      results.success++
    } catch {
      results.error++
    }
  }

  return NextResponse.json(results)
}