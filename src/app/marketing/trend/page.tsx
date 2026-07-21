"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

type TrendData = {
  range: string
  excludeOrganic: boolean
  months: string[]
  topInflows: string[]
  applyTrend: Record<string, string | number>[]
  rateTrend: { month: string; apply: number; contactRate: number; interviewRate: number; hireRate: number }[]
  cpaTrend: Record<string, string | number | null>[]
}

const COLORS = ["#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#db2777"]

export default function MarketingTrendPage() {
  const [userName, setUserName] = useState("")
  const [data, setData] = useState<TrendData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [range, setRange] = useState("12")
  const [excludeOrganic, setExcludeOrganic] = useState(true)

  const load = async (r: string, exclude: boolean) => {
    setLoading(true)
    setError("")
    const res = await fetch("/api/marketing/trend?range=" + r + "&excludeOrganic=" + (exclude ? "1" : "0"))
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
    load(range, excludeOrganic)
  }, [])

  const changeRange = (r: string) => {
    setRange(r)
    load(r, excludeOrganic)
  }

  const toggleOrganic = () => {
    const next = !excludeOrganic
    setExcludeOrganic(next)
    load(range, next)
  }

  const ranges = [
    { key: "12", label: "直近12ヶ月" },
    { key: "24", label: "直近24ヶ月" },
    { key: "all", label: "全期間" },
  ]

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-xs text-gray-400 mb-1">マーケティング分析</div>
              <h1 className="text-xl font-bold text-gray-800">月次トレンド</h1>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={toggleOrganic}
                className={"px-3 py-1.5 rounded-full text-xs font-medium transition-colors border " + (excludeOrganic ? "bg-amber-50 text-amber-700 border-amber-300" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400")}
              >
                {excludeOrganic ? "✓ 自然流入を除外中" : "自然流入を含む"}
              </button>
              <div className="flex gap-2">
                {ranges.map(r => (
                  <button
                    key={r.key}
                    onClick={() => changeRange(r.key)}
                    className={"px-3 py-1.5 rounded-full text-xs font-medium transition-colors " + (range === r.key ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-blue-400")}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">{error}</div>}

          {loading ? (
            <div className="text-gray-400 text-sm py-12 text-center">読み込み中...</div>
          ) : !data || data.months.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-400">データがありません</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* A: 応募数トレンド */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-700">応募数の推移（上位{data.topInflows.length}媒体）</h2>
                  <span className="text-xs text-gray-400">凡例をクリックで表示/非表示を切替できます</span>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={data.applyTrend} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12, cursor: "pointer" }} />
                    {data.topInflows.map((inf, i) => (
                      <Line key={inf} type="monotone" dataKey={inf} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* C: 歩留まり率トレンド */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-700">歩留まり率の推移（全媒体合算）</h2>
                  <span className="text-xs text-gray-400">自然流入の除外設定に関わらず全媒体で集計</span>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={data.rateTrend} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" unit="%" />
                    <Tooltip formatter={(v) => String(v) + "%"} />
                    <Legend wrapperStyle={{ fontSize: 12, cursor: "pointer" }} />
                    <Line type="monotone" dataKey="contactRate" name="接触率" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="interviewRate" name="面接実施率" stroke="#9333ea" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="hireRate" name="入社率" stroke="#16a34a" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* B: 入社CPAトレンド */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-700">入社CPAの推移（上位{data.topInflows.length}媒体）</h2>
                  <span className="text-xs text-gray-400">広告費が入力された月のみ表示されます</span>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={data.cpaTrend} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => "¥" + (Number(v) / 10000) + "万"} />
                    <Tooltip formatter={(v) => "¥" + Number(v).toLocaleString("ja-JP")} />
                    <Legend wrapperStyle={{ fontSize: 12, cursor: "pointer" }} />
                    {data.topInflows.map((inf, i) => (
                      <Line key={inf} type="monotone" dataKey={inf} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-gray-400 mt-3">
                  ※ 入社CPAは「広告費 ÷ 入社数」です。広告費が未入力の月、または入社0件の媒体は線が途切れます。
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}