"use client"
import Sidebar from "@/components/Sidebar"
import { useState, useEffect } from "react"

export default function ImportMonthlyPage() {
  const [preview, setPreview] = useState<string[][]>([])
  const [fileName, setFileName] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: number; notFound: number; error: number; notFoundIds?: string[] } | null>(null)
  const [error, setError] = useState("")
  const [userName, setUserName] = useState("")
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => setUserName(s?.user?.name ?? ""))
  }, [])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResult(null)
    setError("")

    const reader = new FileReader()
    reader.onload = (ev) => {
      const buffer = ev.target?.result as ArrayBuffer
      const decoder = new TextDecoder("utf-8")
      const text = decoder.decode(buffer)

      const rows: string[][] = []
      let cur = ""
      let inQuote = false
      let currentRow: string[] = []

      for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (ch === '"') {
          inQuote = !inQuote
        } else if (ch === "," && !inQuote) {
          currentRow.push(cur)
          cur = ""
        } else if (ch === "\r" && text[i + 1] === "\n" && !inQuote) {
          i++
          currentRow.push(cur)
          cur = ""
          if (currentRow.some(c => c.trim())) rows.push(currentRow)
          currentRow = []
        } else if (ch === "\n" && !inQuote) {
          currentRow.push(cur)
          cur = ""
          if (currentRow.some(c => c.trim())) rows.push(currentRow)
          currentRow = []
        } else if (ch === "\r" && !inQuote) {
          // skip
        } else {
          cur += ch
        }
      }
      if (cur || currentRow.length > 0) {
        currentRow.push(cur)
        if (currentRow.some(c => c.trim())) rows.push(currentRow)
      }

      setPreview(rows)
    }
    reader.readAsArrayBuffer(file)
  }

  const handleImport = async () => {
    if (preview.length < 2) return
    setLoading(true)
    setError("")
    const dataRows = preview.slice(1)
    const res = await fetch("/api/companies/import-monthly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: dataRows, year, month }),
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
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-5xl">
          <h1 className="text-xl font-bold text-gray-800 mb-2">📈 月次データ インポート</h1>
          <p className="text-sm text-gray-500 mb-6">転職道管理画面からダウンロードした応募データを月次で集計してインポートします</p>

          {result && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6">
              <h2 className="text-sm font-semibold text-green-800 mb-3">✅ インポート完了</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-600">{result.success}</div>
                  <div className="text-xs text-gray-500 mt-1">企業更新成功</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-yellow-500">{result.notFound}</div>
                  <div className="text-xs text-gray-500 mt-1">企業未発見</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-red-500">{result.error}</div>
                  <div className="text-xs text-gray-500 mt-1">エラー</div>
                </div>
              </div>
              <a href="/companies" className="mt-4 inline-block text-sm text-blue-600 hover:underline">企業一覧を見る →</a>
              {result.notFoundIds && result.notFoundIds.length > 0 && (
                <div className="mt-4 bg-white rounded-lg p-3">
                  <div className="text-xs font-semibold text-gray-600 mb-2">
                    未発見だった企業ID（{result.notFoundIds.length}件）
                  </div>
                  <div className="text-xs text-gray-500 break-all leading-relaxed max-h-40 overflow-y-auto">
                    {result.notFoundIds.join(", ")}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">{error}</div>}

          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">対象年月を選択</h2>
            <div className="flex items-center gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">年</label>
                <select value={year} onChange={e => setYear(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}年</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">月</label>
                <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
                </select>
              </div>
              <div className="pt-4">
                <span className="text-sm text-gray-500">{year}年{month}月のデータとしてインポートします</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">CSVファイルを選択</h2>
            <p className="text-xs text-gray-400 mb-4">
              転職道管理画面 → 応募者一覧 → CSVダウンロード<br />
              列順: 応募日, 種別, 企業ID, 応募媒体, 企業開封, 氏名, ...流入(18列目)
            </p>
            <input type="file" accept=".csv" onChange={handleFile} className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            {fileName && <p className="mt-2 text-xs text-gray-500">選択中: {fileName}</p>}
          </div>

          {preview.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-700">プレビュー（{preview.length - 1}件）</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{year}年{month}月のデータとして企業IDで集計してインポートします</p>
                </div>
                <button onClick={handleImport} disabled={loading} className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {loading ? "インポート中..." : `📈 ${preview.length - 1}件をインポート`}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {preview[0].slice(0, 8).map((h, i) => <th key={i} className="text-left px-3 py-2 font-medium text-gray-500 whitespace-nowrap">{h}</th>)}
                      <th className="text-left px-3 py-2 font-medium text-gray-500">...</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.slice(1, 6).map((row, i) => (
                      <tr key={i}>
                        {row.slice(0, 8).map((cell, j) => <td key={j} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-32 overflow-hidden text-ellipsis">{cell}</td>)}
                        <td className="px-3 py-2 text-gray-400">...</td>
                      </tr>
                    ))}
                    {preview.length > 6 && (
                      <tr><td colSpan={9} className="px-3 py-2 text-gray-400 text-center">... 他 {preview.length - 6} 件</td></tr>
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