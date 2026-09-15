"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"

type ImportResult = {
  success: number
  skip: number
  error: number
  shifted: number
  unmatched: number
  deleted: number
}

export default function ApplicationsImportPage() {
  const [userName, setUserName] = useState("")
  const [fileName, setFileName] = useState("")
  const [csv, setCsv] = useState("")
  const [lineCount, setLineCount] = useState(0)
  const [skipGuard, setSkipGuard] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => setUserName(s?.user?.name ?? ""))
  }, [])

  const handleFile = async (file: File) => {
    setError("")
    setResult(null)
    setFileName(file.name)

    // まず UTF-8 で読み、文字化けらしき場合は Shift-JIS で読み直す
    const buf = await file.arrayBuffer()
    let text = new TextDecoder("utf-8").decode(buf).replace(/^\uFEFF/, "")
    const badCount = (text.match(/\uFFFD/g) || []).length
    if (badCount > 5) {
      try {
        text = new TextDecoder("shift-jis").decode(buf).replace(/^\uFEFF/, "")
      } catch { /* shift-jis 未対応環境ならそのまま */ }
    }

    const lines = text.split("\n").filter(l => l.trim() !== "").length
    if (lines < 2) { setError("データ行が見つかりません"); return }

    setCsv(text)
    setLineCount(lines - 1)
  }

  const handleImport = async () => {
    if (!csv) return
    setLoading(true)
    setError("")
    setResult(null)

    const res = await fetch("/api/import/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, skipGuard }),
    })

    const data = await res.json()
    if (res.ok) {
      setResult(data)
    } else {
      setError(data.error ?? "取り込みに失敗しました")
    }
    setLoading(false)
  }

  const reset = () => {
    setResult(null); setCsv(""); setLineCount(0); setFileName(""); setError(""); setSkipGuard(false)
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-3xl">
          <h1 className="text-xl font-bold text-gray-800 mb-2">応募明細インポート</h1>
          <p className="text-sm text-gray-500 mb-6">
            応募データのCSV（entry_〜.csv）を取り込みます。氏名・電話番号などの個人情報は保存されず、集計に必要な項目（応募日・企業ID・ステータス・流入）のみが取り込まれます。CSVに含まれる年月のデータは一度削除してから入れ直すため、ステータスの更新も反映されます。
          </p>

          {/* ファイル選択 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">CSVファイルを選択</label>
            <input
              type="file"
              accept=".csv"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700"
            />
            {fileName && (
              <div className="mt-4 text-sm text-gray-600">
                <span className="font-medium">{fileName}</span>
                {lineCount > 0 && <span className="ml-2 text-gray-400">読み込み {lineCount} 行</span>}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">
              {error}
              {!skipGuard && error.includes("大幅に減少") && (
                <div className="mt-3">
                  <label className="flex items-center gap-2 text-red-800">
                    <input type="checkbox" checked={skipGuard} onChange={e => setSkipGuard(e.target.checked)} />
                    <span>内容を確認したうえで、件数チェックを無視して取り込む</span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* 取り込みボタン */}
          {lineCount > 0 && !result && (
            <button
              onClick={handleImport}
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "取り込み中..." : lineCount + " 行を取り込む"}
            </button>
          )}

          {loading && (
            <p className="mt-3 text-sm text-gray-500">
              件数が多い場合は数分かかります。このページを閉じないでください。
            </p>
          )}

          {/* 結果 */}
          {result && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">取り込み結果</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-xs text-green-600 mb-1">取り込み成功</div>
                  <div className="text-2xl font-bold text-green-700">{result.success}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1">スキップ（データ不足）</div>
                  <div className="text-2xl font-bold text-gray-600">{result.skip}</div>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4">
                  <div className="text-xs text-yellow-700 mb-1">企業マスタ未登録</div>
                  <div className="text-2xl font-bold text-yellow-700">{result.unmatched}</div>
                  <div className="text-xs text-yellow-600 mt-1">※明細は保存されています</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-xs text-blue-600 mb-1">時刻調整（重複回避）</div>
                  <div className="text-2xl font-bold text-blue-700">{result.shifted}</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                洗い替えで削除した既存データ: {result.deleted} 件
              </div>
              {result.error > 0 && (
                <div className="mt-3 text-sm text-red-600">エラー: {result.error} 件</div>
              )}
              <div className="mt-4">
                <button onClick={reset} className="text-sm text-blue-600 hover:underline">
                  別のファイルを取り込む
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}