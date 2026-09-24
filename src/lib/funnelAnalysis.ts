import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { extractPref, UNKNOWN_PREF } from "@/lib/area"

// =====================================================================
// 段階の定義（レポート用。マーケ分析画面の接触/面接完了とは別物）
// =====================================================================

/**
 * 面接設定 到達。
 * 不採用は含めない（書類段階の不採用が多く、含めると設定数が水増しされ
 * 面接設定→面接実施率が不当に低く出るため）。
 */
export const STAGE_INTERVIEW_SET = [
  "面接設定済み", "面接来ず", "面接完了", "内定通知済み", "入社", "面接・内定後辞退",
]
/** 面接実施 */
export const STAGE_INTERVIEW_DONE = ["面接完了", "内定通知済み", "入社", "面接・内定後辞退"]
/** 入社 */
export const STAGE_HIRED = ["入社"]
/** 別枠：不採用（面接前後の判別不可） */
export const STATUS_REJECTED = "不採用"
/** 別枠：問い合わせのみ（応募数には含める） */
export const STATUS_INQUIRY_ONLY = "問い合わせのみ"

/** 比較対象がこの社数未満なら比較を出さない */
export const MIN_COMPARISON_COMPANIES = 5

/** 同規模の帯（保有台数）。max=null は上限なし */
export const SIZE_BANDS: { key: string; label: string; min: number; max: number | null }[] = [
  { key: "small", label: "保有台数 〜30台", min: 1, max: 30 },
  { key: "medium", label: "保有台数 31〜100台", min: 31, max: 100 },
  { key: "large", label: "保有台数 101台〜", min: 101, max: null },
]

// =====================================================================
// 型
// =====================================================================

export type YearMonth = { year: number; month: number }
export type Period = { from: YearMonth; to: YearMonth }

export type FunnelCounts = {
  apply: number
  interviewSet: number
  interviewDone: number
  hired: number
  /** 別枠。どの段階にも含めない */
  rejected: number
  /** 別枠。応募数には含まれている */
  inquiryOnly: number
}

/** 率は 0〜1 の小数。分母0は null（表示側で「—」にする） */
export type FunnelRates = {
  applyToSet: number | null
  setToDone: number | null
  doneToHire: number | null
  applyToHire: number | null
}

export type MonthlyPoint = YearMonth & {
  counts: FunnelCounts
  uu: number
  rates: FunnelRates
}

export type Comparison =
  | {
      available: true
      label: string
      /** 期間内に応募が1件以上あった比較対象企業の数（自社除く） */
      companyCount: number
      totals: FunnelCounts
      /** 1社あたり平均（totals ÷ companyCount） */
      perCompany: FunnelCounts
      /** 各社UUの合計（同一人物が複数社に応募していれば重複して数える） */
      uuTotal: number
      /** 率は合計÷合計（各社の率の平均ではない） */
      rates: FunnelRates
      applyPerUu: number | null
    }
  | { available: false; label: string; reason: string }

export type CompanyFunnelReport = {
  company: {
    id: string
    name: string
    companyId: string | null
    prefecture: string
    vehicleCount: number | null
    driverCount: number | null
  }
  period: Period
  generatedAt: string
  total: {
    counts: FunnelCounts
    uu: number
    /** 電話番号ハッシュがある応募の割合。低いと UU・延べ/UU が信頼できない */
    uuCoverage: number | null
    rates: FunnelRates
    applyPerUu: number | null
    /** ステータス別の生件数（検算・デバッグ用） */
    statusBreakdown: Record<string, number>
  }
  monthly: MonthlyPoint[]
  comparisons: {
    area: Comparison
    size: Comparison
  }
  /** 固定文の注記。AIには書かせず、そのまま表示する */
  notes: string[]
}

// =====================================================================
// 期間ユーティリティ
// =====================================================================

export function ymKey(ym: YearMonth): number {
  return ym.year * 100 + ym.month
}

