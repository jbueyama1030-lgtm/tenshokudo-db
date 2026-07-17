"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"

type InflowRow = {
  inflow: string
  apply: number
  contact: number
  interviewSet: number
  interviewDone: number
  hired: number
  isPerformance: boolean
  adCost: number | null
  cpaApply: number | null
  cpaHire: number | null
}
type CrossData = {
  availableMonths: { year: number; month: number }[]
  target: { year: number; month: number } | null
  areas: { area: string; count: number }[]
  selectedArea: string | null
  byInflow: InflowRow[]
}

function rate(num: number, den: number): string {
  if (den === 0) return "-"
  return ((num / den) * 100).toFixed(1) + "%"
}
function yen(n: number | null | undefined) {
  if (n == null) return "-"
  return "¥" + Number(n).toLocaleString("ja-JP")
}

const TOP_TAB_COUNT = 8  // 上位何エリアをタブにするか

export default function MarketingCrossPage() {
  const [userName, setUserName] = useState("")
  const [data, setData] = useState<CrossData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = async (year?: number, month?: number, area?: string) => {
    setLoading(true)
    setError("")
    const params = new URLSearchParams()
    if (year && month) { params.set("year", String(year)); params.set("month", String(month)) }
    if (area) params.set("area", area)
    const url = "/api/marketing/cross" + (params.toString() ? "?" + params.toString() : "")
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

  const topAreas = data?.areas.slice(0, TOP_TAB_COUNT) ?? []
  const restAreas = data?.areas.slice(TOP_TAB_COUNT) ?? []
  const selectedInRest = restAreas.some(a => a.area === data?.selectedArea)

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs text-gray-400 mb-1">マーケティング分析</div>
              <h1 className="text-xl font-bold text-gray-800">エリア × 媒体クロス</h1>
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
          ) : !data || data.areas.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-400">データがありません</p>
            </div>
          ) : (
            <>
              {/* エリア選択（上位タブ + 残りプルダウン） */}
              <div className="flex items-center gap-2 mb-5 flex-wrap border-b border-gray-200 pb-3">
                {topAreas.map(a => (
                  <button
                    key={a.area}
                    onClick={() => data.target && load(data.target.year, data.target.month, a.area)}
                    className={"px-3 py-1.5 rounded-full text-xs font-medium transition-colors " + (data.selectedArea === a.area ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-blue-400")}
                  >
                    {a.area} <span className="opacity-60">{a.count}</span>
                  </button>
                ))}
                {restAreas.length > 0 && (
                  <select
                    value={selectedInRest ? (data.selectedArea ?? "") : ""}
                    onChange={e => { if (e.target.value && data.target) load(data.target.year, data.target.month, e.target.value) }}
                    className={"border rounded-full px-3 py-1.5 text-xs " + (selectedInRest ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200")}
                  >
                    <option value="">その他のエリア…</option>
                    {restAreas.map(a => (
                      <option key={a.area} value={a.area} className="text-gray-900">{a.area}（{a.count}）</option>
                    ))}
                  </select>
                )}
              </div>

              {/* 選択エリアの媒体別ファネル */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-700">
                    {data.selectedArea} の媒体別 歩留まり
                  </h2>
                  <span className="text-xs text-gray-400">CPAは成果報酬型媒体のみ（運用型はエリア配分不可のため「-」）</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">流入元</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">応募</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">接触</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">面接実施</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">入社</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">入社率</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 bg-amber-50">入社CPA(成果報酬)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.byInflow.map(row => (
                        <tr key={row.inflow} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-900 font-medium">
                            {row.inflow}
                            {row.isPerformance && <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">成果報酬</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-gray-900">{row.apply}</td>
                          <td className="px-3 py-2 text-right text-blue-600">{row.contact}</td>
                          <td className="px-3 py-2 text-right text-purple-600">{row.interviewDone}</td>
                          <td className="px-3 py-2 text-right font-bold text-green-600">{row.hired}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{rate(row.hired, row.apply)}</td>
                          <td className="px-3 py-2 text-right font-bold text-amber-700 bg-amber-50">{row.isPerformance ? yen(row.cpaHire) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-400 mt-3">
                  ※ 運用型媒体（indeed＋・リスティング等）はエリア別の広告費を配分できないため、CPAは表示していません。成果報酬型のみエリア別CPAを算出しています。
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}