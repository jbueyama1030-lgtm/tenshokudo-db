// 企業の年間掲載料売上を算出する（企業詳細の「年間売上合計」と同じ計算）
// annualBase = monthlyFee × 12
// discountAmt = annualBase × (discountRate / 100)
// optionTotal = options[].amount の合計
// 年間売上 = annualBase − discountAmt + optionTotal

type OptionLike = { name?: string; amount?: number | string | null }

export function annualRevenue(company: {
  monthlyFee?: number | null
  discountRate?: number | null
  options?: unknown
}): number {
  const annualBase = (company.monthlyFee ?? 0) * 12
  const discountAmt = Math.round(annualBase * ((company.discountRate ?? 0) / 100))

  let optionTotal = 0
  if (Array.isArray(company.options)) {
    for (const o of company.options as OptionLike[]) {
      const amt = Number(o?.amount)
      if (Number.isFinite(amt)) optionTotal += amt
    }
  }
  return annualBase - discountAmt + optionTotal
}