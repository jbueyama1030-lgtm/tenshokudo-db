// 置き場所: src/lib/revenue.ts
// 企業の年間掲載料売上を算出する（企業詳細の「年間売上合計」と同じ計算）
// annualBase = monthlyFee × 12
// discountAmt = annualBase × (discountRate / 100)
// listing = revenueOverride があればそれ、なければ annualBase − discountAmt
// optionTotal = オプションの合計（月額のものは 月額 × 月数。src/lib/contractOptions.ts）
// 年間売上 = listing + optionTotal

import { optionsTotal } from "@/lib/contractOptions"

type RevenueSource = {
  monthlyFee?: number | null
  discountRate?: number | null
  options?: unknown
  /** 掲載料の手入力（税込）。プラン変更時の差し引き請求などイレギュラーな金額 */
  revenueOverride?: number | null
}

// 消費税率（monthlyFee等は税込で入力されている）
export const TAX_RATE = 0.1

/** 税込金額から税抜金額を求める */
export function toExcludingTax(includingTax: number): number {
  return Math.round(includingTax / (1 + TAX_RATE))
}

/**
 * 年間売上の内訳を返す。
 * 代理店マージンは掲載料（ラダー）とオプション（一律30%）で率が違うため、
 * 合算前の内訳が必要になる。金額はすべて入力どおり＝税込。
 */
export function annualRevenueBreakdown(company: RevenueSource): {
  listing: number   // 掲載料（割引適用後。手入力があればその値）
  option: number    // オプション等その他商材
  total: number     // 合計（＝annualRevenue と同値）
} {
  const annualBase = (company.monthlyFee ?? 0) * 12
  const discountAmt = Math.round(annualBase * ((company.discountRate ?? 0) / 100))
  const listing = company.revenueOverride != null ? company.revenueOverride : annualBase - discountAmt

  const option = optionsTotal(company.options)

  return { listing, option, total: listing + option }
}

export function annualRevenue(company: RevenueSource): number {
  return annualRevenueBreakdown(company).total
}
