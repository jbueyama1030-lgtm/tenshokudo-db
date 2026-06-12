"use client"
import Sidebar from "@/components/Sidebar"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

type User = { id: string; name: string }

export default function NewCompanyPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [userName, setUserName] = useState("")
  const [form, setForm] = useState({
    name: "",
    companyId: "",
    status: "approaching",
    userId: "",
    phone: "",
    address: "",
    media: "",
    memo: "",
    temperature: "",
    negotiationMemo: "",
    nextAction: "",
    nextActionDate: "",
    applyCount: 0,
    hireCount: 0,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/users").then(r => r.json()).then((data: User[]) => {
      setUsers(data)
      if (data.length > 0) setForm(f => ({ ...f, userId: data[0].id }))
    })
    fetch("/api/auth/session").then(r => r.json()).then(s => setUserName(s?.user?.name ?? ""))
  }, [])

  const handleSubmit = async () => {
    if (!form.name) { setError("企業名は必須です"); return }
    if (!form.userId) { setError("担当者を選択してください"); return }
    setLoading(true)
    setError("")
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const data = await res.json()
      router.push(`/companies/${data.id}`)
    } else {
      const data = await res.json()
      setError(data.error ?? "エラーが発生しました")
    }
    setLoading(false)
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />

      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-4xl">
          <div className="flex items-center gap-3 mb-6">
            <a href="/companies" className="text-sm text-gray-400 hover:text-gray-600">← 企業一覧</a>
            <span className="text-gray-300">/</span>
            <h1 className="text-xl font-bold text-gray-800">企業追加</h1>
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            {/* 基本情報 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 col-span-2">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">基本情報</h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">企業名 <span className="text-red-400">*</span></label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="例：株式会社〇〇運輸" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">企業ID</label>
                  <input value={form.companyId} onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="例：12345" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">ステータス</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="approaching">📋 アプローチ中</option>
                    <option value="contracted">✅ 契約中</option>
                    <option value="delisted">📉 掲載落ち</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">担当者 <span className="text-red-400">*</span></label>
                  <select value={form.userId} onChange={e => setForm(f => ({ ...f, userId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">電話番号</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="例：03-1234-5678" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">住所</label>
                  <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="例：東京都渋谷区〇〇" />
                </div>
              </div>
            </div>

            {/* 商談情報 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 col-span-2">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">商談情報</h2>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">温度感</label>
                  <select value={form.temperature} onChange={e => setForm(f => ({ ...f, temperature: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">未設定</option>
                    <option value="hot">🔥 ホット</option>
                    <option value="warm">☀️ ウォーム</option>
                    <option value="cold">❄️ コールド</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">次回アクション</label>
                  <input value={form.nextAction} onChange={e => setForm(f => ({ ...f, nextAction: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="例：資料送付" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">次回アクション日</label>
                  <input type="date" value={form.nextActionDate} onChange={e => setForm(f => ({ ...f, nextActionDate: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">商談メモ</label>
                <textarea value={form.negotiationMemo} onChange={e => setForm(f => ({ ...f, negotiationMemo: e.target.value }))} rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="商談の詳細を記録..." />
              </div>
            </div>

            {/* 採用情報 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">採用情報</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">応募数</label>
                  <input type="number" value={form.applyCount} onChange={e => setForm(f => ({ ...f, applyCount: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">入社数</label>
                  <input type="number" value={form.hireCount} onChange={e => setForm(f => ({ ...f, hireCount: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">掲載媒体</label>
                  <input value={form.media} onChange={e => setForm(f => ({ ...f, media: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="例：indeed" />
                </div>
              </div>
            </div>

            {/* メモ */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">メモ</h2>
              <textarea value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} rows={5} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="自由メモ..." />
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <a href="/companies" className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">キャンセル</a>
            <button onClick={handleSubmit} disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {loading ? "登録中..." : "✅ 登録する"}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}