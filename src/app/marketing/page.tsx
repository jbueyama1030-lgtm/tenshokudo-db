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
type MarketingData = {
  availableMonths: { year: number; month: number }[]
  target: { year: number; month: number } | null
  overall: Funnel
  byInflow: InflowRow[]
  overallAdCost: number
}

function rate(num: number, den: number): string {
  if (den === 0) return "-"
  return ((num / den) * 100).toFixed(1) + "%"
}
function fmt(n: number | null | undefined) {
  if (n == null) return "-"
  return Number(n).toLocaleString("ja-JP")
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
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-400 mb-1">総広告費（入力済み媒体の合計）</div>
                  <div className="text-2xl font-bold text-gray-900">{yen(data.overallAdCost)}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-400 mb-1">全体 応募CPA</div>
                  <div className="text-2xl font-bold text-blue-700">{yen(overallCpaApply)}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-400 mb-1">全体 入社CPA</div>
                  <div className="text-2xl font-bold text-green-700">{yen(overallCpaHire)}</div>
                </div>
              </div>

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
                        <td className="px-3 py-2 text-xs font-medium text-gray-500">合計</td>
                        <td className="px-3 py-2 text-right font-bold text-gray-900">{o?.apply ?? 0}</td>
                        <td className="px-3 py-2 text-right font-bold text-blue-700">{o?.contact ?? 0}</td>
                        <td className="px-3 py-2 text-right font-bold text-purple-700">{o?.interviewDone ?? 0}</td>
                        <td className="px-3 py-2 text-right font-bold text-green-700">{o?.hired ?? 0}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{rate(o?.hired ?? 0, o?.apply ?? 0)}</td>
                        <td className="px-3 py-2 text-right font-bold text-gray-900">{yen(data.overallAdCost)}</td>
                        <td className="px-3 py-2 text-right text-blue-700">{yen(overallCpaApply)}</td>
                        <td className="px-3 py-2 text-right font-bold text-green-700 bg-green-50">{yen(overallCpaHire)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="text-xs text-gray-400 mt-3">
                  ※ 面接設定・面接実施の詳細な内訳は各流入元の応募・入社をもとに算出しています。広告費は当月に入力された媒体のみ反映されます。
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}