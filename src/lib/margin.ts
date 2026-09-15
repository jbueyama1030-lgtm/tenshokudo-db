import { annualRevenueBreakdown, toExcludingTax } from "@/lib/revenue"

/**
 * 代理店マージンの算出。
 *
 * 【業務ルール】
 * - 手数料率は「その月に成立した新規年間契約の総額（税抜）」で決まる。
 *   契約成立日＝記事公開日＝contractStart として判定する。
 * - 母数は代理店単位で合算する。継続中の契約は母数に含めない。
 * - ラダーは全額適用（累進ではない）。200万未満なら全額に30%。
 * - オプション等その他商材は契約額に関わらず一律30%。
 * - 支払いは契約成立月に年間分を一括。
 */

// 掲載料のラダー（税抜・月間新規受注総額で判定）
const TIERS = [
  { min: 4_000_000, rate: 0.45 },
  { min: 3_000_000, rate: 0.40 },
  { min: 2_000_000, rate: 0.35 },
  { min: 0,         rate: 0.30 },
]

// その他商材（オプション）の一律料率
export const OPTION_RATE = 0.30

/** 月間新規受注総額（税抜）から掲載料の手数料率を決める */
export function listingRateFor(monthlyOrderTotalExclTax: number): number {
  for (const t of TIERS) {
    if (monthlyOrderTotalExclTax >= t.min) return t.rate
  }
  return TIERS[TIERS.length - 1].rate
}

type PeriodLike = {
  id: string
  monthlyFee?: number | null
  discountRate?: number | null
  options?: unknown
}

export type MarginResult = {
  periodId: string
  listingExclTax: number   // 掲載料（税抜・年額）
  optionExclTax: number    // オプション（税抜・年額）
  listingRate: number      // 適用されたラダー率
  marginAmount: number     // 支払額（円）
}

/**
 * 同一代理店・同一成立月の新規契約群からマージンを一括算出する。
 * ラダーは群全体の合計で決まるため、必ずまとめて渡すこと。
 */
export function calcMarginsForMonth(periods: PeriodLike[]): {
  listingRate: number
  monthlyOrderTotalExclTax: number
  results: MarginResult[]
} {
  // 各契約の税抜内訳を出す
  const rows = periods.map(p => {
    const b = annualRevenueBreakdown(p)
    return {
      periodId: p.id,
      listingExclTax: toExcludingTax(b.listing),
      optionExclTax: toExcludingTax(b.option),
    }
  })

  // ラダーの母数は掲載料の合計（その他商材は一律30%なので判定に含めない）
  const monthlyOrderTotalExclTax = rows.reduce((s, r) => s + r.listingExclTax, 0)
  const listingRate = listingRateFor(monthlyOrderTotalExclTax)

  const results: MarginResult[] = rows.map(r => ({
    periodId: r.periodId,
    listingExclTax: r.listingExclTax,
    optionExclTax: r.optionExclTax,
    listingRate,
    marginAmount: Math.round(r.listingExclTax * listingRate + r.optionExclTax * OPTION_RATE),
  }))

  return { listingRate, monthlyOrderTotalExclTax, results }
}