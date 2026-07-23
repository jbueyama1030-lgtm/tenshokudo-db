"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"

type Funnel = {
  apply: number
  contact: number
  interviewSet: number
  interviewDone: number
  hired: number
}
type InflowRow = Funnel & {
  inflow: string
  adCost: number | null
  cpaApply: number | null
  cpaHire: number | null
}
type OverheadItem = { name: string; amount: number }
type MarketingData = {
  availableMonths: { year: number; month: number }[]
  target: { year: number; month: number } | null
  overall: Funnel
  byInflow: InflowRow[]
  overallAdCost: number
  directAdCost: number
  overheadAdCost: number
  overheadItems: OverheadItem[]
}

function rate(num: number, den: number): string {
  if (den === 0) return "-"
  return ((num / den) * 100).toFixed(1) + "%"
}
function yen(n: number | null | undefined) {
  if (n == null) return "-"
  return "¥" + Number(n).toLocaleString("ja-JP")
}

export default function MarketingPage() {
  const [userName, setUserName] = useState("")
  const [data, setData] = useState<MarketingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showOverhead, setShowOverhead] = useState(false)

  const load = async (year?: number, month?: number) => {
    setLoading(true)
    setError("")
    let url = "/api/marketing"
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

  const o = data?.overall
  // 全体CPAは配賦対象外も含めた総額で算出する
  const overallCpaHire = data && o && o.hired > 0 ? Math.round(data.overallAdCost / o.hired) : null
  const overallCpaApply = data && o && o.apply > 0 ? Math.round(data.overallAdCost / o.apply) : null

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-xs text-gray-400 mb-1">マーケティング分析</div>
              <h1 className="text-xl font-bold text-gray-800">媒体歩留まりダッシュボード</h1>
            </div>
            {data && data.availableMonths.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">対象月</span>
                <select
                  value={data.target ? data.target.year + "-" + data.target.month : ""}
                  onChange={e => {
                    const [y, m] = e.target.value.split("-").map(Number)
                    load(y, m)
                  }}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {data.availableMonths.map(m => (
                    <option key={m.year + "-" + m.month} value={m.year + "-" + m.month}>
                      {m.year}年{m.month}月
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">{error}</div>
          )}

          {loading ? (
            <div className="text-gray-400 text-sm py-12 text-center">読み込み中...</div>
          ) : !data || data.availableMonths.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-400 text-lg mb-2">応募データがありません</p>
              <p className="text-gray-400 text-sm">応募明細インポートからCSVを取り込んでください</p>
            </div>
          ) : (
            <>
              {/* 全体KPI（上段：ファネル） */}
              <div className="grid grid-cols-5 gap-3 mb-3">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-400 mb-1">総応募数</div>
                  <div className="text-2xl font-bold text-gray-900">{o?.apply ?? 0}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-400 mb-1">接触数</div>
                  <div className="text-2xl font-bold text-blue-600">{o?.contact ?? 0}</div>
                  <div className="text-xs text-gray-400 mt-1">接触率 {rate(o?.contact ?? 0, o?.apply ?? 0)}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-400 mb-1">面接設定数</div>
                  <div className="text-2xl font-bold text-indigo-600">{o?.interviewSet ?? 0}</div>
                  <div className="text-xs text-gray-400 mt-1">対応募 {rate(o?.interviewSet ?? 0, o?.apply ?? 0)}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-400 mb-1">面接実施数</div>
                  <div className="text-2xl font-bold text-purple-600">{o?.interviewDone ?? 0}</div>
                  <div className="text-xs text-gray-400 mt-1">対応募 {rate(o?.interviewDone ?? 0, o?.apply ?? 0)}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-400 mb-1">入社数</div>
                  <div className="text-2xl font-bold text-green-600">{o?.hired ?? 0}</div>
                  <div className="text-xs text-gray-400 mt-1">入社率 {rate(o?.hired ?? 0, o?.apply ?? 0)}</div>
                </div>
              </div>

              {/* 全体KPI（下段：費用） */}
              <div className="grid grid-cols-4 gap-3 mb-2">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-400 mb-1">全体広告費</div>
                  <div className="text-2xl font-bold text-gray-900">{yen(data.overallAdCost)}</div>
                  <div className="text-xs text-gray-400 mt-1">媒体直課 {yen(data.directAdCost)}</div>
                </div>
                <div className="bg-white rounded-xl border border-orange-200 p-4">
                  <div className="text-xs text-gray-400 mb-1">その他広告費（配賦対象外）</div>
                  <div className="text-2xl font-bold text-orange-600">{yen(data.overheadAdCost)}</div>
                  {data.overheadItems.length > 0 && (
                    <button
                      onClick={() => setShowOverhead(v => !v)}
                      className="text-xs text-orange-600 hover:underline mt-1"
                    >
                      {showOverhead ? "内訳を隠す" : "内訳を見る（" + data.overheadItems.length + "件）"}
                    </button>
                  )}
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-400 mb-1">全体 応募CPA</div>
                  <div className="text-2xl font-bold text-blue-700">{yen(overallCpaApply)}</div>
                  <div className="text-xs text-gray-400 mt-1">全体広告費ベース</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-400 mb-1">全体 入社CPA</div>
                  <div className="text-2xl font-bold text-green-700">{yen(overallCpaHire)}</div>
                  <div className="text-xs text-gray-400 mt-1">全体広告費ベース</div>
                </div>
              </div>

              {/* その他広告費の内訳 */}
              {showOverhead && data.overheadItems.length > 0 && (
                <div className="bg-orange-50 rounded-xl border border-orange-200 p-4 mb-6">
                  <div className="text-xs font-medium text-orange-800 mb-2">その他広告費の内訳</div>
                  <div className="grid grid-cols-3 gap-2">
                    {data.overheadItems.map(item => (
                      <div key={item.name} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                        <span className="text-xs text-gray-600">{item.name}</span>
                        <span className="text-sm font-medium text-gray-900">{yen(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-orange-700 mt-2">
                    これらは特定の流入元に紐づかないため、下の流入元別テーブルには含まれません。
                  </p>
                </div>
              )}

              {!showOverhead && <div className="mb-6" />}

              {/* 流入元別テーブル */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-700">流入元別 歩留まり・CPA</h2>
                  <span className="text-xs text-gray-400">広告費未入力の媒体はCPAが「-」になります</span>
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
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">広告費</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">応募CPA</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 bg-green-50">入社CPA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.byInflow.map(row => (
                        <tr key={row.inflow} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-900 font-medium">{row.inflow}</td>
                          <td className="px-3 py-2 text-right font-bold text-gray-900">{row.apply}</td>
                          <td className="px-3 py-2 text-right text-blue-600">{row.contact}</td>
                          <td className="px-3 py-2 text-right text-purple-600">{row.interviewDone}</td>
                          <td className="px-3 py-2 text-right font-bold text-green-600">{row.hired}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{rate(row.hired, row.apply)}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{yen(row.adCost)}</td>
                          <td className="px-3 py-2 text-right text-blue-700">{yen(row.cpaApply)}</td>
                          <td className="px-3 py-2 text-right font-bold text-green-700 bg-green-50">{yen(row.cpaHire)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-200">
                      <tr>
                        <td className="px-3 py-2 text-xs font-medium text-gray-500">媒体直課 合計</td>
                        <td className="px-3 py-2 text-right font-bold text-gray-900">{o?.apply ?? 0}</td>
                        <td className="px-3 py-2 text-right font-bold text-blue-700">{o?.contact ?? 0}</td>
                        <td className="px-3 py-2 text-right font-bold text-purple-700">{o?.interviewDone ?? 0}</td>
                        <td className="px-3 py-2 text-right font-bold text-green-700">{o?.hired ?? 0}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{rate(o?.hired ?? 0, o?.apply ?? 0)}</td>
                        <td className="px-3 py-2 text-right font-bold text-gray-900">{yen(data.directAdCost)}</td>
                        <td className="px-3 py-2 text-right text-blue-700">
                          {o && o.apply > 0 && data.directAdCost > 0 ? yen(Math.round(data.directAdCost / o.apply)) : "-"}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-green-700 bg-green-50">
                          {o && o.hired > 0 && data.directAdCost > 0 ? yen(Math.round(data.directAdCost / o.hired)) : "-"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="text-xs text-gray-400 mt-3">
                  ※ この表の広告費は媒体直課分のみです。配賦対象外の費用（{yen(data.overheadAdCost)}）は含まれません。上部の「全体 応募CPA／入社CPA」は配賦対象外も含めた全体広告費で算出しています。
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}