/** to を終端とする months ヶ月分の期間 */
export function periodEndingAt(to: YearMonth, months: number): Period {
  const total = to.year * 12 + (to.month - 1) - (months - 1)
  return { from: { year: Math.floor(total / 12), month: (total % 12) + 1 }, to }
}

export function monthsInPeriod(p: Period): YearMonth[] {
  const out: YearMonth[] = []
  let y = p.from.year
  let m = p.from.month
  while (y * 100 + m <= ymKey(p.to)) {
    out.push({ year: y, month: m })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

/**
 * 期間の where 句。appliedAt ではなく year/month で判定する
 * （appliedAt はUTC保存のため、月境界で9時間ずれる可能性がある）。
 */
function periodWhere(p: Period): Prisma.ApplicationRecordWhereInput {
  const { from, to } = p
  if (from.year === to.year) {
    return { year: from.year, month: { gte: from.month, lte: to.month } }
  }
  const or: Prisma.ApplicationRecordWhereInput[] = [
    { year: from.year, month: { gte: from.month } },
    { year: to.year, month: { lte: to.month } },
  ]
  if (to.year - from.year > 1) {
    or.push({ year: { gt: from.year, lt: to.year } })
  }
  return { OR: or }
}

function validatePeriod(p: Period) {
  for (const ym of [p.from, p.to]) {
    if (!Number.isInteger(ym.year) || !Number.isInteger(ym.month) || ym.month < 1 || ym.month > 12) {
      throw new Error(`不正な年月です: ${ym.year}-${ym.month}`)
    }
  }
  if (ymKey(p.from) > ymKey(p.to)) {
    throw new Error("期間の開始が終了より後になっています")
  }
}

// =====================================================================
// 集計ユーティリティ
// =====================================================================

function emptyCounts(): FunnelCounts {
  return { apply: 0, interviewSet: 0, interviewDone: 0, hired: 0, rejected: 0, inquiryOnly: 0 }
}

function addStatus(c: FunnelCounts, status: string, n: number) {
  c.apply += n
  if (STAGE_INTERVIEW_SET.includes(status)) c.interviewSet += n
  if (STAGE_INTERVIEW_DONE.includes(status)) c.interviewDone += n
  if (STAGE_HIRED.includes(status)) c.hired += n
  if (status === STATUS_REJECTED) c.rejected += n
  if (status === STATUS_INQUIRY_ONLY) c.inquiryOnly += n
}

function addCounts(a: FunnelCounts, b: FunnelCounts) {
  a.apply += b.apply
  a.interviewSet += b.interviewSet
  a.interviewDone += b.interviewDone
  a.hired += b.hired
  a.rejected += b.rejected
  a.inquiryOnly += b.inquiryOnly
}

function divideCounts(c: FunnelCounts, n: number): FunnelCounts {
  return {
    apply: c.apply / n,
    interviewSet: c.interviewSet / n,
    interviewDone: c.interviewDone / n,
    hired: c.hired / n,
    rejected: c.rejected / n,
    inquiryOnly: c.inquiryOnly / n,
  }
}

function div(a: number, b: number): number | null {
  return b > 0 ? a / b : null
}

export function ratesOf(c: FunnelCounts): FunnelRates {
  return {
    applyToSet: div(c.interviewSet, c.apply),
    setToDone: div(c.interviewDone, c.interviewSet),
    doneToHire: div(c.hired, c.interviewDone),
    applyToHire: div(c.hired, c.apply),
  }
}

function sizeBandOf(vehicleCount: number | null): (typeof SIZE_BANDS)[number] | null {
  if (vehicleCount == null || vehicleCount <= 0) return null
  return SIZE_BANDS.find(b => vehicleCount >= b.min && (b.max == null || vehicleCount <= b.max)) ?? null
}

// =====================================================================
// 本体
// =====================================================================

/**
 * 1社ぶんのファネル・歩留まり・月次推移・UUと、比較対象（エリア/同規模）を返す。
 * 数字はすべてここで確定させる。AIには計算させない。
 *
 * @param companyDbId Company.id（cuid）。転職道側の companyId ではない
 * @returns 企業が存在しなければ null
 *
 * 注意: アクセス制御（代理店スコープ）はここでは行わない。呼び出し側のAPIで判定すること。
 * 比較対象は全社（他代理店・直販を含む）の匿名集計になる。
 */
export async function analyzeCompanyFunnel(
  companyDbId: string,
  period: Period,
): Promise<CompanyFunnelReport | null> {
  validatePeriod(period)

  const company = await prisma.company.findUnique({
    where: { id: companyDbId },
    select: { id: true, name: true, companyId: true, address: true, vehicleCount: true, driverCount: true },
  })
  if (!company) return null

  const prefecture = extractPref(company.address)
  const fromKey = ymKey(period.from)
  const toKey = ymKey(period.to)
  const months = monthsInPeriod(period)

  // ---------------- 自社 ----------------

  const [ownStatusRows, ownUuMonthly, ownUuTotalRows] = await Promise.all([
    prisma.applicationRecord.groupBy({
      by: ["year", "month", "status"],
      where: { AND: [periodWhere(period), { companyRef: company.id }] },
      _count: { _all: true },
    }),
    prisma.$queryRaw<{ year: number; month: number; uu: number }[]>`
      SELECT "year", "month", COUNT(DISTINCT "phoneHash")::int AS uu
      FROM "ApplicationRecord"
      WHERE "companyRef" = ${company.id}
        AND ("year" * 100 + "month") BETWEEN ${fromKey} AND ${toKey}
      GROUP BY "year", "month"
    `,
    prisma.$queryRaw<{ uu: number; withPhone: number }[]>`
      SELECT COUNT(DISTINCT "phoneHash")::int AS uu,
             COUNT(*) FILTER (WHERE "phoneHash" IS NOT NULL)::int AS "withPhone"
      FROM "ApplicationRecord"
      WHERE "companyRef" = ${company.id}
        AND ("year" * 100 + "month") BETWEEN ${fromKey} AND ${toKey}
    `,
  ])

  const totalCounts = emptyCounts()
  const statusBreakdown: Record<string, number> = {}
  const monthlyCounts = new Map<number, FunnelCounts>()
  for (const ym of months) monthlyCounts.set(ymKey(ym), emptyCounts())

  for (const r of ownStatusRows) {
    const n = r._count._all
    addStatus(totalCounts, r.status, n)
    statusBreakdown[r.status] = (statusBreakdown[r.status] ?? 0) + n
    const mc = monthlyCounts.get(r.year * 100 + r.month)
    if (mc) addStatus(mc, r.status, n)
  }

  const uuByMonth = new Map<number, number>()
  for (const r of ownUuMonthly) uuByMonth.set(r.year * 100 + r.month, Number(r.uu))

  const ownUu = Number(ownUuTotalRows[0]?.uu ?? 0)
  const withPhone = Number(ownUuTotalRows[0]?.withPhone ?? 0)
  const uuCoverage = div(withPhone, totalCounts.apply)

  const monthly: MonthlyPoint[] = months.map(ym => {
    const counts = monthlyCounts.get(ymKey(ym)) ?? emptyCounts()
    return { ...ym, counts, uu: uuByMonth.get(ymKey(ym)) ?? 0, rates: ratesOf(counts) }
  })

  // ---------------- 比較対象の元データ（全社・期間内） ----------------

  const [allStatusRows, allUuRows] = await Promise.all([
    prisma.applicationRecord.groupBy({
      by: ["companyRef", "status"],
      where: { AND: [periodWhere(period), { companyRef: { not: null } }] },
      _count: { _all: true },
    }),
    prisma.$queryRaw<{ companyRef: string; uu: number }[]>`
      SELECT "companyRef", COUNT(DISTINCT "phoneHash")::int AS uu
      FROM "ApplicationRecord"
      WHERE "companyRef" IS NOT NULL
        AND ("year" * 100 + "month") BETWEEN ${fromKey} AND ${toKey}
      GROUP BY "companyRef"
    `,
  ])

  const countsByCompany = new Map<string, FunnelCounts>()
  for (const r of allStatusRows) {
    if (!r.companyRef) continue
    let c = countsByCompany.get(r.companyRef)
    if (!c) { c = emptyCounts(); countsByCompany.set(r.companyRef, c) }
    addStatus(c, r.status, r._count._all)
  }
  const uuByCompany = new Map<string, number>()
  for (const r of allUuRows) uuByCompany.set(r.companyRef, Number(r.uu))

  const otherIds = Array.from(countsByCompany.keys()).filter(id => id !== company.id)
  const otherMeta = await prisma.company.findMany({
    where: { id: { in: otherIds } },
    select: { id: true, address: true, vehicleCount: true },
  })

  const aggregate = (label: string, ids: string[]): Comparison => {
    if (ids.length < MIN_COMPARISON_COMPANIES) {
      return {
        available: false,
        label,
        reason: `比較対象が${ids.length}社のため省略（${MIN_COMPARISON_COMPANIES}社以上で表示）`,
      }
    }
    const totals = emptyCounts()
    let uuTotal = 0
    for (const id of ids) {
      const c = countsByCompany.get(id)
      if (c) addCounts(totals, c)
      uuTotal += uuByCompany.get(id) ?? 0
    }
    const n = ids.length
    return {
      available: true,
      label,
      companyCount: n,
      totals,
      perCompany: divideCounts(totals, n),
      uuTotal,
      rates: ratesOf(totals),
      applyPerUu: div(totals.apply, uuTotal),
    }
  }

  // エリア（同一都道府県）
  let area: Comparison
  if (prefecture === UNKNOWN_PREF) {
    area = { available: false, label: "エリア平均", reason: "住所が未入力（または都道府県を判定できない）のため省略" }
  } else {
    const ids = otherMeta.filter(c => extractPref(c.address) === prefecture).map(c => c.id)
    area = aggregate(`${prefecture}平均`, ids)
  }

  // 同規模（保有台数の帯・全国）
  let size: Comparison
  const band = sizeBandOf(company.vehicleCount)
  if (!band) {
    size = { available: false, label: "同規模平均", reason: "保有台数が未入力のため省略" }
  } else {
    const ids = otherMeta.filter(c => sizeBandOf(c.vehicleCount)?.key === band.key).map(c => c.id)
    size = aggregate(`同規模平均（${band.label}）`, ids)
  }

  // ---------------- 注記（固定文） ----------------

  const notes: string[] = []
  if (totalCounts.inquiryOnly > 0) {
    notes.push(
      `応募${totalCounts.apply}件のうち${totalCounts.inquiryOnly}件は「問い合わせのみ」です（応募数に含めています）。`,
    )
  }
  if (totalCounts.rejected > 0) {
    notes.push(
      `不採用${totalCounts.rejected}件は、書類段階と面接後の判別ができないため「面接設定」「面接実施」のいずれにも含めていません。`,
    )
  }
  if (uuCoverage != null && uuCoverage < 0.9) {
    notes.push(
      `電話番号のない応募が${Math.round((1 - uuCoverage) * 100)}%あるため、実人数（UU）は参考値です。`,
    )
  }

  return {
    company: {
      id: company.id,
      name: company.name,
      companyId: company.companyId,
      prefecture,
      vehicleCount: company.vehicleCount,
      driverCount: company.driverCount,
    },
    period,
    generatedAt: new Date().toISOString(),
    total: {
      counts: totalCounts,
      uu: ownUu,
      uuCoverage,
      rates: ratesOf(totalCounts),
      applyPerUu: div(totalCounts.apply, ownUu),
      statusBreakdown,
    },
    monthly,
    comparisons: { area, size },
    notes,
  }
}