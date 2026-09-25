"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"

type Result = {
  ok: boolean
  guardMessage?: string
  error?: string
  total: number
  created: number
  changed: number
  unchanged: number
  delisted: number
  snapshots: number
  unmatchedIds: string[]
  errors: string[]
}

export default function ImportArticlesPage() {
  const [userName, setUserName] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [force, setForce] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => setUserName(s?.user?.name ?? ""))
  }, [])

  const handleImport = async () => {
    if (!file) return
    setLoading(true)
    setError("")
    setResult(null)
    const res = await fetch("/api/import/articles" + (force ? "?force=1" : ""), {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: await file.arrayBuffer(),
    })
    const data = await res.json().catch(() => null)
    if (!data) {
      setError("取り込みに失敗しました")
    } else if (data.error) {
      setError(data.error)
    } else {
      setResult(data)
      if (data.ok) setForce(false)
    }
    setLoading(false)
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-3xl">
          <h1 className="text-xl font-bold text-gray-800 mb-1">記事インポート</h1>
          <p className="text-sm text-gray-500 mb-6">
            転職道の管理画面から出力した記事一覧CSVを取り込みます。企業IDごとに最新の内容で上書きし、内容が変わった記事は履歴を残します。
          </p>

          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={e => { setFile(e.target.files?.[0] ?? null); setResult(null); setError("") }}
              className="block w-full text-sm text-gray-700 mb-4"
            />
            {result && !result.ok && result.total > 0 && (
              <label className="flex items-center gap-2 text-sm text-gray-700 mb-4">
                <input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} className="w-4 h-4" />
                件数の確認を無視して取り込む
              </label>
            )}
            <button
              type="button"
              onClick={handleImport}
              disabled={!file || loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "取り込み中..." : "取り込む"}
            </button>
          </div>

          {error && <div className="bg-white rounded-xl border border-rose-200 p-4 text-sm text-rose-700 mb-4">{error}</div>}

          {result && !result.ok && (
            <div className="bg-white rounded-xl border border-amber-200 p-4 text-sm text-amber-800 mb-4">
              {result.guardMessage}
            </div>
          )}

          {result && result.ok && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">取り込み結果</h2>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: "CSVの記事", value: result.total },
                  { label: "新規", value: result.created },
                  { label: "内容の変更あり", value: result.changed },
                  { label: "変更なし", value: result.unchanged },
                  { label: "掲載終了（CSVに無し）", value: result.delisted },
                  { label: "履歴に保存", value: result.snapshots },
                ].map(c => (
                  <div key={c.label} className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-400">{c.label}</div>
                    <div className="text-xl font-bold text-gray-900">{c.value}</div>
                  </div>
                ))}
              </div>
              {result.unmatchedIds.length > 0 && (
                <div className="text-xs text-gray-600 mb-2">
                  <div className="font-medium mb-1">DBに企業が無い企業ID（{result.unmatchedIds.length}件）</div>
                  <p className="text-gray-400 mb-1">記事は保存済みです。企業を登録してから再度取り込むと紐づきます。</p>
                  <div className="bg-gray-50 rounded p-2 break-all">{result.unmatchedIds.join(", ")}</div>
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="text-xs text-rose-600">
                  <div className="font-medium mb-1">スキップした行（{result.errors.length}件）</div>
                  <ul className="list-disc pl-4">{result.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
