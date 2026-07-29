"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"

type AreaRow = {
  area: string
  monthlyRevenue: number
  budget: number
  actual: number
  diff: number
  overRatio: number | null
}
type Overall = {
  monthlyRevenue: number
  budget: number
  actual: number
  diff: number
  overRatio: number | null
  activeContracts: number
  breakdown: {
    allocatedDirect: number
    unallocatedDirect: number
    overhead: number
  }
}
type BudgetData = {
  availableMonths: { year: number; month: number }[]
  target: { year: number; month: number } | null
  rate: number
  byArea: AreaRow[]
  overall: Overall | null
}

function yen(n: number | null | undefined) {
  if (n == null) return "-"
  return "¥" + Number(n).toLocaleString("ja-JP")
}

export default function BudgetPage() {
  const [userName, setUserName] = useState("")
  const [data, setData] = useState<BudgetData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [rate, setRate] = useState(30)

  const load = async (year?: number, month?: number, r?: number) => {
    setLoading(true)
    setError("")
    const params = new URLSearchParams()
    if (year && month) { params.set("year", String(year)); params.set("month", String(month)) }
    params.set("rate", String(r ?? rate))
    const res = await fetch("/api/marketing/budget?" + params.toString())
    if (res.ok) {
      setData(await res.json())
    } else {
      const d = await res.json()
      setError(d.error ?? "読み込みに失敗しました")
    }
    setLoading(false)
  }

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => setUserName(s?.user?.name ?? ""))
    load()
  }, [])

  const o = data?.overall

  const diffCls = (diff: number) => diff >= 0 ? "text-green-700" : "text-red-600"
  const ratioCls = (ratio: number | null) => {
    if (ratio == null) return "text-gray-400"
    if (ratio <= 80) return "bg-green-100 text-green-800"
    if (ratio <= 100) return "bg-yellow-100 text-yellow-800"
    return "bg-red-100 text-red-800"
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-6xl">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-xs text-gray-400 mb-1">マーケティング分析</div>
              <h1 className="text-xl font-bold text-gray-800">かけて良い広告費</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">売上比率</span>
                <select
                  value={rate}
                  onChange={e => { const r = Number(e.target.value); setRate(r); load(data?.target?.year, data?.target?.month, r) }}
                  className="border border-gray-300 rounded-lg px-2 py-2 text-sm text-gray-900"
                >
                  {[20, 25, 30, 35, 40].map(r => <option key={r} value={r}>{r}%</option>)}
                </select>
              </div>
              {data && data.availableMonths.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">対象月</span>
                  <select
                    value={data.target ? data.target.year + "-" + data.target.month : ""}
                    onChange={e => { const [y, m] = e.target.value.split("-").map(Number); load(y, m) }}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {data.availableMonths.map(m => (
                      <option key={m.year + "-" + m.month} value={m.year + "-" + m.month}>{m.year}年{m.month}月</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            対象月にアクティブだった契約（契約中・人材紹介のみ）の月間掲載料売上に対する{data?.rate ?? rate}%を「かけて良い広告費」とし、実際の広告費（媒体費を応募エリア比で按分した概算）と比較します。
          </p>

          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">{error}</div>}

          {loading ? (
            <div className="text-gray-400 text-sm py-12 text-center">読み込み中...</div>
          ) : !data || !data.target || !o ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-400">データがありません</p>
            </div>
          ) : (
            <>
              {/* 全体サマリー */}
              <div className="grid grid-cols-4 gap-3 mb-2">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-400 mb-1">契約済み 月間売上</div>
                  <div className="text-xl font-bold text-gray-900">{yen(o.monthlyRevenue)}</div>
                  <div className="text-xs text-gray-400 mt-1">アクティブ契約 {o.activeContracts}件</div>
                </div>
                <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                  <div className="text-xs text-blue-500 mb-1">かけて良い広告費（{data.rate}%）</div>
                  <div className="text-xl font-bold text-blue-700">{yen(o.budget)}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-400 mb-1">実際の広告費</div>
                  <div className="text-xl font-bold text-gray-900">{yen(o.actual)}</div>
                </div>
                <div className={"rounded-xl border p-4 " + (o.diff >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200")}>
                  <div className="text-xs text-gray-400 mb-1">{o.diff >= 0 ? "余力" : "超過"}</div>
                  <div className={"text-xl font-bold " + diffCls(o.diff)}>{yen(Math.abs(o.diff))}</div>
                  {o.overRatio != null && (
                    <div className="text-xs text-gray-400 mt-1">予算消化 {o.overRatio}%</div>
                  )}
                </div>
              </div>

              {/* 実際広告費の内訳注記 */}
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 mb-6">
                <div className="text-xs text-gray-500">
                  実際の広告費 {yen(o.actual)} の内訳：
                  <span className="text-gray-700 font-medium ml-1">エリア按分 {yen(o.breakdown.allocatedDirect)}</span>
                  <span className="mx-1 text-gray-300">/</span>
                  <span className="text-gray-700 font-medium">応募なし媒体 {yen(o.breakdown.unallocatedDirect)}</span>
                  <span className="mx-1 text-gray-300">/</span>
                  <span className="text-orange-600 font-medium">配賦対象外 {yen(o.breakdown.overhead)}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  下のエリア別テーブルは「エリア按分 {yen(o.breakdown.allocatedDirect)}」のみを配分しています。応募のない媒体費と配賦対象外費はエリアに割り振れないため、全体にのみ計上されます。
                </div>
              </div>

              {/* エリア別テーブル */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-700">エリア別 かけて良い広告費 vs 実際（概算）</h2>
                  <span className="text-xs text-gray-400">消化率が高い＝広告費をかけ過ぎ</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">エリア</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">契約済み月間売上</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">かけて良い広告費</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">実際（概算）</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">差分</th>
                        <th className="text-center px-3 py-2 text-xs font-medium text-gray-500">消化率</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.byArea.map(row => (
                        <tr key={row.area} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-900">{row.area}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{yen(row.monthlyRevenue)}</td>
                          <td className="px-3 py-2 text-right text-blue-700 font-medium">{yen(row.budget)}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{yen(row.actual)}</td>
                          <td className={"px-3 py-2 text-right font-bold " + diffCls(row.diff)}>
                            {row.diff >= 0 ? "+" : "−"}{yen(Math.abs(row.diff))}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {row.overRatio != null
                              ? <span className={"text-xs px-2 py-0.5 rounded-full font-medium " + ratioCls(row.overRatio)}>{row.overRatio}%</span>
                              : <span className="text-xs text-gray-300">-</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-200">
                      <tr>
                        <td className="px-3 py-2 text-xs font-medium text-gray-500">エリア按分 合計</td>
                        <td className="px-3 py-2 text-right font-bold text-gray-900">{yen(o.monthlyRevenue)}</td>
                        <td className="px-3 py-2 text-right font-bold text-blue-700">{yen(o.budget)}</td>
                        <td className="px-3 py-2 text-right font-bold text-gray-900">{yen(o.breakdown.allocatedDirect)}</td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="text-xs text-gray-400 mt-3">
                  ※ 実際の広告費（概算）は、各媒体の月額を「その媒体の応募がどのエリアに落ちたか」の比率で按分したものです。運用型広告費をエリアに割り振るための概算であり、実際の請求額をエリア単位で分けたものではありません。
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}