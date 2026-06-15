"use client"
import Sidebar from "@/components/Sidebar"
import { useState, useEffect } from "react"

export default function ImportHearingPage() {
  const [preview, setPreview] = useState<string[][]>([])
  const [fileName, setFileName] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: number; skip: number; error: number; notFound: number } | null>(null)
  const [error, setError] = useState("")
  const [userName, setUserName] = useState("")

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
    const res = await fetch("/api/companies/import-hearing", {
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
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-5xl">
          <h1 className="text-xl font-bold text-gray-800 mb-2">📋 ヒアリングデータ インポート</h1>
          <p className="text-sm text-gray-500 mb-6">Googleフォームのヒアリングシートを企業IDで既存レコードにマージします</p>

          {result && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6">
              <h2 className="text-sm font-semibold text-green-800 mb-3">✅ インポート完了</h2>
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-white rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-600">{result.success}</div>
                  <div className="text-xs text-gray-500 mt-1">更新成功</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-gray-400">{result.skip}</div>
                  <div className="text-xs text-gray-500 mt-1">スキップ</div>
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
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">{error}</div>}

          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">CSVファイルを選択</h2>
            <p className="text-xs text-gray-400 mb-4">
              GoogleスプレッドシートからCSV（UTF-8）でダウンロードしてください<br />
              ファイル → ダウンロード → カンマ区切り形式（.csv）
            </p>
            <input type="file" accept=".csv" onChange={handleFile} className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            {fileName && <p className="mt-2 text-xs text-gray-500">選択中: {fileName}</p>}
          </div>

          {preview.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-700">プレビュー（{preview.length - 1}件）</h2>
                  <p className="text-xs text-gray-400 mt-0.5">企業IDで既存レコードを検索してマージします</p>
                </div>
                <button onClick={handleImport} disabled={loading} className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {loading ? "インポート中..." : `📋 ${preview.length - 1}件をマージ`}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {preview[0].slice(0, 10).map((h, i) => <th key={i} className="text-left px-3 py-2 font-medium text-gray-500 whitespace-nowrap">{h}</th>)}
                      <th className="text-left px-3 py-2 font-medium text-gray-500">...</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.slice(1, 6).map((row, i) => (
                      <tr key={i}>
                        {row.slice(0, 10).map((cell, j) => <td key={j} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-32 overflow-hidden text-ellipsis">{cell}</td>)}
                        <td className="px-3 py-2 text-gray-400">...</td>
                      </tr>
                    ))}
                    {preview.length > 6 && (
                      <tr><td colSpan={11} className="px-3 py-2 text-gray-400 text-center">... 他 {preview.length - 6} 件</td></tr>
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