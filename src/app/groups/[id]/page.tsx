// 置き場所: src/app/groups/[id]/page.tsx
"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"

type Flag = { key: string; label: string; level: "red" | "yellow" | "gray" }
type Member = {
  id: string
  companyId: string | null
  name: string
  status: string
  prefecture: string
  userName: string
  flags: Flag[]
  applyN: number
  hiredN: number
  withAge: number
  avgAge: number | null
  unopenedN: number
  renewalDate: string | null
}
type Detail = {
  group: { id: string; name: string; kind: string; color: string | null; note: string | null; sourceGroupId: string | null }
  months: number
  totals: { members: number; contracted: number; apply: number; hired: number; hireRate: number | null; avgAge: number | null; unopened: number; attention: number }
  members: Member[]
}
type CompanyLite = { id: string; name: string; companyId: string | null }

const TAG_COLORS: Record<string, string> = {
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-800",
  green: "bg-green-100 text-green-700",
  blue: "bg-blue-100 text-blue-700",
  purple: "bg-purple-100 text-purple-700",
  gray: "bg-gray-100 text-gray-600",
}
const STATUS: Record<string, { label: string; cls: string }> = {
  contracted: { label: "契約中", cls: "bg-green-50 text-green-700" },
  referral_only: { label: "人材紹介のみ", cls: "bg-emerald-50 text-emerald-700" },
  approaching: { label: "アプローチ中", cls: "bg-blue-50 text-blue-700" },
  delisted: { label: "掲載落ち", cls: "bg-gray-100 text-gray-500" },
}
const FLAG: Record<string, string> = { red: "bg-red-50 text-red-700", yellow: "bg-amber-50 text-amber-800", gray: "bg-gray-100 text-gray-500" }

type SortKey = "name" | "applyN" | "hiredN" | "rate" | "avgAge" | "unopenedN"

function pct(n: number, d: number, digits = 1): string {
  return d > 0 ? ((n / d) * 100).toFixed(digits) + "%" : "—"
}

