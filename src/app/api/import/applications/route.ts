import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// 応募日文字列をパース：「2026/07/16(木)14:20:02」「2026/07/16(木)14:20」両対応
function parseAppliedAt(raw: string): Date | null {
  if (!raw) return null
  const cleaned = raw.replace(/\([^)]*\)/g, " ").trim()
  const m = cleaned.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  const date = new Date(
    Number(y), Number(mo) - 1, Number(d),
    Number(h), Number(mi), s ? Number(s) : 0
  )
  return isNaN(date.getTime()) ? null : date
}

// 企業ID正規化：全角→半角、.0除去、前後空白除去
function normalizeCompanyId(raw: string): string {
  if (!raw) return ""
  let s = String(raw).trim()
  s = s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  if (/^\d+\.0+$/.test(s)) s = s.split(".")[0]
  return s
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role
  const isAdmin = role !== "sales" && role !== "production"
  if (!isAdmin) {
    return NextResponse.json({ error: "取り込みは管理者のみ可能です" }, { status: 403 })
  }

  const { rows } = await req.json()
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "データ形式が不正です" }, { status: 400 })
  }

  // 企業マスタ（companyId → Company.id）
  const companies = await prisma.company.findMany({ select: { id: true, companyId: true } })
  const companyMap: Record<string, string> = {}
  companies.forEach(c => { if (c.companyId) companyMap[c.companyId] = c.id })

  // --- 1st pass: 全行をパースして、正規化済みレコード配列を作る ---
  type Parsed = {
    sourceCompanyId: string
    appliedAt: Date
    status: string
    inflow: string
    companyRef: string | null
  }
  const parsed: Parsed[] = []
  const monthsInCsv = new Set<string>()   // "2026-7" 形式
  const results = { success: 0, skip: 0, error: 0, shifted: 0, unmatched: 0 }

  for (const row of rows) {
    const sourceCompanyId = normalizeCompanyId(row.companyId)
    const status = (row.status ?? "").toString().trim()
    const inflow = (row.inflow ?? "").toString().trim() || "未設定"
    const appliedAt = parseAppliedAt(row.appliedAt)

    if (!row.appliedAt || !sourceCompanyId || !appliedAt) { results.skip++; continue }

    monthsInCsv.add(appliedAt.getFullYear() + "-" + (appliedAt.getMonth() + 1))
    const companyRef = companyMap[sourceCompanyId] ?? null
    if (!companyRef) results.unmatched++

    parsed.push({ sourceCompanyId, appliedAt, status, inflow, companyRef })
  }

  // --- 洗い替え：CSVに含まれる年月の既存データを削除 ---
  // これにより何度インポートしても重複しない
  for (const ym of monthsInCsv) {
    const [y, m] = ym.split("-").map(Number)
    await prisma.applicationRecord.deleteMany({ where: { year: y, month: m } })
  }

  // --- 2nd pass: 秒ずらし（このインポート内での衝突のみ）して挿入 ---
  const usedKeys = new Set<string>()

  for (const p of parsed) {
    let appliedAt = p.appliedAt
    let keyStr = p.sourceCompanyId + "|" + appliedAt.getTime() + "|" + p.inflow
    let wasShifted = false
    while (usedKeys.has(keyStr)) {
      appliedAt = new Date(appliedAt.getTime() + 1000)
      keyStr = p.sourceCompanyId + "|" + appliedAt.getTime() + "|" + p.inflow
      wasShifted = true
    }
    usedKeys.add(keyStr)
    if (wasShifted) results.shifted++

    try {
      await prisma.applicationRecord.create({
        data: {
          sourceCompanyId: p.sourceCompanyId,
          companyRef: p.companyRef,
          appliedAt,
          year: appliedAt.getFullYear(),
          month: appliedAt.getMonth() + 1,
          status: p.status,
          inflow: p.inflow,
        },
      })
      results.success++
    } catch {
      results.error++
    }
  }

  return NextResponse.json(results)
}