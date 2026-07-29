"use client"
import { useEffect, useState } from "react"

type Option = { name: string; amount: number }
type Period = {
  id: string
  externalId: string | null
  status: string
  contractStart: string | null
  contractRenewal: string | null
  contractEnd: string | null
  planName: string | null
  monthlyFee: number | null
  discountRate: number | null
  discountNote: string | null
  options: Option[] | null
  contractNote: string | null
}

type Draft = {
  externalId: string
  contractStart: string
  contractRenewal: string
  contractEnd: string
  planName: string
  monthlyFee: string
  discountRate: string
  discountNote: string
  options: Option[]
  contractNote: string
}

const EMPTY_DRAFT: Draft = {
  externalId: "",
  contractStart: "",
  contractRenewal: "",
  contractEnd: "",
  planName: "",
  monthlyFee: "",
  discountRate: "",
  discountNote: "",
  options: [],
  contractNote: "",
}

function fmt(n: number | null | undefined) {
  if (n == null) return "-"
  return Number(n).toLocaleString("ja-JP")
}

// 年間売上 = 月額×12 − 割引 + オプション合計
function annualRevenue(d: { monthlyFee: number | null; discountRate: number | null; options: Option[] | null }): number {
  const base = (d.monthlyFee ?? 0) * 12
  const discount = Math.round(base * ((d.discountRate ?? 0) / 100))
  const opt = (d.options ?? []).reduce((s, o) => s + (Number(o.amount) || 0), 0)
  return base - discount + opt
}

function daysUntil(dateStr: string | null) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr).getTime() - new Date().getTime()) / 86400000)
}

// その期間が今アクティブか
function isActive(p: Period): boolean {
  if (!p.contractStart) return false
  const now = new Date()
  if (new Date(p.contractStart) > now) return false
  if (p.contractEnd && new Date(p.contractEnd) < now) return false
  return true
}

