// 置き場所: src/lib/adCostSheet.ts
// 損益表（スプレッドシート）から貼り付けた広告費の表を読み取る。画面側で使う（サーバーの依存なし）

export type SheetItem = {
  /** 損益表の明細名 */
  name: string
  /** 損益表の種別（リスティング・外部媒体など。参考表示用） */
  kind: string
  /** "2026-05" → 金額（税込・円） */
  amounts: Record<string, number>
}

export type ParseResult = {
  items: SheetItem[]
  /** 見つかった月（"2026-05" の形・古い順） */
  months: string[]
  error?: string
}

/** "¥1,234" "(¥100,000)" "1234" → 数値。空・読めないものは null */
export function parseYen(raw: string): number | null {
  const s = (raw ?? "").trim()
  if (!s || s.startsWith("#")) return null
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-") || s.startsWith("−")
  const digits = s.replace(/[^0-9.]/g, "")
  if (!digits) return null
  const n = Math.round(Number(digits))
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

/**
 * 貼り付けたテキスト（タブ区切り。CSVでも可）を読み取る。
 * - 「05月」「06月」…の見出しの行を探し、月の列を決める（年度は fiscalYear。5月〜翌4月）
 * - 「■広告費（転職道）」の行があれば、そこから次の「■」の行までだけを読む（TSJ・外注費などは読まない）
 * - 明細名の列は「種別」の見出しの左隣。無ければ月の列より左で最初に文字がある列
 */
export function parseSheet(text: string, fiscalYear: number): ParseResult {
  const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim() !== "")
  const sep = lines.some(l => l.includes("\t")) ? "\t" : ","
  const rows = lines.map(l => splitLine(l, sep))

  // 月の見出しの行
  const headerIdx = rows.findIndex(r => r.filter(c => /^\s*\d{1,2}月\s*$/.test(c)).length >= 3)
  if (headerIdx < 0) return { items: [], months: [], error: "「05月」「06月」のような月の見出しの行が見つかりません。見出しの行も含めてコピーしてください。" }
  const header = rows[headerIdx]

  const monthCols: { col: number; ym: string }[] = []
  header.forEach((c, i) => {
    const m = /^\s*(\d{1,2})月\s*$/.exec(c)
    if (!m) return
    const month = Number(m[1])
    const year = month >= 5 ? fiscalYear : fiscalYear + 1
    monthCols.push({ col: i, ym: `${year}-${String(month).padStart(2, "0")}` })
  })
  const firstMonthCol = Math.min(...monthCols.map(m => m.col))

  const kindCol = header.findIndex(c => c.trim() === "種別")
  // 明細名の列：「種別」の左隣、無ければ月の列より左で文字が多い列
  let nameCol = kindCol > 0 ? kindCol - 1 : -1
  if (nameCol < 0) {
    const counts = new Array(firstMonthCol).fill(0)
    for (const r of rows.slice(headerIdx + 1)) {
      for (let i = 0; i < firstMonthCol; i++) if ((r[i] ?? "").trim().length > 1 && parseYen(r[i] ?? "") == null) counts[i]++
    }
    nameCol = counts.indexOf(Math.max(...counts))
  }

  // 範囲：■広告費（転職道） 〜 次の■
  let body = rows.slice(headerIdx + 1)
  const startIdx = body.findIndex(r => (r[nameCol] ?? "").includes("■") && (r[nameCol] ?? "").includes("転職道"))
  if (startIdx >= 0) {
    body = body.slice(startIdx + 1)
    const endIdx = body.findIndex(r => (r[nameCol] ?? "").trim().startsWith("■"))
    if (endIdx >= 0) body = body.slice(0, endIdx)
  } else {
    body = body.filter(r => !(r[nameCol] ?? "").trim().startsWith("■"))
  }

  const items: SheetItem[] = []
  for (const r of body) {
    const name = (r[nameCol] ?? "").trim()
    if (!name || name === "種別") continue
    const amounts: Record<string, number> = {}
    for (const mc of monthCols) {
      const v = parseYen(r[mc.col] ?? "")
      if (v != null && v !== 0) amounts[mc.ym] = v
    }
    items.push({ name, kind: kindCol >= 0 ? (r[kindCol] ?? "").trim() : "", amounts })
  }

  return { items, months: monthCols.map(m => m.ym).sort() }
}

/** タブ区切り、またはダブルクォート対応のカンマ区切りを1行分に分ける */
function splitLine(line: string, sep: string): string[] {
  if (sep === "\t") return line.split("\t")
  const out: string[] = []
  let cur = ""
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false }
      else cur += c
    } else if (c === '"') q = true
    else if (c === ",") { out.push(cur); cur = "" }
    else cur += c
  }
  out.push(cur)
  return out
}

/** "2026-05" → { year: 2026, month: 5 } */
export function splitYm(ym: string): { year: number; month: number } {
  const [y, m] = ym.split("-").map(Number)
  return { year: y, month: m }
}

/** 今日が属する年度（5月始まり） */
export function currentFiscalYear(d: Date = new Date()): number {
  return d.getMonth() + 1 >= 5 ? d.getFullYear() : d.getFullYear() - 1
}
