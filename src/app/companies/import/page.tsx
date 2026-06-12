"use client"

import { useState } from "react"

export default function ImportPage() {
  const [preview, setPreview] = useState<string[][]>([])
  const [fileName, setFileName] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: number; skip: number; error: number } | null>(null)
  const [error, setError] = useState("")

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResult(null)
    setError("")

    const reader = new FileReader()
    reader.onload = (ev) => {
      const buffer = ev.target?.result as ArrayBuffer
      // Shift-JIS デコード
      const decoder = new TextDecoder("shift-jis")
      const text = decoder.decode(buffer)
      const lines = text.split(/\r?\n/).filter(line => line.trim() && line.replace(/,/g, "").trim())
      const rows = lines.map(line => line.split(",").map(cell => cell.trim()))
      setPreview(rows)
    }
    reader.readAsArrayBuffer(file)
  }

  const handleImport = async () => {
    if (preview.length < 2) return
    setLoading(true)
    setError("")
    const dataRows = preview.slice(1) // ヘッダー除く
    const res = await fetch("/api/companies/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: dataRows }),
    })
    if (res.ok) {
      const data = await res.json()
      setResult(data)
      setPreview([])
      setFileName("")
    } else {
      setError("インポートに失敗しました")
    }
    setLoading(false)
  }

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
          <a href="/companies" className="flex items-center gap-2.5 px-5 py-2 text-sm text-white/45 hover:text-white/75 hover:bg-white/5 border-l-2 border-transparent">🏢 企業一覧</a>
          <a href="/companies/new" className="flex items-center gap-2.5 px-5 py-2 text-sm text-white/45 hover:text-white/75 hover:bg-white/5 border-l-2 border-transparent">➕ 企業追加</a>
          <a href="/companies/import" className="flex items-center gap-2.5 px-5 py-2 text-sm text-white border-l-2 border-[#378ADD] bg-[#378ADD]/10">📥 CSVインポート</a>
          <a href="/users" className="flex items-center gap-2.5 px-5 py-2 text-sm text-white/45 hover:text-white/75 hover:bg-white/5 border-l-2 border-transparent">👥 ユーザー管理</a>
        </nav>
        <div className="px-5 py-4 border-t border-white/10">
          <a href="/api/auth/signout" className="text-[10px] text-white/30 hover:text-white/60">ログアウト</a>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-5xl">
          <h1 className="text-xl font-bold text-gray-800 mb-6">📥 CSVインポート</h1>

          {result && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6">
              <h2 className="text-sm font-semibold text-green-800 mb-2">✅ インポート完了</h2>
              <p className="text-sm text-green-700">成功: <span className="font-bold">{result.success}件</span>　エラー: {result.error}件</p>
              <a href="/companies" className="mt-3 inline-block text-sm text-blue-600 hover:underline">企業一覧を見る →</a>
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">{error}</div>}

          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">CSVファイルを選択</h2>
            <p className="text-xs text-gray-400 mb-4">対応形式: Shift-JIS CSV（契約企業.csv形式）<br />列順: 企業ID, 企業名, プラン, 年間掲載費, 契約開始日, 契約終了日, 所在地, エリア, 営業担当</p>
            <input type="file" accept=".csv" onChange={handleFile} className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            {fileName && <p className="mt-2 text-xs text-gray-500">選択中: {fileName}</p>}
          </div>

          {preview.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-700">プレビュー（{preview.length - 1}件）</h2>
                <button onClick={handleImport} disabled={loading} className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {loading ? "インポート中..." : `📥 ${preview.length - 1}件をインポート`}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {preview[0].map((h, i) => <th key={i} className="text-left px-3 py-2 font-medium text-gray-500">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.slice(1, 6).map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => <td key={j} className="px-3 py-2 text-gray-700">{cell}</td>)}
                      </tr>
                    ))}
                    {preview.length > 6 && (
                      <tr><td colSpan={preview[0].length} className="px-3 py-2 text-gray-400 text-center">... 他 {preview.length - 6} 件</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}