export default function ContractPeriods({
  companyId,
  canEdit,
  onStatusMaybeChanged,
}: {
  companyId: string
  canEdit: boolean
  onStatusMaybeChanged?: () => void
}) {
  const [periods, setPeriods] = useState<Period[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState("")
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const res = await fetch("/api/companies/" + companyId + "/contract-periods")
    if (res.ok) setPeriods(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [companyId])

  const toDraft = (p: Period): Draft => ({
    externalId: p.externalId ?? "",
    contractStart: p.contractStart?.slice(0, 10) ?? "",
    contractRenewal: p.contractRenewal?.slice(0, 10) ?? "",
    contractEnd: p.contractEnd?.slice(0, 10) ?? "",
    planName: p.planName ?? "",
    monthlyFee: p.monthlyFee != null ? String(p.monthlyFee) : "",
    discountRate: p.discountRate != null ? String(p.discountRate) : "",
    discountNote: p.discountNote ?? "",
    options: p.options ?? [],
    contractNote: p.contractNote ?? "",
  })

  const startAdd = () => { setDraft(EMPTY_DRAFT); setAdding(true); setEditingId("") }
  const startEdit = (p: Period) => { setDraft(toDraft(p)); setEditingId(p.id); setAdding(false) }
  const cancel = () => { setAdding(false); setEditingId(""); setDraft(EMPTY_DRAFT) }

  const save = async () => {
    setSaving(true)
    const payload = {
      externalId: draft.externalId,
      contractStart: draft.contractStart || null,
      contractRenewal: draft.contractRenewal || null,
      contractEnd: draft.contractEnd || null,
      planName: draft.planName,
      monthlyFee: draft.monthlyFee,
      discountRate: draft.discountRate,
      discountNote: draft.discountNote,
      options: draft.options,
      contractNote: draft.contractNote,
    }
    const url = editingId
      ? "/api/companies/" + companyId + "/contract-periods/" + editingId
      : "/api/companies/" + companyId + "/contract-periods"
    const res = await fetch(url, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (res.ok) {
      cancel()
      await load()
      onStatusMaybeChanged?.()
    } else {
      const e = await res.json()
      alert(e.error ?? "保存に失敗しました")
    }
  }

  const remove = async (p: Period) => {
    if (!confirm("この契約期間を削除しますか？")) return
    const res = await fetch("/api/companies/" + companyId + "/contract-periods/" + p.id, { method: "DELETE" })
    if (res.ok) {
      await load()
      onStatusMaybeChanged?.()
    }
  }

  const renderForm = () => (
    <div className="bg-blue-50 rounded-lg p-4 space-y-3">
      <div className="text-xs font-medium text-blue-800">{editingId ? "契約期間を編集" : "契約期間を追加"}</div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">企業ID（この期間）</label>
          <input value={draft.externalId} onChange={e => setDraft({ ...draft, externalId: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900" placeholder="再掲載で変わる場合" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">プラン</label>
          <select value={draft.planName} onChange={e => setDraft({ ...draft, planName: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900">
            <option value="">未設定</option>
            <option>ライト</option><option>スタンダード</option><option>ハイグレード</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">月額掲載料</label>
          <input type="number" value={draft.monthlyFee} onChange={e => setDraft({ ...draft, monthlyFee: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900" placeholder="円" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">契約開始日</label>
          <input type="date" value={draft.contractStart} onChange={e => setDraft({ ...draft, contractStart: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">次回更新日</label>
          <input type="date" value={draft.contractRenewal} onChange={e => setDraft({ ...draft, contractRenewal: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">解約日（入力すると掲載落ちに）</label>
          <input type="date" value={draft.contractEnd} onChange={e => setDraft({ ...draft, contractEnd: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">割引率(%)</label>
          <input type="number" value={draft.discountRate} onChange={e => setDraft({ ...draft, discountRate: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900" placeholder="%" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-gray-400 mb-1">割引備考</label>
          <input value={draft.discountNote} onChange={e => setDraft({ ...draft, discountNote: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900" placeholder="例: 3年契約5%OFF" />
        </div>
      </div>

      {/* オプション */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">オプション（追加広告等）</label>
        {draft.options.map((op, i) => (
          <div key={i} className="flex items-center gap-2 mb-1.5">
            <input value={op.name} onChange={e => { const arr = [...draft.options]; arr[i] = { ...arr[i], name: e.target.value }; setDraft({ ...draft, options: arr }) }} className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm text-gray-900" placeholder="オプション名" />
            <input type="number" value={op.amount} onChange={e => { const arr = [...draft.options]; arr[i] = { ...arr[i], amount: e.target.value === "" ? 0 : Number(e.target.value) }; setDraft({ ...draft, options: arr }) }} className="w-32 border border-gray-200 rounded px-2 py-1 text-sm text-right text-gray-900" placeholder="金額" />
            <button type="button" onClick={() => setDraft({ ...draft, options: draft.options.filter((_, j) => j !== i) })} className="text-red-400 text-xs hover:text-red-600">削除</button>
          </div>
        ))}
        <button type="button" onClick={() => setDraft({ ...draft, options: [...draft.options, { name: "", amount: 0 }] })} className="text-xs text-blue-600 hover:underline">＋ オプション追加</button>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">契約期間備考</label>
        <textarea value={draft.contractNote} onChange={e => setDraft({ ...draft, contractNote: e.target.value })} rows={2} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900" />
      </div>

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{saving ? "保存中..." : "保存"}</button>
        <button onClick={cancel} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">キャンセル</button>
      </div>
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">掲載契約（契約期間）</h2>
        {canEdit && !adding && !editingId && (
          <button onClick={startAdd} className="text-xs bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700">＋ 契約期間を追加</button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-4 text-center">読み込み中...</p>
      ) : (
        <>
          {(adding || editingId) && <div className="mb-4">{renderForm()}</div>}

          {periods.length === 0 && !adding ? (
            <p className="text-sm text-gray-400 py-4 text-center">掲載契約の履歴がありません{canEdit && "。「契約期間を追加」から登録してください"}</p>
          ) : (
            <div className="space-y-3">
              {periods.map(p => {
                const active = isActive(p)
                const renewalDays = daysUntil(p.contractRenewal)
                const revenue = annualRevenue(p)
                return (
                  <div key={p.id} className={"rounded-lg border p-4 " + (active ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50")}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {active
                          ? <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-800">契約中</span>
                          : p.contractEnd
                            ? <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-200 text-gray-600">終了</span>
                            : <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-700">開始前/未設定</span>}
                        {p.externalId && <span className="text-xs text-gray-400">ID: {p.externalId}</span>}
                        {p.planName && <span className="text-xs text-gray-500">{p.planName}</span>}
                      </div>
                      {canEdit && !editingId && !adding && (
                        <div className="flex gap-2">
                          <button onClick={() => startEdit(p)} className="text-xs text-blue-600 hover:underline">編集</button>
                          <button onClick={() => remove(p)} className="text-xs text-red-400 hover:text-red-600">削除</button>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-gray-400">期間</div>
                        <div className="text-gray-900">
                          {p.contractStart?.slice(0, 10) ?? "-"}
                          {" 〜 "}
                          {p.contractEnd?.slice(0, 10) ?? "継続中"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">次回更新</div>
                        <div className="text-gray-900">
                          {p.contractRenewal?.slice(0, 10) ?? "-"}
                          {active && renewalDays != null && (
                            <span className={"ml-1 text-xs px-1.5 py-0.5 rounded-full " + (renewalDays <= 14 ? "bg-red-100 text-red-700" : renewalDays <= 60 ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700")}>残{renewalDays}日</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">月額掲載料</div>
                        <div className="text-gray-900">{p.monthlyFee != null ? "¥" + fmt(p.monthlyFee) : "-"}{p.discountRate ? "（" + p.discountRate + "%off）" : ""}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">年間売上</div>
                        <div className="font-bold text-blue-700">¥{fmt(revenue)}</div>
                      </div>
                    </div>
                    {(p.options ?? []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(p.options ?? []).map((op, i) => (
                          <span key={i} className="text-xs bg-white border border-gray-200 rounded-full px-2 py-0.5 text-gray-600">{op.name} ¥{fmt(op.amount)}</span>
                        ))}
                      </div>
                    )}
                    {p.contractNote && <div className="mt-2 text-xs text-gray-500 whitespace-pre-wrap">{p.contractNote}</div>}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}