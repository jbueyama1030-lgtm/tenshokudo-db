import { PrismaClient } from "@prisma/client"

/**
 * 応募明細CSVの取り込み。
 *
 * 【方式】
 * CSVに含まれる年月のデータを削除してから入れ直す「洗い替え」。
 * 応募のステータスは後から変わる（未対応→面接設定済み→入社）ため、
 * 追加ではなく置き換えにして常に最新の状態を反映する。
 *
 * 【安全装置】
 * 取り込み後の件数が既存より大幅に減る場合は中断する。
 * CSVが不完全な状態で来たときに既存データを失わないため。
 */

// 取り込み後の件数がこの割合を下回ったら中断（0.8 = 2割以上減ったら異常とみなす）
const SHRINK_GUARD_RATIO = 0.8

// createMany の1回あたりの件数
const BATCH_SIZE = 5000

export type ImportResult = {
  success: number
  skip: number
  error: number
  shifted: number
  unmatched: number
  deleted: number
  aborted?: string   // 中断した場合の理由
}

/** CSVを1行ずつ配列にパース（ダブルクォート対応の簡易パーサ） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += c
      }
    } else {
      if (c === '"') inQuotes = true
      else if (c === ",") { cur.push(field); field = "" }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = "" }
      else if (c === "\r") { /* skip */ }
      else field += c
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur) }
  return rows
}

/** バイト列を文字コード自動判定でテキスト化（UTF-8優先、化けたらShift-JIS） */
export function decodeCsv(buf: ArrayBuffer | Buffer): string {
  const bytes = buf instanceof Buffer ? new Uint8Array(buf) : new Uint8Array(buf)
  let text = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "")
  const badCount = (text.match(/\uFFFD/g) || []).length
  if (badCount > 5) {
    try {
      text = new TextDecoder("shift-jis").decode(bytes).replace(/^\uFEFF/, "")
    } catch { /* shift-jis 未対応環境ならそのまま */ }
  }
  return text
}

/** 応募日文字列をパース：「2026/07/16(木)14:20:02」「2026/07/16(木)14:20」両対応 */
export function parseAppliedAt(raw: string): Date | null {
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

/** 企業ID正規化：全角→半角、.0除去、前後空白除去 */
export function normalizeCompanyId(raw: string): string {
  if (!raw) return ""
  let s = String(raw).trim()
  s = s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  if (/^\d+\.0+$/.test(s)) s = s.split(".")[0]
  return s
}

type Parsed = {
  sourceCompanyId: string
  appliedAt: Date
  status: string
  inflow: string
  entryType: string | null
  companyRef: string | null
  year: number
  month: number
}

/**
 * CSVテキストを取り込む。
 * skipGuard = true で件数チェックを無効化（手動で意図的に少量を入れる場合）。
 */
export async function importApplicationsCsv(
  prisma: PrismaClient,
  csvText: string,
  options: { skipGuard?: boolean } = {}
): Promise<ImportResult> {
  const results: ImportResult = {
    success: 0, skip: 0, error: 0, shifted: 0, unmatched: 0, deleted: 0,
  }

  const parsedCsv = parseCsv(csvText)
  if (parsedCsv.length < 2) {
    return { ...results, aborted: "データ行が見つかりません" }
  }

  const header = parsedCsv[0].map(h => h.trim())
  const iDate = header.indexOf("応募日")
  const iCompanyId = header.indexOf("企業ID")
  const iStatus = header.indexOf("ステータス")
  const iInflow = header.indexOf("流入")
  // 種別は無くても取り込めるようにする（旧CSVとの互換）
  const iEntryType = header.indexOf("種別")

  if (iDate < 0 || iCompanyId < 0 || iStatus < 0 || iInflow < 0) {
    return { ...results, aborted: "必要な列（応募日 / 企業ID / ステータス / 流入）が見つかりません" }
  }

  // 企業マスタ（companyId → Company.id）
  const companies = await prisma.company.findMany({ select: { id: true, companyId: true } })
  const companyMap: Record<string, string> = {}
  companies.forEach(c => { if (c.companyId) companyMap[c.companyId] = c.id })

  // --- パース ---
  const parsed: Parsed[] = []
  const monthsInCsv = new Set<string>()

  for (const r of parsedCsv.slice(1)) {
    if (r.length <= iDate) continue
    const rawDate = (r[iDate] ?? "").trim()
    const sourceCompanyId = normalizeCompanyId((r[iCompanyId] ?? "").trim())
    if (!rawDate && !sourceCompanyId) continue

    const status = (r[iStatus] ?? "").trim()
    const inflow = (r[iInflow] ?? "").trim() || "未設定"
    const entryType = iEntryType >= 0 ? ((r[iEntryType] ?? "").trim() || null) : null
    const appliedAt = parseAppliedAt(rawDate)

    if (!rawDate || !sourceCompanyId || !appliedAt) { results.skip++; continue }

    const year = appliedAt.getFullYear()
    const month = appliedAt.getMonth() + 1
    monthsInCsv.add(year + "-" + month)

    const companyRef = companyMap[sourceCompanyId] ?? null
    if (!companyRef) results.unmatched++

    parsed.push({ sourceCompanyId, appliedAt, status, inflow, entryType, companyRef, year, month })
  }

  if (parsed.length === 0) {
    return { ...results, aborted: "取り込める行がありませんでした" }
  }

  // --- 安全装置：既存データが大幅に減る場合は中断 ---
  const targetMonths = Array.from(monthsInCsv).map(ym => {
    const [y, m] = ym.split("-").map(Number)
    return { year: y, month: m }
  })

  if (!options.skipGuard) {
    const existing = await prisma.applicationRecord.count({ where: { OR: targetMonths } })
    if (existing > 0 && parsed.length < existing * SHRINK_GUARD_RATIO) {
      return {
        ...results,
        aborted:
          "件数が大幅に減少しているため中断しました（既存 " + existing +
          " 件 → CSV " + parsed.length + " 件）。CSVが不完全な可能性があります。",
      }
    }
  }

  // --- 秒ずらし（同一キーの衝突をメモリ上で解決） ---
  const usedKeys = new Set<string>()
  for (const p of parsed) {
    let keyStr = p.sourceCompanyId + "|" + p.appliedAt.getTime() + "|" + p.inflow
    while (usedKeys.has(keyStr)) {
      p.appliedAt = new Date(p.appliedAt.getTime() + 1000)
      p.year = p.appliedAt.getFullYear()
      p.month = p.appliedAt.getMonth() + 1
      keyStr = p.sourceCompanyId + "|" + p.appliedAt.getTime() + "|" + p.inflow
      results.shifted++
    }
    usedKeys.add(keyStr)
  }

  // --- 洗い替え：CSVに含まれる年月の既存データを削除 ---
  const del = await prisma.applicationRecord.deleteMany({ where: { OR: targetMonths } })
  results.deleted = del.count

  // --- バッチ投入 ---
  for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
    const chunk = parsed.slice(i, i + BATCH_SIZE)
    try {
      const res = await prisma.applicationRecord.createMany({
        data: chunk.map(p => ({
          sourceCompanyId: p.sourceCompanyId,
          companyRef: p.companyRef,
          appliedAt: p.appliedAt,
          year: p.year,
          month: p.month,
          status: p.status,
          inflow: p.inflow,
          entryType: p.entryType,
        })),
        skipDuplicates: true,
      })
      results.success += res.count
    } catch {
      results.error += chunk.length
    }
  }

  return results
}