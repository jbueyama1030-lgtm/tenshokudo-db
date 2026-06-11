"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

const PERSONA_OPTIONS = ["20代", "30代", "40代", "50代", "60代以上", "未経験歓迎", "経験者優遇"]
const MEDIA_OPTIONS = ["indeed+", "求人ボックス", "Ligla", "レコメンド", "Criteo", "その他"]

export default function NewCompanyPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: "",
    companyId: "",
    status: "approaching",
    persona: [] as string[],
    media: "",
    phone: "",
    address: "",
    memo: "",
  })

  const togglePersona = (p: string) => {
    setForm(f => ({
      ...f,
      persona: f.persona.includes(p)
        ? f.persona.filter(x => x !== p)
        : [...f.persona, p]
    }))
  }

  const handleSubmit = async () => {
    if (!form.name) return alert("会社名は必須です")
    setLoading(true)
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      router.push("/companies")
    } else {
      alert("エラーが発生しました")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">転職道 営業DB</h1>
          <a href="/companies" className="text-sm text-gray-600 hover:text-gray-900">← 企業一覧に戻る</a>
        </div>
      </header>

      <main className="p-6 max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">企業追加</h2>

        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">会社名 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例：〇〇タクシー株式会社"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">企業ID</label>
            <input
              type="text"
              value={form.companyId}
              onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例：1001"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ステータス</label>
            <select
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="approaching">📋 アプローチ中</option>
              <option value="contracted">✅ 契約中</option>
              <option value="delisted">📉 掲載落ち</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">採用ペルソナ</label>
            <div className="flex flex-wrap gap-2">
              {PERSONA_OPTIONS.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePersona(p)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    form.persona.includes(p)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">掲載媒体</label>
            <select
              value={form.media}
              onChange={e => setForm(f => ({ ...f, media: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">選択してください</option>
              {MEDIA_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
            <input
              type="text"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例：03-1234-5678"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">住所</label>
            <input
              type="text"
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例：東京都新宿区〇〇1-2-3"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
            <textarea
              value={form.memo}
              onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="自由記述"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "登録中..." : "企業を登録する"}
          </button>
        </div>
      </main>
    </div>
  )
}