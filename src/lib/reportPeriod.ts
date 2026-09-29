// 置き場所: src/lib/reportPeriod.ts
import { prisma } from "@/lib/prisma"
import { addMonths, currentYmJst, periodEndingAt, ymKey, type Period, type YearMonth } from "@/lib/funnelAnalysis"

/** 指定できる最大月数 */
export const MAX_REPORT_MONTHS = 24

/** "2026-08" → { year: 2026, month: 8 }。不正なら null */
export function parseYm(s: unknown): YearMonth | null {
  if (typeof s !== "string") return null
  const m = /^(\d{4})-(\d{1,2})$/.exec(s.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  return { year, month }
}

/**
 * レポートの期間を決める。
 * - to 省略 → 先月（データが先月まで無ければデータの最新月）
 * - from 省略 → to から defaultMonths ヶ月さかのぼる
 */
export async function resolvePeriod(
  fromRaw: unknown,
  toRaw: unknown,
  defaultMonths: number,
): Promise<{ period: Period } | { error: string; status: number }> {
  const hasFrom = typeof fromRaw === "string" && fromRaw !== ""
  const hasTo = typeof toRaw === "string" && toRaw !== ""
  const fromParam = hasFrom ? parseYm(fromRaw) : null
  const toParam = hasTo ? parseYm(toRaw) : null
  if ((hasFrom && !fromParam) || (hasTo && !toParam)) {
    return { error: "期間は YYYY-MM 形式で指定してください", status: 400 }
  }

  let to: YearMonth
  if (toParam) {
    to = toParam
  } else {
    const last = await prisma.applicationRecord.findFirst({
      select: { year: true, month: true },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    })
    if (!last) return { error: "応募データがありません", status: 404 }
    const lastMonth = addMonths(currentYmJst(), -1)
    const latestData: YearMonth = { year: last.year, month: last.month }
    to = ymKey(latestData) < ymKey(lastMonth) ? latestData : lastMonth
  }

  const period: Period = fromParam ? { from: fromParam, to } : periodEndingAt(to, defaultMonths)
  if (ymKey(period.from) > ymKey(period.to)) {
    return { error: "期間の開始が終了より後になっています", status: 400 }
  }
  const months = (period.to.year - period.from.year) * 12 + (period.to.month - period.from.month) + 1
  if (months > MAX_REPORT_MONTHS) {
    return { error: `期間は最大${MAX_REPORT_MONTHS}ヶ月までです`, status: 400 }
  }
  return { period }
}
