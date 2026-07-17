"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"

type AreaRow = {
  area: string
  apply: number
  contact: number
  interviewSet: number
  interviewDone: number
  hired: number
  perfAdCost: number
  perfCpaApply: number | null
  perfCpaHire: number | null
}
type AreaData = {
  availableMonths: { year: number; month: number }[]
  target: { year: number; month: number } | null
  byArea: AreaRow[]
}

function rate(num: number, den: number): string {
  if (den === 0) return "-"
  return ((num / den) * 100).toFixed(1) + "%"
}
function yen(n: number | null | undefined) {
  if (n == null || n === 0) return "-"
  return "¥" + Number(n).toLocaleString("ja-JP")
}

export default function MarketingAreaPage() {
  const [userName, setUserName] = useState("")
  const [data, setData] = useState<AreaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = async (year?: number, month?: number) => {
    setLoading(true)
    setError("")
    let url = "/api/marketing/area"
    if (year && month) url += "?year=" + year + "&month=" + month
    const res = await fetch(url)
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

  // 合計行
  const total = data?.byArea.reduce(
    (acc, r) => ({
      apply: acc.apply + r.apply,
      contact: acc.contact + r.contact,
      interviewDone: acc.interviewDone + r.interviewDone,
      hired: acc.hired + r.hired,
      perfAdCost: acc.perfAdCost + r.perfAdCost,
    }),
    { apply: 0, contact: 0, interviewDone: 0, hired: 0, perfAdCost: 0 }
  )

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-xs text-gray-400 mb-1">マーケティング分析</div>
              <h1 className="text-xl font-bold text-gray-800">エリア別 歩留まり</h1>
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

          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">{error}</div>}

          {loading ? (
            <div className="text-gray-400 text-sm py-12 text-center">読み込み中...</div>
          ) : !data || data.byArea.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-400">データがありません</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-700">都道府県別 歩留まり</h2>
                <span className="text-xs text-gray-400">CPAは成果報酬型媒体のみの参考値（運用型は配分対象外）</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">エリア</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">応募</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">接触</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">接触率</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">面接実施</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">入社</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">入社率</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 bg-amber-50">成果報酬CPA(入社)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.byArea.map(row => (
                      <tr key={row.area} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-900 font-medium">{row.area}</td>
                        <td className="px-3 py-2 text-right font-bold text-gray-900">{row.apply}</td>
                        <td className="px-3 py-2 text-right text-blue-600">{row.contact}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{rate(row.contact, row.apply)}</td>
                        <td className="px-3 py-2 text-right text-purple-600">{row.interviewDone}</td>
                        <td className="px-3 py-2 text-right font-bold text-green-600">{row.hired}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{rate(row.hired, row.apply)}</td>
                        <td className="px-3 py-2 text-right font-bold text-amber-700 bg-amber-50">{yen(row.perfCpaHire)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {total && (
                    <tfoot className="bg-gray-50 border-t border-gray-200">
                      <tr>
                        <td className="px-3 py-2 text-xs font-medium text-gray-500">合計</td>
                        <td className="px-3 py-2 text-right font-bold text-gray-900">{total.apply}</td>
                        <td className="px-3 py-2 text-right font-bold text-blue-700">{total.contact}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{rate(total.contact, total.apply)}</td>
                        <td className="px-3 py-2 text-right font-bold text-purple-700">{total.interviewDone}</td>
                        <td className="px-3 py-2 text-right font-bold text-green-700">{total.hired}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{rate(total.hired, total.apply)}</td>
                        <td className="px-3 py-2 text-right font-bold text-amber-700 bg-amber-50">
                          {total.perfAdCost > 0 && total.hired > 0 ? yen(Math.round(total.perfAdCost / total.hired)) : "-"}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                ※ 企業マスタに未登録の応募は「不明」に集計されます。CPA列は成果報酬型媒体の費用のみを反映した参考値です（運用型の広告費はエリアに配分できないため含みません）。
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}