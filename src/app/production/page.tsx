"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"

type Task = {
  id: string
  name: string
  type: string
  priority: string
  status: string
  memo: string | null
  dueDate: string | null
  company: { id: string; name: string; companyId: string | null } | null
  assignee: { id: string; name: string } | null
  requester: { id: string; name: string } | null
  createdAt: string
}

const TYPE_LABELS: Record<string, string> = { new: "新規", revise: "修正", renewal: "リニューアル" }
const PRIORITY_LABELS: Record<string, { label: string; cls: string }> = {
  high: { label: "高", cls: "bg-red-100 text-red-700" },
  medium: { label: "中", cls: "bg-yellow-100 text-yellow-700" },
  low: { label: "低", cls: "bg-gray-100 text-gray-600" },
}
const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  not_started: { label: "未着手", cls: "bg-gray-100 text-gray-600" },
  in_progress: { label: "着手", cls: "bg-blue-100 text-blue-700" },
  sales_review: { label: "営業確認中", cls: "bg-purple-100 text-purple-700" },
  client_review: { label: "企業確認中", cls: "bg-indigo-100 text-indigo-700" },
  published: { label: "公開", cls: "bg-green-100 text-green-700" },
  paused: { label: "一時停止中", cls: "bg-orange-100 text-orange-700" },
  stopped: { label: "停止処理済み", cls: "bg-gray-200 text-gray-500" },
}

function TaskTable({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return <p className="text-sm text-gray-400 py-6 text-center">案件がありません</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">案件名</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">企業</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">種別</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">優先度</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">ステータス</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">依頼営業</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">納期</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {tasks.map(t => (
            <tr key={t.id} className="hover:bg-gray-50">
              <td className="px-3 py-2">
                <a href={"/production/" + t.id} className="text-gray-900 font-medium hover:text-blue-600 hover:underline">{t.name}</a>
                {t.memo && <div className="text-xs text-gray-400 mt-0.5 whitespace-pre-wrap">{t.memo}</div>}
              </td>
              <td className="px-3 py-2 text-gray-600">{t.company?.name ?? "-"}</td>
              <td className="px-3 py-2 text-gray-600">{TYPE_LABELS[t.type] ?? t.type}</td>
              <td className="px-3 py-2">
                <span className={"text-xs px-2 py-0.5 rounded-full font-medium " + (PRIORITY_LABELS[t.priority]?.cls ?? "")}>{PRIORITY_LABELS[t.priority]?.label ?? t.priority}</span>
              </td>
              <td className="px-3 py-2">
                <span className={"text-xs px-2 py-0.5 rounded-full font-medium " + (STATUS_LABELS[t.status]?.cls ?? "")}>{STATUS_LABELS[t.status]?.label ?? t.status}</span>
              </td>
              <td className="px-3 py-2 text-gray-600">{t.requester?.name ?? "-"}</td>
              <td className="px-3 py-2 text-gray-600">{t.dueDate ? t.dueDate.slice(0, 10) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ProductionDashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [userName, setUserName] = useState("")
  const [userId, setUserId] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => {
      setUserName(s?.user?.name ?? "")
      setUserId(s?.user?.id ?? "")
    })
    fetch("/api/production-tasks").then(r => r.json()).then(data => {
      setTasks(Array.isArray(data) ? data : [])
      setLoading(false)
    })
  }, [])

  // 未割当（assigneeなし）と、自分が担当の案件に振り分け
  const unassigned = tasks.filter(t => !t.assignee)
  const mine = tasks.filter(t => t.assignee && t.assignee.id === userId)

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-6xl">
          <h1 className="text-xl font-bold text-gray-800 mb-2">🎨 制作ダッシュボード</h1>
          <p className="text-sm text-gray-500 mb-6">未割当の案件を確認して担当を取得、自分の案件の進捗を管理します</p>

          {loading ? (
            <div className="text-gray-400 text-sm py-12 text-center">読み込み中...</div>
          ) : (
            <div className="space-y-6">
              {/* 未割当 */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-sm font-semibold text-gray-700">📥 未割当の案件</h2>
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">{unassigned.length}</span>
                </div>
                <TaskTable tasks={unassigned} />
              </div>

              {/* 自分の担当 */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-sm font-semibold text-gray-700">👤 自分が担当の案件</h2>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{mine.length}</span>
                </div>
                <TaskTable tasks={mine} />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}