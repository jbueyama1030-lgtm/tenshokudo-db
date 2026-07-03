"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"

type MonthlyRecord = {
  id: string
  year: number
  month: number
  applyCount: number
  hireCount: number
  inflowBreakdown: Record<string, number> | null
}

type Task = {
  id: string
  name: string
  type: string
  priority: string
  status: string
  memo: string | null
  dueDate: string | null
  assigneeId: string | null
  assignee: { id: string; name: string } | null
  requester: { id: string; name: string } | null
  company: {
    id: string
    name: string
    companyId: string | null
    address: string | null
    websiteUrl: string | null
    adoptionChallenge: string | null
    shifts: string[]
    apps: string[]
    dispatchRatio: string | null
    driverCount: number | null
    vehicleCount: number | null
    annualHiringTarget: number | null
    workplaceCertLevel: number
    user: { id: string; name: string } | null
    monthlyRecords: MonthlyRecord[]
  } | null
}

const TYPE_LABELS: Record<string, string> = { new: "新規", revise: "修正", renewal: "リニューアル" }
const PRIORITY_LABELS: Record<string, { label: string; cls: string }> = {
  high: { label: "高", cls: "bg-red-100 text-red-700" },
  medium: { label: "中", cls: "bg-yellow-100 text-yellow-700" },
  low: { label: "低", cls: "bg-gray-100 text-gray-600" },
}
const STATUS_OPTIONS = [
  { value: "not_started", label: "未着手" },
  { value: "in_progress", label: "着手" },
  { value: "sales_review", label: "営業確認中" },
  { value: "client_review", label: "企業確認中" },
  { value: "published", label: "公開" },
  { value: "paused", label: "一時停止中" },
  { value: "stopped", label: "停止処理済み" },
]
const STATUS_CLS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-100 text-blue-700",
  sales_review: "bg-purple-100 text-purple-700",
  client_review: "bg-indigo-100 text-indigo-700",
  published: "bg-green-100 text-green-700",
  paused: "bg-orange-100 text-orange-700",
  stopped: "bg-gray-200 text-gray-500",
}

function fmt(n: number | null | undefined) {
  if (n == null) return "-"
  return Number(n).toLocaleString("ja-JP")
}

