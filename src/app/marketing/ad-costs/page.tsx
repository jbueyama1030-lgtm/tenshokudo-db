"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"

type Row = {
  inflow: string
  applyCount: number
  costType: string
  unitPrice: number | null
  totalCost: number | null
}
type AdCostData = {
  availableMonths: { year: number; month: number }[]
  target: { year: number; month: number } | null
  rows: Row[]
}

function fmt(n: number | null | undefined) {
  if (n == null) return "-"
  return Number(n).toLocaleString("ja-JP")
}

export default function AdCostsPage() {
  const [userName, setUserName] = useState("")
  const [data, setData] = useState<AdCostData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [savingInflow, setSavingInflow] = useState("")
  const [savedInflow, setSavedInflow] = useState("")

  const [newInflow, setNewInflow] = useState("")

  const load = async (year?: number, month?: number) => {
    setLoading(true)
    setError("")
    let url = "/api/ad-costs"
    if (year && month) url += "?year=" + year + "&month=" + month
    const res = await fetch(url)
    if (res.ok) {
      const d = await res.json()
      if (!d.target && d.availableMonths.length > 0) {
        const m = d.availableMonths[0]
        return load(m.year, m.month)
      }
      setData(d)
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

  const updateRow = (inflow: string, patch: Partial<Row>) => {
    setData(d => {
      if (!d) return d
      return { ...d, rows: d.rows.map(r => r.inflow === inflow ? { ...r, ...patch } : r) }
    })
  }

  const saveRow = async (row: Row) => {
    if (!data?.target) return
    setSavingInflow(row.inflow)
    const res = await fetch("/api/ad-costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year: data.target.year,
        month: data.target.month,
        inflow: row.inflow,
        costType: row.costType,
        unitPrice: row.costType === "performance" ? row.unitPrice : null,
        totalCost: row.costType === "operation" ? row.totalCost : null,
      }),
    })
    setSavingInflow("")
    if (res.ok) {
      setSavedInflow(row.inflow)
      setTimeout(() => setSavedInflow(""), 1500)
    }
  }

  const addInflow = () => {
    const name = newInflow.trim()
    if (!name || !data) return
    if (data.rows.some(r => r.inflow === name)) { setNewInflow(""); return }
    setData({ ...data, rows: [...data.rows, { inflow: name, applyCount: 0, costType: "operation", unitPrice: null, totalCost: null }] })
    setNewInflow("")
  }

  // 推定広告費：運用型=総額 / 成果報酬型=単価×応募数
  const estimatedCost = (row: Row): number | null => {
    if (row.costType === "operation") return row.totalCost
    if (row.costType === "performance" && row.unitPrice != null) return row.unitPrice * row.applyCount
    return null
  }

  // 応募単価：運用型=総額÷応募数 / 成果報酬型=単価そのまま
  const costPerApply = (row: Row): number | null => {
    if (row.costType === "operation") {
      if (row.totalCost == null || row.applyCount === 0) return null
      return Math.round(row.totalCost / row.applyCount)
    }
    if (row.costType === "performance") return row.unitPrice
    return null
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-5xl">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-xs text-gray-400 mb-1">マーケティング分析</div>
              <h1 className="text-xl font-bold text-gray-800">広告費入力</h1>
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
          <p className="text-sm text-gray-500 mb-6">
            運用型は月の総額を、成果報酬型は応募単価を入力してください。応募単価は運用型なら「総額 ÷ 応募数」で自動算出されます。
          </p>

          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">{error}</div>}

          {loading ? (
            <div className="text-gray-400 text-sm py-12 text-center">読み込み中...</div>
          ) : !data || data.rows.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-400">この月の流入元データがありません</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">流入元</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">応募数</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">課金タイプ</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">金額入力</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">応募単価</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">推定広告費</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.rows.map(row => (
                    <tr key={row.inflow} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{row.inflow}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{row.applyCount}</td>
                      <td className="px-4 py-3">
                        <select
                          value={row.costType}
                          onChange={e => updateRow(row.inflow, { costType: e.target.value })}
                          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900"
                        >
                          <option value="operation">運用型（総額）</option>
                          <option value="performance">成果報酬型（単価）</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.costType === "operation" ? (
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-xs text-gray-400">¥</span>
                            <input
                              type="number"
                              value={row.totalCost ?? ""}
                              onChange={e => updateRow(row.inflow, { totalCost: e.target.value === "" ? null : Number(e.target.value) })}
                              className="w-32 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right text-gray-900"
                              placeholder="総額"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-xs text-gray-400">¥</span>
                            <input
                              type="number"
                              value={row.unitPrice ?? ""}
                              onChange={e => updateRow(row.inflow, { unitPrice: e.target.value === "" ? null : Number(e.target.value) })}
                              className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right text-gray-900"
                              placeholder="単価"
                            />
                            <span className="text-xs text-gray-400">/件</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-blue-600">
                        {costPerApply(row) != null ? "¥" + fmt(costPerApply(row)) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {estimatedCost(row) != null ? "¥" + fmt(estimatedCost(row)) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => saveRow(row)}
                          disabled={savingInflow === row.inflow}
                          className="text-xs bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                        >
                          {savingInflow === row.inflow ? "保存中" : savedInflow === row.inflow ? "✓ 保存" : "保存"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-gray-200 px-4 py-3 flex items-center gap-2 bg-gray-50">
                <span className="text-xs text-gray-400">リストに無い媒体を追加：</span>
                <input
                  value={newInflow}
                  onChange={e => setNewInflow(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addInflow() }}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900"
                  placeholder="流入元名"
                />
                <button onClick={addInflow} className="text-xs bg-gray-600 text-white rounded-lg px-3 py-1.5 hover:bg-gray-700">＋ 追加</button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}