/** グループ詳細：グループ全体の数字（グループ単位のレポート）と、営業所どうしの比較 */
export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [userName, setUserName] = useState("")
  const [months, setMonths] = useState(12)
  const [data, setData] = useState<Detail | null>(null)
  const [err, setErr] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("applyN")
  const [sortDesc, setSortDesc] = useState(true)
  const [editing, setEditing] = useState(false)
  const [edit, setEdit] = useState({ name: "", note: "", color: "gray" })
  const [companies, setCompanies] = useState<CompanyLite[]>([])
  const [addName, setAddName] = useState("")
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const r = await fetch(`/api/groups/${id}?months=${months}`)
    const d = await r.json().catch(() => null)
    if (!r.ok || !d) { setErr(d?.error ?? "読み込めませんでした"); return }
    setData(d)
  }

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => setUserName(s?.user?.name ?? ""))
  }, [])
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id, months])

  const sorted = useMemo(() => {
    const list = [...(data?.members ?? [])]
    const v = (m: Member): number | string => {
      switch (sortKey) {
        case "name": return m.name
        case "applyN": return m.applyN
        case "hiredN": return m.hiredN
        case "rate": return m.applyN > 0 ? m.hiredN / m.applyN : -1
        case "avgAge": return m.avgAge ?? -1
        case "unopenedN": return m.unopenedN
      }
    }
    list.sort((a, b) => {
      const va = v(a), vb = v(b)
      const c = typeof va === "string" ? va.localeCompare(vb as string, "ja") : (va as number) - (vb as number)
      return sortDesc ? -c : c
    })
    return list
  }, [data, sortKey, sortDesc])

  const clickSort = (k: SortKey) => {
    if (sortKey === k) setSortDesc(!sortDesc)
    else { setSortKey(k); setSortDesc(k !== "name") }
  }
  const th = (k: SortKey, label: string, align: "left" | "right" = "right") => (
    <th className={"px-3 py-3 font-medium cursor-pointer select-none hover:text-gray-800 print:cursor-auto " + (align === "left" ? "text-left" : "text-right")} onClick={() => clickSort(k)}>
      {label}<span className="text-[10px] ml-0.5 print:hidden">{sortKey === k ? (sortDesc ? "▼" : "▲") : ""}</span>
    </th>
  )

  const startEdit = () => {
    if (!data) return
    setEdit({ name: data.group.name, note: data.group.note ?? "", color: data.group.color ?? "gray" })
    setEditing(true)
  }
  const saveEdit = async () => {
    setBusy(true)
    const r = await fetch("/api/groups/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(edit),
    })
    setBusy(false)
    if (!r.ok) { const e = await r.json().catch(() => null); setErr(e?.error ?? "保存できませんでした"); return }
    setEditing(false)
    load()
  }
  const removeGroup = async () => {
    if (!data || !confirm(`「${data.group.name}」を削除しますか？（企業は削除されず、所属が外れるだけです）`)) return
    const r = await fetch("/api/groups/" + id, { method: "DELETE" })
    if (r.ok) router.push("/groups")
  }

  const loadCompanies = () => {
    if (companies.length > 0) return
    fetch("/api/companies").then(r => r.json()).then(d => {
      if (Array.isArray(d)) setCompanies(d.map((c: CompanyLite) => ({ id: c.id, name: c.name, companyId: c.companyId })))
    })
  }
  const changeMembers = async (body: { add?: string[]; remove?: string[] }) => {
    setBusy(true)
    const r = await fetch(`/api/groups/${id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    setBusy(false)
    if (!r.ok) { const e = await r.json().catch(() => null); setErr(e?.error ?? "更新できませんでした"); return }
    load()
  }
  const addMember = async () => {
    const hit = companies.find(c => c.name === addName.trim())
    if (!hit) { setErr("企業は候補の中から選んでください"); return }
    setErr("")
    setAddName("")
    await changeMembers({ add: [hit.id] })
  }

  if (!data) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar userName={userName} />
        <main className="flex-1 flex items-center justify-center text-sm text-gray-400">{err || "読み込み中..."}</main>
      </div>
    )
  }

  const g = data.group
  const t = data.totals
  const isTag = g.kind === "tag"

  return (
    <div className="flex h-screen bg-gray-50 print:block print:h-auto print:bg-white">
      <style>{`@page { size: A4 landscape; margin: 10mm; } @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <div className="print:hidden flex"><Sidebar userName={userName} /></div>
      <main className="flex-1 overflow-auto print:overflow-visible">
        <div className="px-8 py-6 max-w-7xl print:p-0 print:max-w-none">
          <button type="button" onClick={() => router.push("/groups")} className="text-sm text-gray-400 hover:text-gray-600 mb-3 print:hidden">← グループ・タグ一覧</button>

          {err && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700 print:hidden">{err}</div>}

          {/* ヘッダー */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-5 print:shadow-none">
            {editing ? (
              <div className="space-y-3 print:hidden">
                <input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-lg font-bold text-gray-900" />
                {isTag && (
                  <div className="flex gap-1">
                    {Object.keys(TAG_COLORS).map(c => (
                      <button key={c} type="button" onClick={() => setEdit({ ...edit, color: c })}
                        className={"w-6 h-6 rounded-full " + TAG_COLORS[c] + (edit.color === c ? " ring-2 ring-offset-1 ring-gray-500" : "")} aria-label={c} />
                    ))}
                  </div>
                )}
                <textarea value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })} rows={2} placeholder="メモ" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900" />
                <div className="flex gap-2">
                  <button type="button" onClick={saveEdit} disabled={busy} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">保存</button>
                  <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-xl text-gray-600">キャンセル</button>
                  <button type="button" onClick={removeGroup} className="ml-auto text-sm text-red-500 hover:text-red-700">削除</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <div>
                  <div className="text-xs text-gray-500 mb-1">{isTag ? "タグ" : "法人グループ"}{g.sourceGroupId && <span className="ml-2 text-gray-400">転職道の企業グループID {g.sourceGroupId}</span>}</div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {isTag ? <span className={"px-3 py-1 rounded-full text-xl " + (TAG_COLORS[g.color ?? "gray"] ?? TAG_COLORS.gray)}>{g.name}</span> : g.name}
                  </h1>
                  {g.note && <p className="text-sm text-gray-500 mt-2 whitespace-pre-wrap">{g.note}</p>}
                </div>
                <div className="flex-1" />
                <div className="flex items-center gap-2 print:hidden">
                  <select value={months} onChange={e => setMonths(Number(e.target.value))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 bg-white">
                    {[3, 6, 12, 24].map(m => <option key={m} value={m}>直近{m}か月</option>)}
                  </select>
                  <button type="button" onClick={() => window.print()} className="px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-700 bg-white hover:bg-gray-50">🖨 印刷 / PDF</button>
                  <button type="button" onClick={startEdit} className="px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-700 bg-white hover:bg-gray-50">編集</button>
                </div>
              </div>
            )}

            {/* グループ全体の数字 */}
            <div className="grid grid-cols-6 gap-3 mt-5">
              {[
                { label: "所属企業", value: t.members + "社", sub: "うち契約中 " + t.contracted },
                { label: `応募（直近${data.months}か月）`, value: t.apply.toLocaleString() + "件", sub: "" },
                { label: "入社", value: t.hired + "名", sub: "" },
                { label: "入社率", value: t.hireRate != null ? (t.hireRate * 100).toFixed(1) + "%" : "—", sub: "応募→入社" },
                { label: "平均年齢", value: t.avgAge != null ? t.avgAge.toFixed(1) + "歳" : "—", sub: "応募者" },
                { label: "要対応", value: t.attention + "社", sub: t.unopened > 0 ? "未開封の応募 " + t.unopened + "件" : "" },
              ].map(k => (
                <div key={k.label} className="bg-gray-50 rounded-xl px-4 py-3">
                  <div className="text-xs text-gray-500">{k.label}</div>
                  <div className="text-xl font-bold text-gray-900">{k.value}</div>
                  {k.sub && <div className="text-[11px] text-gray-400">{k.sub}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* 営業所どうしの比較 */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto print:shadow-none">
            <div className="flex items-center gap-3 px-4 pt-4 pb-2">
              <h2 className="text-sm font-semibold text-gray-700">{isTag ? "タグが付いている企業" : "営業所どうしの比較"}</h2>
              <span className="text-xs text-gray-400 print:hidden">列の見出しを押すと並べ替えられます</span>
            </div>
            {sorted.length === 0 ? (
              <p className="text-sm text-gray-400 px-4 pb-6">まだ企業がありません。下の欄から追加してください。</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-gray-200 text-xs text-gray-500">
                    {th("name", "企業", "left")}
                    <th className="text-left px-3 py-3 font-medium">ステータス</th>
                    {th("applyN", "応募")}
                    {th("hiredN", "入社")}
                    {th("rate", "入社率")}
                    {th("avgAge", "平均年齢")}
                    {th("unopenedN", "未開封")}
                    <th className="text-left px-3 py-3 font-medium">要対応</th>
                    <th className="text-left px-3 py-3 font-medium">担当</th>
                    <th className="px-3 py-3 print:hidden"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map(m => {
                    const maxApply = Math.max(1, ...sorted.map(x => x.applyN))
                    return (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2.5">
                          <button type="button" onClick={() => router.push("/companies/" + m.id)} className="text-left font-medium text-gray-900 hover:text-blue-600 hover:underline">{m.name}</button>
                          <div className="text-[11px] text-gray-400">{m.companyId ? "ID " + m.companyId : ""}{m.prefecture !== "不明" ? "　" + m.prefecture : ""}</div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={"text-xs px-2 py-0.5 rounded-full " + (STATUS[m.status]?.cls ?? "bg-gray-100 text-gray-600")}>{STATUS[m.status]?.label ?? m.status}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-gray-100 rounded print:hidden"><div className="h-1.5 bg-blue-400 rounded" style={{ width: (m.applyN / maxApply) * 100 + "%" }} /></div>
                            <span className="tabular-nums">{m.applyN}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium text-green-700">{m.hiredN}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{pct(m.hiredN, m.applyN)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{m.avgAge != null ? m.avgAge.toFixed(1) : "—"}</td>
                        <td className={"px-3 py-2.5 text-right tabular-nums " + (m.unopenedN > 0 ? "text-red-600 font-medium" : "text-gray-400")}>{m.unopenedN}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {m.flags.filter(f => f.level !== "gray").slice(0, 2).map(f => (
                              <span key={f.key} className={"text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap " + FLAG[f.level]}>{f.label}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{m.userName}</td>
                        <td className="px-3 py-2.5 text-right print:hidden">
                          <button type="button" disabled={busy} onClick={() => { if (confirm(`「${m.name}」をこの${isTag ? "タグ" : "グループ"}から外しますか？`)) changeMembers({ remove: [m.id] }) }} className="text-xs text-gray-400 hover:text-red-600">外す</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {/* 企業を追加 */}
            <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 print:hidden">
              <input list="group-company-options" value={addName} onFocus={loadCompanies} onChange={e => setAddName(e.target.value)}
                placeholder="企業名を入力して候補から選択" className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900" />
              <datalist id="group-company-options">
                {companies.map(c => <option key={c.id} value={c.name}>{c.companyId ?? ""}</option>)}
              </datalist>
              <button type="button" onClick={addMember} disabled={busy || !addName.trim()} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">追加</button>
            </div>
            {!isTag && <p className="text-[11px] text-gray-400 px-4 pb-3 print:hidden">法人グループは1社につき1つです。別の法人グループに入っている企業を追加すると、こちらに移ります。</p>}
          </div>
        </div>
      </main>
    </div>
  )
}
