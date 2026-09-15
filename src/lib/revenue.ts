// 企業の年間掲載料売上を算出する（企業詳細の「年間売上合計」と同じ計算）
// annualBase = monthlyFee × 12
// discountAmt = annualBase × (discountRate / 100)
// optionTotal = options[].amount の合計
// 年間売上 = annualBase − discountAmt + optionTotal

type OptionLike = { name?: string; amount?: number | string | null }

type RevenueSource = {
  monthlyFee?: number | null
  discountRate?: number | null
  options?: unknown
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
  listing: number   // 掲載料（割引適用後）
  option: number    // オプション等その他商材
  total: number     // 合計（＝annualRevenue と同値）
} {
  const annualBase = (company.monthlyFee ?? 0) * 12
  const discountAmt = Math.round(annualBase * ((company.discountRate ?? 0) / 100))
  const listing = annualBase - discountAmt

  let option = 0
  if (Array.isArray(company.options)) {
    for (const o of company.options as OptionLike[]) {
      const amt = Number(o?.amount)
      if (Number.isFinite(amt)) option += amt
    }
  }

  return { listing, option, total: listing + option }
}

export function annualRevenue(company: RevenueSource): number {
  return annualRevenueBreakdown(company).total
}