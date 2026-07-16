"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"

type ImportResult = {
  success: number
  skip: number
  error: number
  shifted: number
  unmatched: number
}

// CSVを1行ずつ配列にパース（ダブルクォート対応の簡易パーサ）
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += c
      }
    } else {
      if (c === '"') inQuotes = true
      else if (c === ",") { cur.push(field); field = "" }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = "" }
      else if (c === "\r") { /* skip */ }
      else field += c
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur) }
  return rows
}

export default function ApplicationsImportPage() {
  const [userName, setUserName] = useState("")
  const [fileName, setFileName] = useState("")
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [previewCount, setPreviewCount] = useState(0)
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
    let text = new TextDecoder("utf-8").decode(buf)
    // BOM除去
    text = text.replace(/^\uFEFF/, "")
    // 文字化け判定（U+FFFD が多い場合は cp932 で読み直し）
    const badCount = (text.match(/\uFFFD/g) || []).length
    if (badCount > 5) {
      try {
        text = new TextDecoder("shift-jis").decode(buf).replace(/^\uFEFF/, "")
      } catch { /* shift-jis 未対応環境ならそのまま */ }
    }

    const parsed = parseCsv(text)
    if (parsed.length < 2) { setError("データ行が見つかりません"); return }

    const header = parsed[0].map(h => h.trim())
    const idx = (name: string) => header.indexOf(name)

    const iDate = idx("応募日")
    const iCompanyId = idx("企業ID")
    const iStatus = idx("ステータス")
    const iInflow = idx("流入")

    if (iDate < 0 || iCompanyId < 0 || iStatus < 0 || iInflow < 0) {
      setError("必要な列（応募日 / 企業ID / ステータス / 流入）が見つかりません。ヘッダーを確認してください。")
      return
    }

    const dataRows = parsed.slice(1)
      .filter(r => r.length > iDate && (r[iCompanyId]?.trim() || r[iDate]?.trim()))
      .map(r => ({
        appliedAt: (r[iDate] ?? "").trim(),
        companyId: (r[iCompanyId] ?? "").trim(),
        status: (r[iStatus] ?? "").trim(),
        inflow: (r[iInflow] ?? "").trim(),
      }))

    setRows(dataRows)
    setPreviewCount(dataRows.length)
  }

  const handleImport = async () => {
    if (rows.length === 0) return
    setLoading(true)
    setError("")
    setResult(null)

    const res = await fetch("/api/import/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    })

    if (res.ok) {
      setResult(await res.json())
    } else {
      const data = await res.json()
      setError(data.error ?? "取り込みに失敗しました")
    }
    setLoading(false)
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-3xl">
          <h1 className="text-xl font-bold text-gray-800 mb-2">応募明細インポート</h1>
          <p className="text-sm text-gray-500 mb-6">
            応募データのCSV（entry_〜.csv）を取り込みます。氏名・電話番号などの個人情報は保存されず、集計に必要な項目（応募日・企業ID・ステータス・流入）のみが取り込まれます。同じ応募は最新のステータスで自動更新されます。
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
                {previewCount > 0 && <span className="ml-2 text-gray-400">読み込み {previewCount} 件</span>}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">{error}</div>
          )}

          {/* 取り込みボタン */}
          {previewCount > 0 && !result && (
            <button
              onClick={handleImport}
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "取り込み中..." : previewCount + " 件を取り込む"}
            </button>
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
              {result.error > 0 && (
                <div className="mt-3 text-sm text-red-600">エラー: {result.error} 件</div>
              )}
              <div className="mt-4">
                <button onClick={() => { setResult(null); setRows([]); setPreviewCount(0); setFileName("") }} className="text-sm text-blue-600 hover:underline">
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