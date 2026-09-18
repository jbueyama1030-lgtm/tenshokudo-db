"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState, useCallback } from "react"

type Row = {
  key: string
  apply: number
  contact: number
  interviewSet: number
  interviewDone: number
  hired: number
  uu: number
  uuRatio: number | null
  adCost: number | null
  cpaApply: number | null
  cpaUu: number | null
  cpaHire: number | null
  contactRate: number
  hireRate: number
}

type Data = {
  availableMonths: { year: number; month: number }[]
  target: { year: number; month: number } | null
  groupBy: "inflow" | "area" | "entryType"
  filters: { area: string; entryType: string; inflow: string }
  options: { areas: string[]; entryTypes: string[]; inflows: string[] }
  overall: {
    apply: number; contact: number; interviewSet: number; interviewDone: number; hired: number
  }
  overallUu: number
  rows: Row[]
  overallAdCost: number
  directAdCost: number
  overheadAdCost: number
  overheadItems: { name: string; amount: number }[]
  costIsEstimated: boolean
}

const GROUP_LABELS: Record<string, string> = {
  inflow: "流入元",
  area: "エリア",
  entryType: "応募種別",
}

const yen = (v: number | null) => (v == null ? "—" : "¥" + v.toLocaleString("ja-JP"))
const num = (v: number) => v.toLocaleString("ja-JP")