export default function ProductionTaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [task, setTask] = useState<Task | null>(null)
  const [userName, setUserName] = useState("")
  const [userId, setUserId] = useState("")
  const [memo, setMemo] = useState("")
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const res = await fetch("/api/production-tasks/" + id)
    if (res.ok) {
      const data = await res.json()
      setTask(data)
      setMemo(data.memo ?? "")
    }
  }

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => {
      setUserName(s?.user?.name ?? "")
      setUserId(s?.user?.id ?? "")
    })
    load()
  }, [id])

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true)
    const res = await fetch("/api/production-tasks/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (res.ok) await load()
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!confirm("この案件を削除しますか？")) return
    await fetch("/api/production-tasks/" + id, { method: "DELETE" })
    router.push("/production")
  }

  if (!task) return <div className="flex h-screen items-center justify-center text-gray-400">読み込み中...</div>

  const c = task.company
  const years = c ? [...new Set(c.monthlyRecords.map(r => r.year))].sort() : []
  const latestYear = years.length > 0 ? years[years.length - 1] : null
  const latestRecords = c ? c.monthlyRecords.filter(r => r.year === latestYear) : []

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-4xl">
          <div className="flex items-center gap-3 mb-4">
            <a href="/production" className="text-sm text-gray-400 hover:text-gray-600">← 制作ダッシュボード</a>
            <span className="text-gray-300">/</span>
            <h1 className="text-xl font-bold text-gray-800">{task.name}</h1>
          </div>

          {/* 案件情報＋操作 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">案件情報</h2>
              <button onClick={handleDelete} className="text-xs text-red-500 hover:text-red-700">🗑️ 削除</button>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <div className="text-xs text-gray-400 mb-1">企業</div>
                {c ? <a href={"/companies/" + c.id} className="text-sm text-blue-600 hover:underline">{c.name}</a> : <p className="text-sm text-gray-400">-</p>}
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">種別</div>
                <p className="text-sm text-gray-900">{TYPE_LABELS[task.type] ?? task.type}</p>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">優先度</div>
                <span className={"text-xs px-2 py-0.5 rounded-full font-medium " + (PRIORITY_LABELS[task.priority]?.cls ?? "")}>{PRIORITY_LABELS[task.priority]?.label ?? task.priority}</span>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">依頼営業</div>
                <p className="text-sm text-gray-900">{task.requester?.name ?? "-"}</p>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">納期</div>
                <p className="text-sm text-gray-900">{task.dueDate ? task.dueDate.slice(0, 10) : "-"}</p>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">制作担当</div>
                <p className="text-sm text-gray-900">{task.assignee ? task.assignee.name : <span className="text-gray-400">未割当</span>}</p>
              </div>
            </div>

            {/* ステータス変更 */}
            <div className="border-t border-gray-100 pt-4 mb-4">
              <div className="text-xs text-gray-400 mb-2">ステータス</div>
              <div className="flex items-center gap-3">
                <select
                  value={task.status}
                  onChange={e => patch({ status: e.target.value })}
                  disabled={saving}
                  className={"border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium " + (STATUS_CLS[task.status] ?? "text-gray-900")}
                >
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {saving && <span className="text-xs text-gray-400">保存中...</span>}
              </div>
            </div>

            {/* 担当取得／解除 */}
            <div className="border-t border-gray-100 pt-4 mb-4">
              <div className="text-xs text-gray-400 mb-2">担当</div>
              {task.assigneeId === userId ? (
                <button onClick={() => patch({ assigneeId: null })} disabled={saving} className="text-sm border border-gray-300 rounded-lg px-4 py-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50">担当を外す</button>
              ) : task.assigneeId ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">{task.assignee?.name} が担当中</span>
                  <button onClick={() => patch({ assigneeId: userId })} disabled={saving} className="text-sm border border-blue-300 rounded-lg px-4 py-2 text-blue-600 hover:bg-blue-50 disabled:opacity-50">自分に切り替える</button>
                </div>
              ) : (
                <button onClick={() => patch({ assigneeId: userId })} disabled={saving} className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">＋ この案件を担当する</button>
              )}
            </div>

            {/* メモ編集 */}
            <div className="border-t border-gray-100 pt-4">
              <div className="text-xs text-gray-400 mb-2">メモ・依頼内容</div>
              <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
              <button onClick={() => patch({ memo })} disabled={saving} className="mt-2 text-sm border border-gray-300 rounded-lg px-4 py-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50">メモを保存</button>
            </div>
          </div>

          {/* 紐付く企業の営業データ（閲覧専用） */}
          {c && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">🏢 企業の営業データ（参考・閲覧専用）</h2>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <div className="text-xs text-gray-400 mb-1">企業名</div>
                  <p className="text-sm text-gray-900">{c.name}</p>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">所在地</div>
                  <p className="text-sm text-gray-900">{c.address ?? "-"}</p>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">営業担当</div>
                  <p className="text-sm text-gray-900">{c.user?.name ?? "-"}</p>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">HP</div>
                  {c.websiteUrl ? <a href={c.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline break-all">{c.websiteUrl}</a> : <p className="text-sm text-gray-400">-</p>}
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">保有車両数</div>
                  <p className="text-sm text-gray-900">{c.vehicleCount != null ? c.vehicleCount + "台" : "-"}</p>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">ドライバー数</div>
                  <p className="text-sm text-gray-900">{c.driverCount != null ? c.driverCount + "名" : "-"}</p>
                </div>
              </div>

              {/* 採用課題 */}
              <div className="border-t border-gray-100 pt-4 mb-4">
                <div className="text-xs text-gray-400 mb-1">採用課題</div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.adoptionChallenge || "-"}</p>
              </div>

              {/* 募集条件 */}
              <div className="border-t border-gray-100 pt-4 mb-4 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-400 mb-1">募集勤務形態</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(c.shifts ?? []).length > 0 ? (c.shifts ?? []).map(s => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{s}</span>) : <span className="text-sm text-gray-400">-</span>}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">導入アプリ</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(c.apps ?? []).length > 0 ? (c.apps ?? []).map(a => <span key={a} className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">{a}</span>) : <span className="text-sm text-gray-400">-</span>}
                  </div>
                </div>
              </div>

              {/* 直近の応募実績 */}
              {latestRecords.length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="text-xs text-gray-400 mb-2">応募実績（{latestYear}年）</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">月</th>
                          <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">応募数</th>
                          <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">入社数</th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">流入元内訳</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {latestRecords.map(r => (
                          <tr key={r.id}>
                            <td className="px-3 py-2 text-gray-900 font-medium">{r.month}月</td>
                            <td className="px-3 py-2 text-right font-bold text-blue-600">{r.applyCount}</td>
                            <td className="px-3 py-2 text-right font-bold text-green-600">{r.hireCount}</td>
                            <td className="px-3 py-2">
                              {r.inflowBreakdown && (
                                <div className="flex flex-wrap gap-1">
                                  {Object.entries(r.inflowBreakdown).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                                    <span key={k} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{k}: {v}</span>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}