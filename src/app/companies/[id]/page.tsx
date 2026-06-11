"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

const PERSONA_OPTIONS = ["20代", "30代", "40代", "50代", "60代以上", "未経験歓迎", "経験者優遇"]
const MEDIA_OPTIONS = ["indeed+", "求人ボックス", "Ligla", "レコメンド", "Criteo", "その他"]

const STATUS_LABELS: Record<string, string> = {
  contracted: "✅ 契約中",
  approaching: "📋 アプローチ中",
  delisted: "📉 掲載落ち",
}

type Company = {
  id: string
  companyId: string | null
  name: string
  status: string
  persona: string[]
  media: string | null
  phone: string | null
  address: string | null
  memo: string | null
  applyCount: number
  hireCount: number
  user: { id: string; name: string }
}

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [company, setCompany] = useState<Company | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Company>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    params.then(({ id }) => {
      fetch(`/api/companies/${id}`)
        .then(r => r.json())
        .then(data => {
          setCompany(data)
          setForm(data)
        })
    })
  }, [params])

  const togglePersona = (p: string) => {
    setForm(f => ({
      ...f,
      persona: (f.persona ?? []).includes(p)
        ? (f.persona ?? []).filter(x => x !== p)
        : [...(f.persona ?? []), p]
    }))
  }

  const handleSave = async () => {
    if (!company) return
    setLoading(true)
    const res = await fetch(`/api/companies/${company.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const updated = await res.json()
      setCompany(updated)
      setEditing(false)
    } else {
      alert("保存に失敗しました")
    }
    setLoading(false)
  }

  const handleDelete = async () => {
    if (!company) return
    if (!confirm(`「${company.name}」を削除しますか？`)) return
    const res = await fetch(`/api/companies/${company.id}`, { method: "DELETE" })
    if (res.ok) {
      router.push("/companies")
    } else {
      alert("削除に失敗しました")
    }
  }

  if (!company) return (
    <div className="flex h-screen items-center justify-center text-gray-400">読み込み中...</div>
  )

  return (
    <div className="flex h-screen bg-gray-50">
      {/* サイドバー */}
      <aside className="w-48 min-w-48 bg-[#0C1A2E] flex flex-col">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="text-sm font-semibold text-white">🚕 転職道</div>
          <div className="text-xs text-white/30 mt-0.5">営業DB</div>
        </div>
        <nav className="flex-1 py-4">
          <div className="px-5 pb-2 text-[10px] text-white/25 uppercase tracking-widest">メニュー</div>
          <a href="/dashboard" className="flex items-center gap-2.5 px-5 py-2 text-sm text-white/45 hover:text-white/75 hover:bg-white/5 border-l-2 border-transparent">📊 ダッシュボード</a>
          <a href="/companies" className="flex items-center gap-2.5 px-5 py-2 text-sm text-white border-l-2 border-[#378ADD] bg-[#378ADD]/10">🏢 企業一覧</a>
          <a href="/companies/new" className="flex items-center gap-2.5 px-5 py-2 text-sm text-white/45 hover:text-white/75 hover:bg-white/5 border-l-2 border-transparent">➕ 企業追加</a>
        </nav>
        <div className="px-5 py-4 border-t border-white/10">
          <a href="/api/auth/signout" className="text-[10px] text-white/30 hover:text-white/60">ログアウト</a>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-3xl">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <a href="/companies" className="text-sm text-gray-400 hover:text-gray-600">← 企業一覧</a>
              <h1 className="text-xl font-bold text-gray-800">{company.name}</h1>
              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">{STATUS_LABELS[company.status]}</span>
            </div>
            <div className="flex gap-2">
              {editing ? (
                <>
                  <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">キャンセル</button>
                  <button onClick={handleSave} disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{loading ? "保存中..." : "保存する"}</button>
                </>
              ) : (
                <>
                  <button onClick={handleDelete} className="px-4 py-2 text-sm border border-red-200 text-red-500 rounded-lg hover:bg-red-50">削除</button>
                  <button onClick={() => setEditing(true)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">編集する</button>
                </>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            {/* 会社名 */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">会社名</label>
              {editing ? (
                <input type="text" value={form.name ?? ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              ) : (
                <p className="text-sm text-gray-900 font-medium">{company.name}</p>
              )}
            </div>

            {/* 企業ID */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">企業ID</label>
              {editing ? (
                <input type="text" value={form.companyId ?? ""} onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              ) : (
                <p className="text-sm text-gray-900">{company.companyId ?? "-"}</p>
              )}
            </div>

            {/* ステータス */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">ステータス</label>
              {editing ? (
                <select value={form.status ?? ""} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="approaching">📋 アプローチ中</option>
                  <option value="contracted">✅ 契約中</option>
                  <option value="delisted">📉 掲載落ち</option>
                </select>
              ) : (
                <p className="text-sm text-gray-900">{STATUS_LABELS[company.status]}</p>
              )}
            </div>

            {/* 採用ペルソナ */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">採用ペルソナ</label>
              {editing ? (
                <div className="flex flex-wrap gap-2">
                  {PERSONA_OPTIONS.map(p => (
                    <button key={p} type="button" onClick={() => togglePersona(p)} className={`px-3 py-1 rounded-full text-sm border transition-colors ${(form.persona ?? []).includes(p) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"}`}>{p}</button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-900">{company.persona.join(", ") || "-"}</p>
              )}
            </div>

            {/* 掲載媒体 */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">掲載媒体</label>
              {editing ? (
                <select value={form.media ?? ""} onChange={e => setForm(f => ({ ...f, media: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">選択してください</option>
                  {MEDIA_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <p className="text-sm text-gray-900">{company.media ?? "-"}</p>
              )}
            </div>

            {/* 応募数・入社数 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">応募数</label>
                {editing ? (
                  <input type="number" value={form.applyCount ?? 0} onChange={e => setForm(f => ({ ...f, applyCount: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                ) : (
                  <p className="text-sm text-gray-900">{company.applyCount}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">入社数</label>
                {editing ? (
                  <input type="number" value={form.hireCount ?? 0} onChange={e => setForm(f => ({ ...f, hireCount: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                ) : (
                  <p className="text-sm text-gray-900">{company.hireCount}</p>
                )}
              </div>
            </div>

            {/* 電話番号 */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">電話番号</label>
              {editing ? (
                <input type="text" value={form.phone ?? ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              ) : (
                <p className="text-sm text-gray-900">{company.phone ?? "-"}</p>
              )}
            </div>

            {/* 住所 */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">住所</label>
              {editing ? (
                <input type="text" value={form.address ?? ""} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              ) : (
                <p className="text-sm text-gray-900">{company.address ?? "-"}</p>
              )}
            </div>

            {/* 備考 */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">備考</label>
              {editing ? (
                <textarea value={form.memo ?? ""} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              ) : (
                <p className="text-sm text-gray-900 whitespace-pre-wrap">{company.memo ?? "-"}</p>
              )}
            </div>

            {/* 担当者 */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">担当者</label>
              <p className="text-sm text-gray-900">{company.user.name}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}