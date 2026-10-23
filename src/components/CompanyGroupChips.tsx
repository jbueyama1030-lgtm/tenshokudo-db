// 置き場所: src/components/CompanyGroupChips.tsx
"use client"
import { useEffect, useState } from "react"

type G = { id: string; name: string; kind: string; color: string | null }

const TAG_COLORS: Record<string, string> = {
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-800",
  green: "bg-green-100 text-green-700",
  blue: "bg-blue-100 text-blue-700",
  purple: "bg-purple-100 text-purple-700",
  gray: "bg-gray-100 text-gray-600",
}

/** 企業詳細のヘッダーに出す法人グループ・タグ（社内のみ）。その場で付け外しできる */
export default function CompanyGroupChips({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const [corporate, setCorporate] = useState<{ id: string; name: string } | null>(null)
  const [tags, setTags] = useState<G[]>([])
  const [all, setAll] = useState<G[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(false)

  const load = async () => {
    const r = await fetch("/api/companies/" + companyId + "/groups")
    if (!r.ok) { setHidden(true); return }
    const d = await r.json()
    setCorporate(d.corporate)
    setTags(d.tags)
    setAll(d.all)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [companyId])

  const change = async (groupId: string, body: { add?: string[]; remove?: string[] }) => {
    setBusy(true)
    await fetch(`/api/groups/${groupId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    setBusy(false)
    load()
  }

  if (hidden) return null

  const tagIds = new Set(tags.map(t => t.id))
  const corporateOptions = all.filter(g => g.kind !== "tag")
  const tagOptions = all.filter(g => g.kind === "tag")

  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {corporate && (
        <a href={"/groups/" + corporate.id} className="text-xs px-2.5 py-0.5 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50">🏢 {corporate.name}</a>
      )}
      {tags.map(t => (
        <a key={t.id} href={"/groups/" + t.id} className={"text-xs px-2.5 py-0.5 rounded-full font-medium hover:opacity-80 " + (TAG_COLORS[t.color ?? "gray"] ?? TAG_COLORS.gray)}>{t.name}</a>
      ))}
      {canEdit && (
        <button type="button" onClick={() => setOpen(!open)} className="text-xs px-2 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50">
          ＋ グループ・タグ
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-7 z-30 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-4 space-y-4">
            <div>
              <div className="text-xs text-gray-500 mb-1.5">法人グループ（1つ）</div>
              <select
                value={corporate?.id ?? ""}
                disabled={busy}
                onChange={e => {
                  const v = e.target.value
                  if (v) change(v, { add: [companyId] })
                  else if (corporate) change(corporate.id, { remove: [companyId] })
                }}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900"
              >
                <option value="">なし</option>
                {corporateOptions.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1.5">タグ（複数可）</div>
              {tagOptions.length === 0 ? (
                <p className="text-xs text-gray-400">タグがありません。<a href="/groups" className="text-blue-600 underline">グループ・タグ</a>の画面で作成できます。</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {tagOptions.map(t => {
                    const on = tagIds.has(t.id)
                    return (
                      <button key={t.id} type="button" disabled={busy}
                        onClick={() => change(t.id, on ? { remove: [companyId] } : { add: [companyId] })}
                        className={"text-xs px-2.5 py-1 rounded-full font-medium border disabled:opacity-50 " + (on ? (TAG_COLORS[t.color ?? "gray"] ?? TAG_COLORS.gray) + " border-transparent" : "bg-white text-gray-500 border-gray-200")}>
                        {on ? "✓ " : ""}{t.name}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
