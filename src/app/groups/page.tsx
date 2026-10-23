// 置き場所: src/app/groups/page.tsx
"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

type Group = { id: string; name: string; kind: string; color: string | null; note: string | null; sourceGroupId: string | null; memberCount: number }

const TAG_COLORS: Record<string, string> = {
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-800",
  green: "bg-green-100 text-green-700",
  blue: "bg-blue-100 text-blue-700",
  purple: "bg-purple-100 text-purple-700",
  gray: "bg-gray-100 text-gray-600",
}
const COLOR_KEYS = Object.keys(TAG_COLORS)

/** グループ・タグの一覧と作成 */
export default function GroupsPage() {
  const router = useRouter()
  const [userName, setUserName] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [err, setErr] = useState("")
  const [form, setForm] = useState<{ kind: "corporate" | "tag"; name: string; color: string }>({ kind: "tag", name: "", color: "red" })
  const [saving, setSaving] = useState(false)
  const [importMsg, setImportMsg] = useState("")

  const load = async () => {
    const r = await fetch("/api/groups")
    const d = await r.json().catch(() => null)
    if (!r.ok || !Array.isArray(d)) { setErr(d?.error ?? "読み込めませんでした"); return }
    setGroups(d)
  }

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => {
      setUserName(s?.user?.name ?? "")
      const roles: string[] = Array.isArray(s?.user?.roles) && s.user.roles.length > 0 ? s.user.roles : s?.user?.role ? [s.user.role] : []
      setIsAdmin(roles.includes("admin"))
    })
    load()
  }, [])

  const create = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    const r = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (!r.ok) { const e = await r.json().catch(() => null); setErr(e?.error ?? "作成できませんでした"); return }
    const g = await r.json()
    router.push("/groups/" + g.id)
  }

  const runImport = async () => {
    if (!confirm("記事インポートの「企業グループID」から法人グループを自動作成します。よろしいですか？")) return
    setImportMsg("作成中...")
    const r = await fetch("/api/groups/import", { method: "POST" })
    const d = await r.json().catch(() => null)
    if (!r.ok || !d) { setImportMsg(d?.error ?? "失敗しました"); return }
    setImportMsg(`法人グループを ${d.created} 件作成し、${d.assigned} 社を所属させました。名前を確認して付け直してください。`)
    load()
  }

  const corporate = (groups ?? []).filter(g => g.kind !== "tag")
  const tags = (groups ?? []).filter(g => g.kind === "tag")

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-5xl">
          <h1 className="text-2xl font-bold text-gray-900">グループ・タグ</h1>
          <p className="text-sm text-gray-500 mt-0.5 mb-5">同じ会社の営業所をまとめる「法人グループ」と、自由に付けられる「タグ」（社内向け）</p>

          {err && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">{err}</div>}

          {/* 作成 */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-5">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1">
                {([{ k: "tag", l: "タグ" }, { k: "corporate", l: "法人グループ" }] as const).map(o => (
                  <button key={o.k} type="button" onClick={() => setForm({ ...form, kind: o.k })}
                    className={"px-3 py-1.5 text-xs rounded-full border " + (form.kind === o.k ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200")}>
                    {o.l}
                  </button>
                ))}
              </div>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder={form.kind === "tag" ? "例: 要対策企業" : "例: 平和交通グループ"}
                className="flex-1 min-w-[12rem] border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900" />
              {form.kind === "tag" && (
                <div className="flex gap-1">
                  {COLOR_KEYS.map(c => (
                    <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                      className={"w-6 h-6 rounded-full " + TAG_COLORS[c] + (form.color === c ? " ring-2 ring-offset-1 ring-gray-500" : "")} aria-label={c} />
                  ))}
                </div>
              )}
              <button type="button" onClick={create} disabled={saving || !form.name.trim()} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">作成</button>
            </div>
          </div>

          {!groups && !err && <p className="text-sm text-gray-400 py-8 text-center">読み込み中...</p>}

          {groups && (
            <div className="grid grid-cols-2 gap-5">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">タグ <span className="text-gray-400 font-normal">{tags.length}</span></h2>
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                  {tags.length === 0 && <p className="text-sm text-gray-400 p-4">まだタグがありません</p>}
                  {tags.map(g => (
                    <button key={g.id} type="button" onClick={() => router.push("/groups/" + g.id)} className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50">
                      <span className={"text-xs px-2.5 py-0.5 rounded-full font-medium " + (TAG_COLORS[g.color ?? "gray"] ?? TAG_COLORS.gray)}>{g.name}</span>
                      <span className="ml-auto text-xs text-gray-500">{g.memberCount}社</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center mb-2">
                  <h2 className="text-sm font-semibold text-gray-700">法人グループ <span className="text-gray-400 font-normal">{corporate.length}</span></h2>
                  {isAdmin && (
                    <button type="button" onClick={runImport} className="ml-auto text-xs text-blue-600 hover:underline">転職道の企業グループIDから自動作成</button>
                  )}
                </div>
                {importMsg && <p className="text-xs text-blue-700 mb-2">{importMsg}</p>}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                  {corporate.length === 0 && <p className="text-sm text-gray-400 p-4">まだ法人グループがありません</p>}
                  {corporate.map(g => (
                    <button key={g.id} type="button" onClick={() => router.push("/groups/" + g.id)} className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50">
                      <span className="text-sm text-gray-900">{g.name}</span>
                      {g.sourceGroupId && <span className="text-[10px] text-gray-400">転職道ID {g.sourceGroupId}</span>}
                      <span className="ml-auto text-xs text-gray-500">{g.memberCount}社</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