export default function MarketingPage() {
  const [userName, setUserName] = useState("")
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  const [ym, setYm] = useState("")
  const [area, setArea] = useState("")
  const [entryType, setEntryType] = useState("")
  const [inflow, setInflow] = useState("")
  const [groupBy, setGroupBy] = useState<"inflow" | "area" | "entryType">("inflow")

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => setUserName(s?.user?.name ?? ""))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (ym) {
      const [y, m] = ym.split("-")
      params.set("year", y)
      params.set("month", m)
    }
    if (area) params.set("area", area)
    if (entryType) params.set("entryType", entryType)
    if (inflow) params.set("inflow", inflow)
    params.set("groupBy", groupBy)

    const res = await fetch("/api/marketing?" + params.toString())
    if (res.ok) {
      setData(await res.json())
    }
    setLoading(false)
  }, [ym, area, entryType, inflow, groupBy])

  useEffect(() => { load() }, [load])

  // 初回のみ、APIが返した対象月をセレクトの初期値にする
  useEffect(() => {
    if (!ym && data?.target) {
      setYm(data.target.year + "-" + data.target.month)
    }
  }, [data, ym])

  const resetFilters = () => { setArea(""); setEntryType(""); setInflow("") }
  const hasFilter = !!(area || entryType || inflow)

  const o = data?.overall
  const rate = (n: number, d: number) => (d > 0 ? ((n / d) * 100).toFixed(1) + "%" : "—")

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6">
          <h1 className="text-xl font-bold text-gray-800 mb-1">マーケティング分析</h1>
          <p className="text-sm text-gray-500 mb-6">
            応募データと広告費を突き合わせて、流入元・エリア・応募種別ごとの成果を確認できます。
          </p>

          {/* 絞り込み */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">対象月</label>
                <select
                  value={ym}
                  onChange={e => setYm(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-36"
                >
                  {data?.availableMonths.map(m => (
                    <option key={m.year + "-" + m.month} value={m.year + "-" + m.month}>
                      {m.year}年{m.month}月
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">エリア</label>
                <select
                  value={area}
                  onChange={e => setArea(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-32"
                >
                  <option value="">全て</option>
                  {data?.options.areas.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">応募種別</label>
                <select
                  value={entryType}
                  onChange={e => setEntryType(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-32"
                >
                  <option value="">全て</option>
                  {data?.options.entryTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">流入元</label>
                <select
                  value={inflow}
                  onChange={e => setInflow(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-36"
                >
                  <option value="">全て</option>
                  {data?.options.inflows.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>

              {hasFilter && (
                <button onClick={resetFilters} className="text-sm text-blue-600 hover:underline pb-2">
                  絞り込みを解除
                </button>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3">
              <span className="text-xs text-gray-500">集計軸</span>
              {(["inflow", "area", "entryType"] as const).map(g => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={
                    "px-3 py-1.5 rounded-lg text-sm border transition-colors " +
                    (groupBy === g
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50")
                  }
                >
                  {GROUP_LABELS[g]}
                </button>
              ))}
            </div>
          </div>

          {loading && <div className="text-sm text-gray-500">読み込み中...</div>}

          {!loading && data && (
            <>
              {/* サマリー */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-5">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-500 mb-1">応募（延べ）</div>
                  <div className="text-2xl font-bold text-gray-800">{num(o?.apply ?? 0)}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-500 mb-1">UU（実人数）</div>
                  <div className="text-2xl font-bold text-gray-800">{num(data.overallUu)}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {data.overallUu > 0 ? "×" + ((o?.apply ?? 0) / data.overallUu).toFixed(2) : ""}
                  </div>
                </div>
                {[
                  { label: "接触", value: o?.contact ?? 0 },
                  { label: "面接設定", value: o?.interviewSet ?? 0 },
                  { label: "面接完了", value: o?.interviewDone ?? 0 },
                  { label: "入社", value: o?.hired ?? 0 },
                ].map(c => (
                  <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-xs text-gray-500 mb-1">{c.label}</div>
                    <div className="text-2xl font-bold text-gray-800">{num(c.value)}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{rate(c.value, o?.apply ?? 0)}</div>
                  </div>
                ))}
              </div>

              {/* 広告費 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-500 mb-1">広告費 合計</div>
                  <div className="text-xl font-bold text-gray-800">{yen(data.overallAdCost)}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-500 mb-1">媒体直課（direct）</div>
                  <div className="text-xl font-bold text-gray-800">{yen(data.directAdCost)}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-500 mb-1">その他広告費（配賦対象外）</div>
                  <div className="text-xl font-bold text-gray-800">{yen(data.overheadAdCost)}</div>
                  {data.overheadItems.length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      {data.overheadItems.map(i => (
                        <div key={i.name} className="flex justify-between text-xs text-gray-500">
                          <span className="truncate mr-2">{i.name}</span>
                          <span>{yen(i.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {data.costIsEstimated && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-xs text-amber-800">
                  広告費は流入元ごとにしか把握できないため、この表の広告費・CPAは応募数の比率で按分した概算です。実額は集計軸を「流入元」にし、絞り込みを解除すると表示されます。
                </div>
              )}

              {/* 明細テーブル */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr className="text-left text-xs text-gray-500">
                        <th className="px-4 py-3 font-medium">{GROUP_LABELS[data.groupBy]}</th>
                        <th className="px-4 py-3 font-medium text-right">応募</th>
                        <th className="px-4 py-3 font-medium text-right">UU</th>
                        <th className="px-4 py-3 font-medium text-right">延べ/UU</th>
                        <th className="px-4 py-3 font-medium text-right">接触率</th>
                        <th className="px-4 py-3 font-medium text-right">面接設定</th>
                        <th className="px-4 py-3 font-medium text-right">面接完了</th>
                        <th className="px-4 py-3 font-medium text-right">入社</th>
                        <th className="px-4 py-3 font-medium text-right">入社率</th>
                        <th className="px-4 py-3 font-medium text-right">広告費</th>
                        <th className="px-4 py-3 font-medium text-right">CPA(応募)</th>
                        <th className="px-4 py-3 font-medium text-right">CPA(UU)</th>
                        <th className="px-4 py-3 font-medium text-right">CPA(入社)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map(r => (
                        <tr key={r.key} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-800">{r.key}</td>
                          <td className="px-4 py-3 text-right">{num(r.apply)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{num(r.uu)}</td>
                          <td className="px-4 py-3 text-right text-gray-500">
                            {r.uuRatio != null ? "×" + r.uuRatio.toFixed(2) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500">{r.contactRate}%</td>
                          <td className="px-4 py-3 text-right text-gray-600">{num(r.interviewSet)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{num(r.interviewDone)}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-800">{num(r.hired)}</td>
                          <td className="px-4 py-3 text-right text-gray-500">{r.hireRate}%</td>
                          <td className="px-4 py-3 text-right text-gray-600">{yen(r.adCost)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{yen(r.cpaApply)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{yen(r.cpaUu)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{yen(r.cpaHire)}</td>
                        </tr>
                      ))}
                      {data.rows.length === 0 && (
                        <tr>
                          <td colSpan={13} className="px-4 py-8 text-center text-sm text-gray-400">
                            該当するデータがありません
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}