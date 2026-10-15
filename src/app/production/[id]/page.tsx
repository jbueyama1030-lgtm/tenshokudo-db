// 置き場所: src/app/production/[id]/page.tsx
"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { getRoles } from "@/lib/permissions"
import {
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  PRIORITY_LABELS,
  PRIORITY_OPTIONS,
  STATUS_LABELS,
  TYPE_LABELS,
  TYPE_OPTIONS,
  statusOptionsFor,
} from "@/lib/production"

type MonthlyRecord = {
  id: string
  year: number
  month: number
  applyCount: number
  hireCount: number
  inflowBreakdown: Record<string, number> | null
}
type Comment = { id: string; body: string; isSystem: boolean; createdAt: string; user: { id: string; name: string } | null }
type Person = { id: string; name: string }
type Task = {
  id: string
  name: string
  category: string
  type: string
  priority: string
  status: string
  memo: string | null
  dueDate: string | null
  publishedAt: string | null
  assigneeId: string | null
  requesterId: string | null
  statusChangedAt: string
  updatedAt: string
  assignee: Person | null
  subAssignees: Person[]
  requester: Person | null
  lastUpdatedBy: Person | null
  company: {
    id: string
    name: string
    companyId: string | null
    address: string | null
    websiteUrl: string | null
    adoptionChallenge: string | null
    shifts: string[]
    apps: string[]
    driverCount: number | null
    vehicleCount: number | null
    user: Person | null
    monthlyRecords: MonthlyRecord[]
  } | null
}
type UserLite = { id: string; name: string; isActive?: boolean; agencyId?: string | null }
type CompanyLite = { id: string; name: string; companyId: string | null }

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default function ProductionTaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [task, setTask] = useState<Task | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [userName, setUserName] = useState("")
  const [userId, setUserId] = useState("")
  const [roles, setRoles] = useState<string[]>([])
  const [users, setUsers] = useState<UserLite[]>([])
  const [companies, setCompanies] = useState<CompanyLite[]>([])
  const [memo, setMemo] = useState("")
  const [editing, setEditing] = useState(false)
  const [edit, setEdit] = useState({ name: "", category: "article", companyName: "", type: "new", priority: "medium", dueDate: "" })
  const [newComment, setNewComment] = useState("")
  const [saving, setSaving] = useState(false)
  const [posting, setPosting] = useState(false)
  const [err, setErr] = useState("")

  const load = async () => {
    const res = await fetch("/api/production-tasks/" + id)
    if (res.ok) {
      const data = await res.json()
      setTask(data)
      setMemo(data.memo ?? "")
    } else {
      setErr("案件を読み込めませんでした")
    }
  }
  const loadComments = async () => {
    const res = await fetch("/api/production-tasks/" + id + "/comments")
    if (res.ok) setComments(await res.json())
  }

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => {
      setUserName(s?.user?.name ?? "")
      setUserId(s?.user?.id ?? "")
      setRoles(getRoles(s))
    })
    fetch("/api/users").then(r => r.json()).then(d => {
      if (Array.isArray(d)) setUsers(d.filter((u: UserLite) => u.isActive !== false && !u.agencyId))
    })
    load()
    loadComments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true)
    setErr("")
    const res = await fetch("/api/production-tasks/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) {
      await load()
      await loadComments()
      return true
    }
    const data = await res.json().catch(() => null)
    setErr(data?.error ?? "更新に失敗しました")
    return false
  }

  const startEdit = () => {
    if (!task) return
    setEdit({
      name: task.name,
      category: task.category,
      companyName: task.company?.name ?? "",
      type: task.type === "other" ? "new" : task.type,
      priority: task.priority,
      dueDate: task.dueDate?.slice(0, 10) ?? "",
    })
    setEditing(true)
    if (companies.length === 0) {
      fetch("/api/companies").then(r => r.json()).then(d => {
        if (Array.isArray(d)) setCompanies(d.map((c: CompanyLite) => ({ id: c.id, name: c.name, companyId: c.companyId })))
      })
    }
  }

  const saveEdit = async () => {
    let companyId: string | null = null
    if (edit.companyName.trim()) {
      const hit = companies.find(c => c.name === edit.companyName.trim()) ?? (task?.company?.name === edit.companyName.trim() ? task.company : null)
      if (!hit) { setErr("企業は候補の中から選んでください"); return }
      companyId = hit.id
    }
    const ok = await patch({
      name: edit.name,
      category: edit.category,
      companyId,
      type: edit.type,
      priority: edit.priority,
      dueDate: edit.dueDate || null,
    })
    if (ok) setEditing(false)
  }

  const handlePostComment = async () => {
    if (!newComment.trim()) return
    setPosting(true)
    const res = await fetch("/api/production-tasks/" + id + "/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: newComment }),
    })
    if (res.ok) {
      setNewComment("")
      await loadComments()
    }
    setPosting(false)
  }

  const handleDelete = async () => {
    if (!confirm("この案件を削除しますか？")) return
    const res = await fetch("/api/production-tasks/" + id, { method: "DELETE" })
    if (res.ok) router.push("/production")
    else {
      const data = await res.json().catch(() => null)
      setErr(data?.error ?? "削除に失敗しました")
    }
  }

  if (!task) {
    return <div className="flex h-screen items-center justify-center text-gray-400">{err || "読み込み中..."}</div>
  }

  const isAdmin = roles.includes("admin")
  const isProduction = roles.includes("production")
  const isRequester = task.requesterId === userId
  const isAssignee = task.assigneeId === userId || task.subAssignees.some(u => u.id === userId)
  const isArticle = task.category === "article"
  const canComplete = isAdmin || isRequester || (!isArticle && isAssignee)
  const canDelete = isAdmin || isRequester
  const canAssign = isAdmin || isProduction || isRequester
  const statusOptions = statusOptionsFor(task.category)
  const subIds = task.subAssignees.map(u => u.id)

  const c = task.company
  const years = c ? [...new Set(c.monthlyRecords.map(r => r.year))].sort() : []
  const latestYear = years.length > 0 ? years[years.length - 1] : null
  const latestRecords = c ? c.monthlyRecords.filter(r => r.year === latestYear) : []

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-4xl">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <button type="button" onClick={() => router.push("/production")} className="text-sm text-gray-400 hover:text-gray-600">← 制作ダッシュボード</button>
            <span className="text-gray-300">/</span>
            <h1 className="text-xl font-bold text-gray-800">{task.name}</h1>
            <span className={"text-xs px-2 py-1 rounded-full font-medium " + (STATUS_LABELS[task.status]?.cls ?? "")}>
              {STATUS_LABELS[task.status]?.label ?? task.status}
            </span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">{CATEGORY_LABELS[task.category] ?? task.category}</span>
          </div>

          {err && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{err}</div>}

          {/* 案件情報 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">案件情報</h2>
              <div className="flex gap-3">
                {!editing && (isAdmin || isProduction || isRequester || isAssignee) && (
                  <button type="button" onClick={startEdit} className="text-xs text-blue-600 hover:underline">編集</button>
                )}
                {canDelete && <button type="button" onClick={handleDelete} className="text-xs text-red-500 hover:text-red-700">削除</button>}
              </div>
            </div>

            {editing ? (
              <div className="bg-blue-50 rounded-lg p-4 mb-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-3">
                    <label className="block text-xs text-gray-500 mb-1">案件名</label>
                    <input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">分類</label>
                    <select value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900">
                      {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">企業{edit.category === "article" ? "（必須）" : "（任意）"}</label>
                    <input list="detail-company-options" value={edit.companyName} onChange={e => setEdit({ ...edit, companyName: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900" placeholder="企業名を入力して候補から選択" />
                    <datalist id="detail-company-options">
                      {companies.map(co => <option key={co.id} value={co.name}>{co.companyId ?? ""}</option>)}
                    </datalist>
                  </div>
                  {edit.category === "article" && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">種別</label>
                      <select value={edit.type} onChange={e => setEdit({ ...edit, type: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900">
                        {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">優先度</label>
                    <select value={edit.priority} onChange={e => setEdit({ ...edit, priority: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900">
                      {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">納期</label>
                    <input type="date" value={edit.dueDate} onChange={e => setEdit({ ...edit, dueDate: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900" />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={saveEdit} disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">保存</button>
                  <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-white">キャンセル</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <div className="text-xs text-gray-400 mb-1">企業</div>
                  {c ? (
                    <button type="button" onClick={() => router.push("/companies/" + c.id)} className="text-sm text-blue-600 hover:underline text-left">{c.name}</button>
                  ) : <p className="text-sm text-gray-400">なし（社内タスク）</p>}
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">{isArticle ? "種別" : "分類"}</div>
                  <p className="text-sm text-gray-900">{isArticle ? (TYPE_LABELS[task.type] ?? task.type) : (CATEGORY_LABELS[task.category] ?? task.category)}</p>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">優先度</div>
                  <span className={"text-xs px-2 py-0.5 rounded-full font-medium " + (PRIORITY_LABELS[task.priority]?.cls ?? "")}>{PRIORITY_LABELS[task.priority]?.label ?? task.priority}</span>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">{isArticle ? "依頼営業" : "起票者"}</div>
                  <p className="text-sm text-gray-900">{task.requester?.name ?? "-"}</p>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">納期</div>
                  <p className="text-sm text-gray-900">{task.dueDate ? task.dueDate.slice(0, 10) : <span className="text-gray-400">未設定</span>}</p>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">公開日</div>
                  <p className="text-sm text-gray-900">{task.publishedAt ? task.publishedAt.slice(0, 10) : "-"}</p>
                </div>
              </div>
            )}

            <div className="border-t border-gray-100 pt-3 mb-4 text-xs text-gray-400">
              最終更新: {task.lastUpdatedBy?.name ?? "-"}
              <span className="ml-2 text-gray-300">{fmtDateTime(task.updatedAt)}</span>
              <span className="ml-3">今のステータスになって {Math.floor((Date.now() - new Date(task.statusChangedAt).getTime()) / 86400000)}日</span>
            </div>

            {/* ステータス */}
            <div className="border-t border-gray-100 pt-4 mb-4">
              <div className="text-xs text-gray-400 mb-2">ステータス</div>
              <div className="flex items-center gap-3">
                <select
                  value={task.status}
                  onChange={e => patch({ status: e.target.value })}
                  disabled={saving}
                  className={"border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium " + (STATUS_LABELS[task.status]?.cls ?? "text-gray-900")}
                >
                  {!statusOptions.includes(task.status) && <option value={task.status}>{STATUS_LABELS[task.status]?.label ?? task.status}</option>}
                  {statusOptions.map(s => (
                    <option key={s} value={s} disabled={s === "completed" && !canComplete}>
                      {STATUS_LABELS[s]?.label ?? s}{s === "completed" && !canComplete ? (isArticle ? "（依頼営業のみ）" : "（起票者・担当のみ）") : ""}
                    </option>
                  ))}
                </select>
                {saving && <span className="text-xs text-gray-400">保存中...</span>}
              </div>
            </div>

            {/* 担当 */}
            <div className="border-t border-gray-100 pt-4 mb-4">
              <div className="text-xs text-gray-400 mb-2">担当（メイン）</div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-gray-900">{task.assignee ? task.assignee.name : <span className="text-red-500">未割当</span>}</span>
                {(isAdmin || isProduction) && task.assigneeId !== userId && (
                  <button type="button" onClick={() => patch({ assigneeId: userId })} disabled={saving} className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50">
                    {task.assigneeId ? "自分に切り替える" : "この案件を担当する"}
                  </button>
                )}
                {canAssign && (
                  <select value={task.assigneeId ?? ""} onChange={e => patch({ assigneeId: e.target.value || null })} disabled={saving} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900">
                    <option value="">未割当にする</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                )}
              </div>

              <div className="text-xs text-gray-400 mt-4 mb-2">サブ担当</div>
              {canAssign ? (
                <div className="flex flex-wrap gap-1.5">
                  {users.filter(u => u.id !== task.assigneeId).map(u => {
                    const on = subIds.includes(u.id)
                    return (
                      <button key={u.id} type="button" disabled={saving}
                        onClick={() => patch({ subAssigneeIds: on ? subIds.filter(x => x !== u.id) : [...subIds, u.id] })}
                        className={"text-xs px-2.5 py-1 rounded-full border disabled:opacity-50 " + (on ? "bg-blue-100 text-blue-800 border-blue-300" : "bg-white text-gray-600 border-gray-200")}>
                        {u.name}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-900">{task.subAssignees.length > 0 ? task.subAssignees.map(u => u.name).join("・") : "-"}</p>
              )}
            </div>

            {/* メモ */}
            <div className="border-t border-gray-100 pt-4">
              <div className="text-xs text-gray-400 mb-2">依頼内容・メモ</div>
              <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
              <button type="button" onClick={() => patch({ memo })} disabled={saving} className="mt-2 text-sm border border-gray-300 rounded-lg px-4 py-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50">メモを保存</button>
            </div>
          </div>

          {/* コメント・履歴 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">💬 コメント・履歴（{comments.filter(x => !x.isSystem).length}件）</h2>
            {comments.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">まだ履歴がありません</p>
            ) : (
              <div className="space-y-3 mb-5">
                {comments.map(cm => cm.isSystem ? (
                  <div key={cm.id} className="flex items-center gap-2 text-xs text-gray-400 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                    <span>{cm.user?.name ?? "システム"}が{cm.body}</span>
                    <span className="text-gray-300">{fmtDateTime(cm.createdAt)}</span>
                  </div>
                ) : (
                  <div key={cm.id} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-700">{cm.user?.name ?? "不明"}</span>
                      <span className="text-xs text-gray-400">{fmtDateTime(cm.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{cm.body}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-gray-100 pt-4">
              <textarea value={newComment} onChange={e => setNewComment(e.target.value)} rows={2} placeholder="修正依頼や確認事項を記入（担当者・起票者に Chatwork で通知されます）" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
              <button type="button" onClick={handlePostComment} disabled={posting || !newComment.trim()} className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {posting ? "投稿中..." : "コメントする"}
              </button>
            </div>
          </div>

          {/* 企業の営業データ（参考） */}
          {c && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">🏢 企業の営業データ（参考・閲覧専用）</h2>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div><div className="text-xs text-gray-400 mb-1">企業名</div><p className="text-sm text-gray-900">{c.name}</p></div>
                <div><div className="text-xs text-gray-400 mb-1">所在地</div><p className="text-sm text-gray-900">{c.address ?? "-"}</p></div>
                <div><div className="text-xs text-gray-400 mb-1">営業担当</div><p className="text-sm text-gray-900">{c.user?.name ?? "-"}</p></div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">HP</div>
                  {c.websiteUrl ? (
                    <button type="button" onClick={() => window.open(c.websiteUrl!, "_blank", "noopener")} className="text-sm text-blue-600 hover:underline break-all text-left">{c.websiteUrl}</button>
                  ) : <p className="text-sm text-gray-400">-</p>}
                </div>
                <div><div className="text-xs text-gray-400 mb-1">保有車両数</div><p className="text-sm text-gray-900">{c.vehicleCount != null ? c.vehicleCount + "台" : "-"}</p></div>
                <div><div className="text-xs text-gray-400 mb-1">ドライバー数</div><p className="text-sm text-gray-900">{c.driverCount != null ? c.driverCount + "名" : "-"}</p></div>
              </div>
              <div className="border-t border-gray-100 pt-4 mb-4">
                <div className="text-xs text-gray-400 mb-1">採用課題</div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.adoptionChallenge || "-"}</p>
              </div>
              <div className="border-t border-gray-100 pt-4 mb-4 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-400 mb-1">募集勤務形態</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(c.shifts ?? []).length > 0 ? c.shifts.map(s => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{s}</span>) : <span className="text-sm text-gray-400">-</span>}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">導入アプリ</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(c.apps ?? []).length > 0 ? c.apps.map(a => <span key={a} className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">{a}</span>) : <span className="text-sm text-gray-400">-</span>}
                  </div>
                </div>
              </div>
              {latestRecords.length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="text-xs text-gray-400 mb-2">応募実績（{latestYear}年）</div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">月</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">応募数</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">入社数</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {latestRecords.map(r => (
                        <tr key={r.id}>
                          <td className="px-3 py-2 text-gray-900">{r.month}月</td>
                          <td className="px-3 py-2 text-right font-bold text-blue-600">{r.applyCount}</td>
                          <td className="px-3 py-2 text-right font-bold text-green-600">{r.hireCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
