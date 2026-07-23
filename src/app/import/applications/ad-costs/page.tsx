"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"

type Summary = {
  totalRows: number
  directRows: number
  overheadRows: number
  totalAmount: number
  months: { year: number; month: number }[]
  unknownInflows: string[]
}
type RowError = { line: number; message: string }

function yen(n: number) {
  return "¥" + Number(n).toLocaleString("ja-JP")
}

export default function ImportAdCostsPage() {
  const [userName, setUserName] = useState("")
  const [csv, setCsv] = useState("")
  const [fileName, setFileName] = useState("")
  const [summary, setSummary] = useState<Summary | null>(null)
  const [errors, setErrors] = useState<RowError[]>([])
  const [checking, setChecking] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ deleted: number; created: number } | null>(null)
  const [apiError, setApiError] = useState("")

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => setUserName(s?.user?.name ?? ""))
  }, [])

  const handleFile = async (file: File) => {
    const text = await file.text()
    setCsv(text)
    setFileName(file.name)
    setSummary(null)
    setErrors([])
    setResult(null)
    setApiError("")
  }

  const check = async () => {
    if (!csv) return
    setChecking(true)
    setApiError("")
    setResult(null)
    const res = await fetch("/api/import/ad-costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, dryRun: true }),
    })
    const d = await res.json()
    setChecking(false)
    if (res.ok) {
      setSummary(d.summary)
      setErrors(d.errors ?? [])
    } else {
      setApiError(d.error ?? "確認に失敗しました")
    }
  }

  const runImport = async () => {
    if (!csv || !summary) return
    if (!confirm(
      summary.months.length + "ヶ月分の広告費を洗い替えします。\n" +
      "対象月の既存データは削除されます。実行しますか？"
    )) return
    setImporting(true)
    setApiError("")
    const res = await fetch("/api/import/ad-costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, dryRun: false }),
    })
    const d = await res.json()
    setImporting(false)
    if (res.ok) {
      setResult({ deleted: d.deleted, created: d.created })
    } else {
      setApiError(d.error ?? "取り込みに失敗しました")
      if (d.errors) setErrors(d.errors)
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-4xl">
          <div className="text-xs text-gray-400 mb-1">マーケティング分析</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">広告費インポート</h1>
          <p className="text-sm text-gray-500 mb-6">
            CSVに含まれる月の広告費を洗い替えします（対象月の既存データを削除してから登録）。
            列は year, month, name, category, inflow, totalCost, memo です。
            category は direct（媒体直課）か overhead（配賦対象外）、overhead の inflow は空にしてください。
          </p>

          {apiError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">{apiError}</div>
          )}

          {/* ファイル選択 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <div className="text-xs font-medium text-gray-600 mb-3">1. CSVファイルを選択</div>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              className="text-sm text-gray-700"
            />
            {fileName && (
              <div className="mt-3 text-sm text-gray-600">
                選択中: <span className="font-medium text-gray-900">{fileName}</span>
              </div>
            )}
            {csv && (
              <button
                onClick={check}
                disabled={checking}
                className="mt-4 bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {checking ? "確認中..." : "内容を確認する"}
              </button>
            )}
          </div>

          {/* 確認結果 */}
          {summary && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <div className="text-xs font-medium text-gray-600 mb-3">2. 内容の確認</div>

              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">総行数</div>
                  <div className="text-xl font-bold text-gray-900">{summary.totalRows}</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="text-xs text-blue-500 mb-1">媒体直課</div>
                  <div className="text-xl font-bold text-blue-700">{summary.directRows}</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-3">
                  <div className="text-xs text-orange-500 mb-1">配賦対象外</div>
                  <div className="text-xl font-bold text-orange-700">{summary.overheadRows}</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <div className="text-xs text-green-500 mb-1">合計金額</div>
                  <div className="text-lg font-bold text-green-700">{yen(summary.totalAmount)}</div>
                </div>
              </div>

              <div className="mb-4">
                <div className="text-xs text-gray-400 mb-2">対象月（{summary.months.length}ヶ月／この月のデータが洗い替えられます）</div>
                <div className="flex flex-wrap gap-1.5">
                  {summary.months.map(m => (
                    <span key={m.year + "-" + m.month} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                      {m.year}年{m.month}月
                    </span>
                  ))}
                </div>
              </div>

              {summary.unknownInflows.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                  <div className="text-xs font-medium text-yellow-800 mb-1">
                    応募実績のない流入元が {summary.unknownInflows.length} 件あります（取り込みは可能です）
                  </div>
                  <div className="text-xs text-yellow-700">
                    {summary.unknownInflows.join(" / ")}
                  </div>
                  <div className="text-xs text-yellow-600 mt-1">
                    応募が無くても費用が発生する場合はそのままで問題ありません。表記ゆれの場合は修正してください。
                  </div>
                </div>
              )}

              {errors.length > 0 ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="text-xs font-medium text-red-800 mb-2">エラー {errors.length} 件（修正しないと取り込めません）</div>
                  <div className="max-h-48 overflow-y-auto">
                    {errors.map((e, i) => (
                      <div key={i} className="text-xs text-red-700 mb-0.5">
                        {e.line}行目: {e.message}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={runImport}
                    disabled={importing}
                    className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {importing ? "取り込み中..." : "この内容で取り込む"}
                  </button>
                  <span className="text-xs text-gray-400">エラーはありません</span>
                </div>
              )}
            </div>
          )}

          {/* 結果 */}
          {result && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-5">
              <div className="text-sm font-medium text-green-800 mb-2">✅ 取り込みが完了しました</div>
              <div className="text-sm text-green-700">
                既存 {result.deleted} 件を削除し、{result.created} 件を登録しました。
              </div>
              <a href="/marketing" className="inline-block mt-3 text-sm text-blue-600 hover:underline">
                媒体歩留まりダッシュボードで確認する →
              </a>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}