// 置き場所: src/lib/contractOptions.ts
// 掲載契約のオプション（追加広告・注目の5社など）の金額計算。画面とサーバーの両方から使う。

export type ContractOption = {
  name: string
  /** 金額（税込）。billing=monthly なら月額、once なら一括の総額 */
  amount: number
  /** 請求の形。未設定（古いデータ）は一括として扱う */
  billing?: "once" | "monthly"
  /** オプションの期間（YYYY-MM-DD）。月額の月数計算と、表示に使う */
  start?: string | null
  end?: string | null
}

/** 月額で期間が決まっていないときに数える月数 */
export const DEFAULT_OPTION_MONTHS = 12

function ym(d: string): number | null {
  const m = /^(\d{4})-(\d{1,2})/.exec(d ?? "")
  return m ? Number(m[1]) * 12 + (Number(m[2]) - 1) : null
}

/** 月額オプションの月数（開始月〜終了月。どちらか無ければ12か月） */
export function optionMonths(o: ContractOption): number {
  const s = o.start ? ym(o.start) : null
  const e = o.end ? ym(o.end) : null
  if (s == null || e == null) return DEFAULT_OPTION_MONTHS
  return Math.max(1, e - s + 1)
}

/** オプションの総額（税込） */
export function optionTotal(o: ContractOption): number {
  const amount = Number(o.amount) || 0
  return o.billing === "monthly" ? amount * optionMonths(o) : amount
}

/** 複数オプションの合計（JSONの値がそのまま来ても大丈夫なように） */
export function optionsTotal(options: unknown): number {
  if (!Array.isArray(options)) return 0
  return options.reduce((s: number, o) => s + optionTotal(o as ContractOption), 0)
}

/** 表示用の期間ラベル（例: 2026/10〜2027/03） */
export function optionPeriodLabel(o: ContractOption): string {
  const f = (d?: string | null) => (d ? d.slice(0, 7).replace("-", "/") : "")
  if (!o.start && !o.end) return ""
  return `${f(o.start)}〜${f(o.end)}`
}
