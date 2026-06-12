"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"

type Company = {
  id: string
  companyId: string | null
  name: string
  status: string
  userId: string
  persona: string[]
  media: string | null
  phone: string | null
  address: string | null
  memo: string | null
  temperature: string | null
  negotiationMemo: string | null
  nextAction: string | null
  nextActionDate: string | null
  applyCount: number
  hireCount: number
  user: { id: string; name: string }
}

type User = { id: string; name: string }

const STATUS_LABELS: Record<string, string> = {
  contracted: "✅ 契約中",
  approaching: "📋 アプローチ中",
  delisted: "📉 掲載落ち",
}

const TEMP_LABELS: Record<string, { label: string; color: string }> = {
  hot: { label: "🔥 ホット", color: "bg-red-100 text-red-800" },
  warm: { label: "☀️ ウォーム", color: "bg-yellow-100 text-yellow-800" },
  cold: { label: "❄️ コールド", color: "bg-blue-100 text-blue-800" },
}

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [company, setCompany] = useState<Company | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Company>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`/api/companies/${id}`).then(r => r.json()).then(data => {
      setCompany(data)
      setForm(data)
    })
    fetch("/api/users").then(r => r.json()).then(setUsers)
  }, [id])

  const handleSave = async () => {
    setLoading(true)
    const res = await fetch(`/api/companies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const updated = await res.json()
      setCompany(updated)
      setEditing(false)
    }
    setLoading(false)
  }

  const handleDelete = async () => {
    if (!confirm("この企業を削除しますか？")) return
    await fetch(`/api/companies/${id}`, { method: "DELETE" })
    router.push("/companies")
  }

  if (!company) return <div className="flex h-screen items-center justify-center text-gray-400">読み込み中...</div>

  return (
    <div className="flex h-screen bg-gray-50">
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
          <a href="/users" className="flex items-center gap-2.5 px-5 py-2 text-sm text-white/45 hover:text-white/75 hover:bg-white/5 border-l-2 border-transparent">👥 ユーザー管理</a>
        </nav>
        <div className="px-5 py-4 border-t border-white/10">
          <a href="/api/auth/signout" className="text-[10px] text-white/30 hover:text-white/60">ログアウト</a>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-4xl">
          <div className="flex items-center gap-3 mb-6">
            <a href="/companies" className="text-sm text-gray-400 hover:text-gray-600">← 企業一覧</a>
            <span className="text-gray-300">/</span>
            <h1 className="text-xl font-bold text-gray-800">{company.name}</h1>
            {company.companyId && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">ID: {company.companyId}</span>}
          </div>

          <div className="flex gap-2 mb-6">
            {editing ? (
              <>
                <button onClick={handleSave} disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{loading ? "保存中..." : "💾 保存"}</button>
                <button onClick={() => { setEditing(false); setForm(company) }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">キャンセル</button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">✏️ 編集</button>
                <button onClick={handleDelete} className="px-4 py-2 text-sm border border-red-300 rounded-lg text-red-600 hover:bg-red-50">🗑️ 削除</button>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* 基本情報 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 col-span-2">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">基本情報</h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">企業名</label>
                  {editing ? <input value={form.name ?? ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /> : <p className="text-sm text-gray-900 font-medium">{company.name}</p>}
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">企業ID</label>
                  {editing ? <input value={form.companyId ?? ""} onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /> : <p className="text-sm text-gray-900">{company.companyId ?? "-"}</p>}
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">ステータス</label>
                  {editing ? (
                    <select value={form.status ?? ""} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      <option value="approaching">📋 アプローチ中</option>
                      <option value="contracted">✅ 契約中</option>
                      <option value="delisted">📉 掲載落ち</option>
                    </select>
                  ) : <p className="text-sm text-gray-900">{STATUS_LABELS[company.status] ?? company.status}</p>}
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">担当者</label>
                  {editing ? (
                    <select value={form.userId ?? ""} onChange={e => setForm(f => ({ ...f, userId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  ) : <p className="text-sm text-gray-900">{company.user.name}</p>}
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">電話番号</label>
                  {editing ? <input value={form.phone ?? ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /> : <p className="text-sm text-gray-900">{company.phone ?? "-"}</p>}
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">住所</label>
                  {editing ? <input value={form.address ?? ""} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /> : <p className="text-sm text-gray-900">{company.address ?? "-"}</p>}
                </div>
              </div>
            </div>

            {/* 商談情報 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 col-span-2">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">商談情報</h2>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">温度感</label>
                  {editing ? (
                    <select value={form.temperature ?? ""} onChange={e => setForm(f => ({ ...f, temperature: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      <option value="">未設定</option>
                      <option value="hot">🔥 ホット</option>
                      <option value="warm">☀️ ウォーム</option>
                      <option value="cold">❄️ コールド</option>
                    </select>
                  ) : (
                    <p className="text-sm">
                      {company.temperature ? (
                        <span className={"text-xs px-2 py-1 rounded-full font-medium " + (TEMP_LABELS[company.temperature]?.color ?? "")}>{TEMP_LABELS[company.temperature]?.label}</span>
                      ) : "-"}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">次回アクション</label>
                  {editing ? <input value={form.nextAction ?? ""} onChange={e => setForm(f => ({ ...f, nextAction: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="例：資料送付" /> : <p className="text-sm text-gray-900">{company.nextAction ?? "-"}</p>}
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">次回アクション日</label>
                  {editing ? <input type="date" value={form.nextActionDate ? form.nextActionDate.slice(0, 10) : ""} onChange={e => setForm(f => ({ ...f, nextActionDate: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /> : <p className="text-sm text-gray-900">{company.nextActionDate ? new Date(company.nextActionDate).toLocaleDateString("ja-JP") : "-"}</p>}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">商談メモ</label>
                {editing ? <textarea value={form.negotiationMemo ?? ""} onChange={e => setForm(f => ({ ...f, negotiationMemo: e.target.value }))} rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="商談の詳細を記録..." /> : <p className="text-sm text-gray-900 whitespace-pre-wrap">{company.negotiationMemo ?? "-"}</p>}
              </div>
            </div>

            {/* 採用情報 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">採用情報</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">応募数</label>
                  {editing ? <input type="number" value={form.applyCount ?? 0} onChange={e => setForm(f => ({ ...f, applyCount: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /> : <p className="text-2xl font-bold text-gray-900">{company.applyCount}</p>}
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">入社数</label>
                  {editing ? <input type="number" value={form.hireCount ?? 0} onChange={e => setForm(f => ({ ...f, hireCount: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /> : <p className="text-2xl font-bold text-green-600">{company.hireCount}</p>}
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">掲載媒体</label>
                  {editing ? <input value={form.media ?? ""} onChange={e => setForm(f => ({ ...f, media: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /> : <p className="text-sm text-gray-900">{company.media ?? "-"}</p>}
                </div>
              </div>
            </div>

            {/* メモ */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">メモ</h2>
              {editing ? <textarea value={form.memo ?? ""} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} rows={5} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /> : <p className="text-sm text-gray-900 whitespace-pre-wrap">{company.memo ?? "-"}</p>}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}