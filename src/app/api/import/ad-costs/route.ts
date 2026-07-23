import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import { canImportData } from "@/lib/permissions"

const prisma = new PrismaClient()

type ParsedRow = {
  line: number
  year: number
  month: number
  name: string
  category: string
  inflow: string | null
  totalCost: number
  memo: string | null
}

type RowError = { line: number; message: string }

// CSV1行をカンマ分割する（ダブルクォート対応）
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = false
      } else cur += ch
    } else {
      if (ch === '"') inQuote = true
      else if (ch === ",") { out.push(cur); cur = "" }
      else cur += ch
    }
  }
  out.push(cur)
  return out
}

// CSVテキストをパースして行データとエラーに分ける
function parseCsv(text: string) {
  // BOM除去
  const clean = text.replace(/^\uFEFF/, "")
  const lines = clean.split(/\r?\n/).filter(l => l.trim() !== "")

  if (lines.length === 0) {
    return { rows: [], errors: [{ line: 0, message: "ファイルが空です" }], months: [] }
  }

  const header = splitCsvLine(lines[0]).map(h => h.trim())
  const required = ["year", "month", "name", "category", "inflow", "totalCost"]
  const missing = required.filter(r => !header.includes(r))
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [{ line: 1, message: "必須列がありません: " + missing.join(", ") }],
      months: [],
    }
  }

  const idx: Record<string, number> = {}
  header.forEach((h, i) => { idx[h] = i })

  const rows: ParsedRow[] = []
  const errors: RowError[] = []
  const seenKeys = new Set<string>()

  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1
    const cols = splitCsvLine(lines[i])
    const get = (key: string) => (idx[key] != null ? (cols[idx[key]] ?? "").trim() : "")

    const yearStr = get("year")
    const monthStr = get("month")
    const name = get("name")
    const category = get("category")
    const inflow = get("inflow")
    const costStr = get("totalCost").replace(/,/g, "")
    const memo = get("memo")

    if (!name) { errors.push({ line: lineNo, message: "name が空です" }); continue }

    const year = Number(yearStr)
    const month = Number(monthStr)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      errors.push({ line: lineNo, message: "year が不正です: " + yearStr }); continue
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      errors.push({ line: lineNo, message: "month が不正です: " + monthStr }); continue
    }

    if (category !== "direct" && category !== "overhead") {
      errors.push({ line: lineNo, message: "category は direct か overhead です: " + category }); continue
    }
    if (category === "direct" && !inflow) {
      errors.push({ line: lineNo, message: "direct には inflow が必要です（" + name + "）" }); continue
    }

    if (costStr === "") {
      errors.push({ line: lineNo, message: "totalCost が空です" }); continue
    }
    const totalCost = Number(costStr)
    if (!Number.isFinite(totalCost)) {
      errors.push({ line: lineNo, message: "totalCost が数値ではありません: " + costStr }); continue
    }

    const key = name + "|" + year + "|" + month
    if (seenKeys.has(key)) {
      errors.push({ line: lineNo, message: "同じ年月に同名の費用が重複しています: " + name }); continue
    }
    seenKeys.add(key)

    rows.push({
      line: lineNo,
      year,
      month,
      name,
      category,
      inflow: category === "overhead" ? null : inflow,
      totalCost: Math.round(totalCost),
      memo: memo || null,
    })
  }

  const monthSet = new Set(rows.map(r => r.year + "-" + r.month))
  const months = Array.from(monthSet)
    .map(s => { const [y, m] = s.split("-").map(Number); return { year: y, month: m } })
    .sort((a, b) => a.year - b.year || a.month - b.month)

  return { rows, errors, months }
}

// POST /api/import/ad-costs
// body: { csv: string, dryRun: boolean }
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "未認証です" }, { status: 401 })
  if (!canImportData(session)) return NextResponse.json({ error: "権限がありません" }, { status: 403 })

  const body = await req.json()
  const csv: string = body.csv ?? ""
  const dryRun: boolean = body.dryRun !== false

  const { rows, errors, months } = parseCsv(csv)

  // DBに存在する流入元と突き合わせて警告を作る（応募0でも費用は発生しうるのでエラーにはしない）
  const knownInflows = await prisma.applicationRecord.findMany({
    select: { inflow: true },
    distinct: ["inflow"],
  })
  const knownSet = new Set(knownInflows.map(k => k.inflow))
  const unknownInflows = Array.from(
    new Set(rows.filter(r => r.inflow && !knownSet.has(r.inflow)).map(r => r.inflow as string))
  ).sort()

  const summary = {
    totalRows: rows.length,
    directRows: rows.filter(r => r.category === "direct").length,
    overheadRows: rows.filter(r => r.category === "overhead").length,
    totalAmount: rows.reduce((s, r) => s + r.totalCost, 0),
    months,
    unknownInflows,
  }

  if (dryRun) {
    return NextResponse.json({ dryRun: true, summary, errors })
  }

  if (errors.length > 0) {
    return NextResponse.json(
      { error: "エラーがあるため取り込めません。先にCSVを修正してください。", errors },
      { status: 400 }
    )
  }

  // 洗い替え：CSVに含まれる月の既存明細を削除してから投入する
  let deleted = 0
  for (const m of months) {
    const res = await prisma.adCost.deleteMany({ where: { year: m.year, month: m.month } })
    deleted += res.count
  }

  await prisma.adCost.createMany({
    data: rows.map(r => ({
      name: r.name,
      inflow: r.inflow,
      year: r.year,
      month: r.month,
      category: r.category,
      costType: "operation",
      unitPrice: null,
      totalCost: r.totalCost,
      memo: r.memo,
    })),
  })

  return NextResponse.json({
    dryRun: false,
    deleted,
    created: rows.length,
    summary,
  })
}