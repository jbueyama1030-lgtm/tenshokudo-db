"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"

type Cost = {
  id: string
  name: string
  inflow: string | null
  year: number
  month: number
  category: string
  costType: string
  unitPrice: number | null
  totalCost: number | null
  memo: string | null
}
type InflowRow = { inflow: string; applyCount: number }
type AdCostData = {
  availableMonths: { year: number; month: number }[]
  target: { year: number; month: number } | null
  inflows: InflowRow[]
  costs: Cost[]
}

type DraftCost = {
  name: string
  inflow: string
  category: string
  costType: string
  unitPrice: string
  totalCost: string
  memo: string
}

const EMPTY_DRAFT: DraftCost = {
  name: "",
  inflow: "",
  category: "direct",
  costType: "operation",
  unitPrice: "",
  totalCost: "",
  memo: "",
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
  const [saving, setSaving] = useState(false)

  // 新規追加フォーム
  const [draft, setDraft] = useState<DraftCost>(EMPTY_DRAFT)
  // 編集中の明細ID
  const [editingId, setEditingId] = useState("")
  const [editDraft, setEditDraft] = useState<DraftCost>(EMPTY_DRAFT)

  const load = async (year?: number, month?: number) => {
    setLoading(true)
    setError("")
    let url = "/api/ad-costs"
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

  // 明細を保存（新規・更新共通）
  const saveCost = async (d: DraftCost) => {
    if (!data?.target) return
    if (!d.name.trim()) { setError("費用名を入力してください"); return }
    setSaving(true)
    setError("")
    const res = await fetch("/api/ad-costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: d.name.trim(),
        inflow: d.category === "overhead" ? null : d.inflow,
        year: data.target.year,
        month: data.target.month,
        category: d.category,
        costType: d.costType,
        unitPrice: d.costType === "performance" && d.unitPrice !== "" ? Number(d.unitPrice) : null,
        totalCost: d.costType === "operation" && d.totalCost !== "" ? Number(d.totalCost) : null,
        memo: d.memo,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setDraft(EMPTY_DRAFT)
      setEditingId("")
      await load(data.target.year, data.target.month)
    } else {
      const e = await res.json()
      setError(e.error ?? "保存に失敗しました")
    }
  }

  const deleteCost = async (id: string, name: string) => {
    if (!confirm("「" + name + "」を削除しますか？")) return
    if (!data?.target) return
    const res = await fetch("/api/ad-costs?id=" + id, { method: "DELETE" })
    if (res.ok) await load(data.target.year, data.target.month)
  }

  const startEdit = (c: Cost) => {
    setEditingId(c.id)
    setEditDraft({
      name: c.name,
      inflow: c.inflow ?? "",
      category: c.category,
      costType: c.costType,
      unitPrice: c.unitPrice != null ? String(c.unitPrice) : "",
      totalCost: c.totalCost != null ? String(c.totalCost) : "",
      memo: c.memo ?? "",
    })
  }

  // 明細1件の金額（運用型=総額 / 成果報酬型=単価×その流入の応募数）
  const costAmount = (c: Cost): number | null => {
    if (c.costType === "operation") return c.totalCost
    if (c.costType === "performance" && c.unitPrice != null) {
      const applyCount = data?.inflows.find(i => i.inflow === c.inflow)?.applyCount ?? 0
      return c.unitPrice * applyCount
    }
    return null
  }

  const directCosts = (data?.costs ?? []).filter(c => c.category === "direct")
  const overheadCosts = (data?.costs ?? []).filter(c => c.category === "overhead")

  // 流入元ごとの費用合計
  const inflowTotal = (inflow: string): number => {
    return directCosts
      .filter(c => c.inflow === inflow)
      .reduce((s, c) => s + (costAmount(c) ?? 0), 0)
  }

  const overheadTotal = overheadCosts.reduce((s, c) => s + (costAmount(c) ?? 0), 0)
  const directTotal = directCosts.reduce((s, c) => s + (costAmount(c) ?? 0), 0)

  // 明細フォーム（新規・編集共通）
  const renderForm = (d: DraftCost, setD: (v: DraftCost) => void, onSave: () => void, onCancel?: () => void) => (
    <div className="grid grid-cols-12 gap-2 items-end">
      <div className="col-span-3">
        <label className="block text-xs text-gray-400 mb-1">費用名 <span className="text-red-400">*</span></label>
        <input
          value={d.name}
          onChange={e => setD({ ...d, name: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900"
          placeholder="例: プライムサープ(Indeed)"
        />
      </div>
      <div className="col-span-2">
        <label className="block text-xs text-gray-400 mb-1">区分</label>
        <select
          value={d.category}
          onChange={e => setD({ ...d, category: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900"
        >
          <option value="direct">媒体直課</option>
          <option value="overhead">配賦対象外</option>
        </select>
      </div>
      <div className="col-span-2">
        <label className="block text-xs text-gray-400 mb-1">流入元</label>
        <select
          value={d.inflow}
          onChange={e => setD({ ...d, inflow: e.target.value })}
          disabled={d.category === "overhead"}
          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
        >
          <option value="">未選択</option>
          {(data?.inflows ?? []).map(i => (
            <option key={i.inflow} value={i.inflow}>{i.inflow}</option>
          ))}
        </select>
      </div>
      <div className="col-span-2">
        <label className="block text-xs text-gray-400 mb-1">課金タイプ</label>
        <select
          value={d.costType}
          onChange={e => setD({ ...d, costType: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900"
        >
          <option value="operation">運用型（総額）</option>
          <option value="performance">成果報酬型（単価）</option>
        </select>
      </div>
      <div className="col-span-2">
        <label className="block text-xs text-gray-400 mb-1">{d.costType === "operation" ? "総額" : "単価"}</label>
        <input
          type="number"
          value={d.costType === "operation" ? d.totalCost : d.unitPrice}
          onChange={e => d.costType === "operation"
            ? setD({ ...d, totalCost: e.target.value })
            : setD({ ...d, unitPrice: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right text-gray-900"
          placeholder="¥"
        />
      </div>
      <div className="col-span-1 flex gap-1">
        <button
          onClick={onSave}
          disabled={saving}
          className="text-xs bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
        >
          {saving ? "..." : "保存"}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap">取消</button>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-6xl">
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
            費用は明細単位で登録します。特定の流入元に紐づくものは「媒体直課」、流入に紐づかないものは「配賦対象外」を選んでください。配賦対象外は媒体別CPAには含まれず、全体広告費にのみ加算されます。
          </p>

          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">{error}</div>}

          {loading ? (
            <div className="text-gray-400 text-sm py-12 text-center">読み込み中...</div>
          ) : !data || !data.target ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-400">応募データがありません</p>
            </div>
          ) : (
            <>
              {/* 流入元サマリー */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <span className="text-sm font-semibold text-gray-700">流入元サマリー</span>
                  <span className="text-xs text-gray-400 ml-2">明細から自動集計</span>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">流入元</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">応募数</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">広告費</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">応募単価</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.inflows.map(i => {
                      const total = inflowTotal(i.inflow)
                      const cpa = total > 0 && i.applyCount > 0 ? Math.round(total / i.applyCount) : null
                      return (
                        <tr key={i.inflow} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium text-gray-900">{i.inflow}</td>
                          <td className="px-4 py-2 text-right text-gray-600">{i.applyCount}</td>
                          <td className="px-4 py-2 text-right text-gray-900">{total > 0 ? "¥" + fmt(total) : <span className="text-gray-300">未入力</span>}</td>
                          <td className="px-4 py-2 text-right font-medium text-blue-600">{cpa != null ? "¥" + fmt(cpa) : "-"}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td className="px-4 py-2 text-xs font-medium text-gray-500">媒体直課 合計</td>
                      <td className="px-4 py-2 text-right text-xs text-gray-500">{data.inflows.reduce((s, i) => s + i.applyCount, 0)}</td>
                      <td className="px-4 py-2 text-right font-bold text-gray-900">¥{fmt(directTotal)}</td>
                      <td className="px-4 py-2"></td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-xs font-medium text-gray-500">その他広告費（配賦対象外）</td>
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2 text-right font-bold text-orange-600">¥{fmt(overheadTotal)}</td>
                      <td className="px-4 py-2"></td>
                    </tr>
                    <tr className="border-t border-gray-300">
                      <td className="px-4 py-2 text-xs font-bold text-gray-700">全体広告費</td>
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2 text-right font-bold text-blue-700 text-base">¥{fmt(directTotal + overheadTotal)}</td>
                      <td className="px-4 py-2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* 明細追加フォーム */}
              <div className="bg-white rounded-xl border border-blue-200 p-4 mb-5">
                <div className="text-xs font-medium text-blue-800 mb-3">＋ 費用明細を追加</div>
                {renderForm(draft, setDraft, () => saveCost(draft))}
              </div>

              {/* 明細一覧 */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <span className="text-sm font-semibold text-gray-700">費用明細（{data.costs.length}件）</span>
                </div>
                {data.costs.length === 0 ? (
                  <p className="text-sm text-gray-400 py-8 text-center">この月の明細はまだありません</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">費用名</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">区分</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">流入元</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">課金</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">入力値</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">金額</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.costs.map(c => (
                        editingId === c.id ? (
                          <tr key={c.id} className="bg-blue-50">
                            <td colSpan={7} className="px-4 py-3">
                              {renderForm(editDraft, setEditDraft, () => saveCost(editDraft), () => setEditingId(""))}
                            </td>
                          </tr>
                        ) : (
                          <tr key={c.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium text-gray-900">{c.name}</td>
                            <td className="px-4 py-2">
                              {c.category === "overhead"
                                ? <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">配賦対象外</span>
                                : <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">媒体直課</span>}
                            </td>
                            <td className="px-4 py-2 text-gray-600">{c.inflow ?? <span className="text-gray-300">-</span>}</td>
                            <td className="px-4 py-2 text-xs text-gray-500">{c.costType === "operation" ? "運用型" : "成果報酬"}</td>
                            <td className="px-4 py-2 text-right text-gray-600">
                              {c.costType === "operation"
                                ? (c.totalCost != null ? "¥" + fmt(c.totalCost) : "-")
                                : (c.unitPrice != null ? "¥" + fmt(c.unitPrice) + "/件" : "-")}
                            </td>
                            <td className="px-4 py-2 text-right font-medium text-gray-900">
                              {costAmount(c) != null ? "¥" + fmt(costAmount(c)) : "-"}
                            </td>
                            <td className="px-4 py-2 text-right whitespace-nowrap">
                              <button onClick={() => startEdit(c)} className="text-xs text-blue-600 hover:underline mr-2">編集</button>
                              <button onClick={() => deleteCost(c.id, c.name)} className="text-xs text-red-400 hover:text-red-600">削除</button>
                            </td>
                          </tr>
                        )
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}