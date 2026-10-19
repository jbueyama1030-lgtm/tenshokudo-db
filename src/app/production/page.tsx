// 置き場所: src/app/production/page.tsx
"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  BOARD_COLUMNS,
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  FINISHED_STATUSES,
  PRIORITY_LABELS,
  PRIORITY_OPTIONS,
  STATUS_LABELS,
  TYPE_LABELS,
  TYPE_OPTIONS,
  waitingFor,
} from "@/lib/production"

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
  statusChangedAt: string
  updatedAt: string
  createdAt: string
  company: { id: string; name: string; companyId: string | null } | null
  assignee: Person | null
  subAssignees: Person[]
  requester: Person | null
}
type UserLite = { id: string; name: string; isActive?: boolean; agencyId?: string | null }
type CompanyLite = { id: string; name: string; companyId: string | null }

/** 同じステータスで止まっていたら警告する日数 */
const STALE_DAYS = 5
/** 「公開・完了」列に出す期間（日） */
const DONE_SHOW_DAYS = 30

type AlertKey = "overdue" | "thisWeek" | "unassigned" | "stale"
type ColumnKey = (typeof BOARD_COLUMNS)[number]["key"]

/**
 * カードを列にドロップしたときの移動先ステータス。
 * - status: null なら何もしない（同じ列）
 * - error: その列に移せない理由（社内タスクを企業確認・公開待ちに落とした場合など）
 * 記事制作の「完了」は、公開済みカードの「完了にする」ボタンで行う
 */
function targetStatus(t: { category: string; status: string }, col: ColumnKey): { status: string | null; error?: string } {
  const isArticle = t.category === "article"
  const current = BOARD_COLUMNS.find(c => (c.statuses as readonly string[]).includes(t.status))?.key
  if (current === col) return { status: null }
  switch (col) {
    case "todo": return { status: "not_started" }
    case "doing": return { status: "in_progress" }
    case "sales": return { status: isArticle ? "sales_review" : "submitted" }
    case "client":
      return isArticle ? { status: "client_review" } : { status: null, error: "企業確認の列は記事制作だけで使います" }
    case "publish":
      return isArticle ? { status: "awaiting_publish" } : { status: null, error: "公開待ちの列は記事制作だけで使います" }
    case "done": return { status: isArticle ? "published" : "completed" }
  }
  return { status: null }
}

const DAY = 86400000
function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY)
}
function dueInfo(t: Task): { text: string; cls: string } | null {
  if (!t.dueDate || FINISHED_STATUSES.includes(t.status)) return null
  const due = new Date(t.dueDate.slice(0, 10) + "T00:00:00").getTime()
  const diff = Math.round((due - startOfToday()) / DAY)
  const label = t.dueDate.slice(5, 10).replace("-", "/")
  if (diff < 0) return { text: "納期 " + label + " 切れ", cls: "text-red-600 font-medium" }
  if (diff <= 7) return { text: "納期 " + label + "（あと" + diff + "日）", cls: "text-amber-600" }
  return { text: "納期 " + label, cls: "text-gray-500" }
}

export default function ProductionDashboardPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState("")
  const [userId, setUserId] = useState("")
  const [isAdminUser, setIsAdminUser] = useState(false)
  const [onlyMine, setOnlyMine] = useState(false)
  const [category, setCategory] = useState("")
  const [alertFilter, setAlertFilter] = useState<AlertKey | "">("")
  const [showArchive, setShowArchive] = useState(false)
  // ドラッグ＆ドロップ
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<ColumnKey | null>(null)
  const [moveErr, setMoveErr] = useState("")

  // 新規タスク
  const [creating, setCreating] = useState(false)
  const [users, setUsers] = useState<UserLite[]>([])
  const [companies, setCompanies] = useState<CompanyLite[]>([])
  const [form, setForm] = useState({
    category: "article", name: "", companyName: "", type: "new", priority: "medium",
    dueDate: "", assigneeId: "", subAssigneeIds: [] as string[], memo: "",
  })
  const [formErr, setFormErr] = useState("")
  const [saving, setSaving] = useState(false)

  const loadTasks = async () => {
    const res = await fetch("/api/production-tasks")
    const data = await res.json().catch(() => [])
    setTasks(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => {
      setUserName(s?.user?.name ?? "")
      setUserId(s?.user?.id ?? "")
      const roles: string[] = Array.isArray(s?.user?.roles) && s.user.roles.length > 0 ? s.user.roles : s?.user?.role ? [s.user.role] : []
      setIsAdminUser(roles.includes("admin"))
    })
    loadTasks()
  }, [])

  const openCreate = async () => {
    setCreating(true)
    setFormErr("")
    if (users.length === 0) {
      fetch("/api/users").then(r => r.json()).then(d => {
        if (Array.isArray(d)) setUsers(d.filter((u: UserLite) => u.isActive !== false && !u.agencyId))
      })
    }
    if (companies.length === 0) {
      fetch("/api/companies").then(r => r.json()).then(d => {
        if (Array.isArray(d)) setCompanies(d.map((c: CompanyLite) => ({ id: c.id, name: c.name, companyId: c.companyId })))
      })
    }
  }

  const submitCreate = async () => {
    setFormErr("")
    if (!form.name.trim()) { setFormErr("案件名を入力してください"); return }
    let companyId: string | null = null
    if (form.companyName.trim()) {
      const hit = companies.find(c => c.name === form.companyName.trim())
      if (!hit) { setFormErr("企業は候補の中から選んでください"); return }
      companyId = hit.id
    }
    if (form.category === "article" && !companyId) { setFormErr("記事制作は企業を選んでください"); return }
    setSaving(true)
    const res = await fetch("/api/production-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: form.category,
        name: form.name,
        companyId,
        type: form.type,
        priority: form.priority,
        dueDate: form.dueDate || null,
        assigneeId: form.assigneeId || null,
        subAssigneeIds: form.subAssigneeIds.filter(x => x !== form.assigneeId),
        memo: form.memo,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const e = await res.json().catch(() => null)
      setFormErr(e?.error ?? "登録に失敗しました")
      return
    }
    setCreating(false)
    setForm({ category: "article", name: "", companyName: "", type: "new", priority: "medium", dueDate: "", assigneeId: "", subAssigneeIds: [], memo: "" })
    await loadTasks()
  }

  // カードを別の列へ移す（先に画面を更新し、失敗したら元に戻す）
  const moveTask = async (taskId: string, col: ColumnKey) => {
    const t = tasks.find(x => x.id === taskId)
    if (!t) return
    const target = targetStatus(t, col)
    if (target.error) { setMoveErr(target.error); return }
    const next = target.status
    if (!next) return
    setMoveErr("")
    const prev = tasks
    setTasks(tasks.map(x => (x.id === taskId ? { ...x, status: next, statusChangedAt: new Date().toISOString() } : x)))
    const res = await fetch("/api/production-tasks/" + taskId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => null)
      setTasks(prev)
      setMoveErr((t.company ? t.company.name + "：" : "") + (e?.error ?? "ステータスを変更できませんでした"))
      return
    }
    await loadTasks()
  }

  // 公開済みの記事制作を「完了」にする（依頼営業・管理者）
  const completeTask = async (taskId: string) => {
    const t = tasks.find(x => x.id === taskId)
    if (!t || !confirm((t.company ? t.company.name + "「" : "「") + t.name + "」を完了にしますか？")) return
    setMoveErr("")
    const res = await fetch("/api/production-tasks/" + taskId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => null)
      setMoveErr(e?.error ?? "完了にできませんでした")
      return
    }
    await loadTasks()
  }

  // ===== 集計 =====
  const isMine = (t: Task) =>
    t.assignee?.id === userId || t.subAssignees.some(u => u.id === userId) || t.requester?.id === userId

  const scoped = useMemo(
    () => tasks.filter(t => (!onlyMine || isMine(t)) && (!category || t.category === category)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, onlyMine, category, userId],
  )
  const active = scoped.filter(t => !FINISHED_STATUSES.includes(t.status))

  const alerts: Record<AlertKey, Task[]> = {
    overdue: active.filter(t => t.dueDate && new Date(t.dueDate.slice(0, 10) + "T00:00:00").getTime() < startOfToday()),
    thisWeek: active.filter(t => {
      if (!t.dueDate) return false
      const d = new Date(t.dueDate.slice(0, 10) + "T00:00:00").getTime()
      return d >= startOfToday() && d <= startOfToday() + 7 * DAY
    }),
    unassigned: active.filter(t => !t.assignee),
    stale: active.filter(t => t.status !== "paused" && daysSince(t.statusChangedAt) >= STALE_DAYS),
  }
  const alertIds = alertFilter ? new Set(alerts[alertFilter].map(t => t.id)) : null

  const boardTasks = scoped.filter(t => {
    if (alertIds && !alertIds.has(t.id)) return false
    if (t.status === "stopped") return false
    if (["published", "completed"].includes(t.status)) return daysSince(t.statusChangedAt) <= DONE_SHOW_DAYS
    return true
  })
  const archived = scoped.filter(
    t => t.status === "stopped" || (["published", "completed"].includes(t.status) && daysSince(t.statusChangedAt) > DONE_SHOW_DAYS),
  )

  // 担当者ごとの抱えている件数（メイン・サブの両方を数える）
  const load = new Map<string, { name: string; count: number }>()
  let unassignedCount = 0
  for (const t of active) {
    const people = [t.assignee, ...t.subAssignees].filter((p): p is Person => !!p)
    if (people.length === 0) unassignedCount++
    for (const p of people) {
      const cur = load.get(p.id) ?? { name: p.name, count: 0 }
      cur.count++
      load.set(p.id, cur)
    }
  }
  const loadRows = [...load.values()].sort((a, b) => b.count - a.count)
  const maxLoad = Math.max(1, unassignedCount, ...loadRows.map(r => r.count))

  const alertCards: { key: AlertKey; label: string; cls: string }[] = [
    { key: "overdue", label: "納期切れ", cls: "bg-red-50 text-red-700 border-red-200" },
    { key: "thisWeek", label: "今週が納期", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    { key: "unassigned", label: "担当が未定", cls: "bg-white text-gray-700 border-gray-200" },
    { key: "stale", label: STALE_DAYS + "日以上止まっている", cls: "bg-white text-gray-700 border-gray-200" },
  ]

  const renderCard = (t: Task) => {
    const due = dueInfo(t)
    const wait = waitingFor(t.status)
    const people = [t.assignee, ...t.subAssignees].filter((p): p is Person => !!p).map(p => p.name).join("・")
    const days = daysSince(t.statusChangedAt)
    return (
      <div
        key={t.id}
        role="button"
        tabIndex={0}
        draggable
        onDragStart={e => { setDragId(t.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id) }}
        onDragEnd={() => { setDragId(null); setDragOver(null) }}
        onClick={() => router.push("/production/" + t.id)}
        onKeyDown={e => { if (e.key === "Enter") router.push("/production/" + t.id) }}
        className={"w-full text-left bg-white border border-gray-200 rounded-lg p-2.5 mb-2 hover:border-blue-300 hover:shadow-sm transition cursor-grab active:cursor-grabbing " + (dragId === t.id ? "opacity-40" : "")}
      >
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
            {t.category === "article" ? (TYPE_LABELS[t.type] ?? t.type) : (CATEGORY_LABELS[t.category] ?? t.category)}
          </span>
          {t.priority === "high" && (
            <span className={"text-[10px] px-1.5 py-0.5 rounded " + PRIORITY_LABELS.high.cls}>優先度 高</span>
          )}
          {t.status === "paused" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">一時停止</span>}
        </div>
        <div className="text-sm font-medium text-gray-900 leading-snug">{t.company ? t.company.name : t.name}</div>
        {t.company && <div className="text-xs text-gray-500 truncate">{t.name}</div>}
        <div className="text-xs text-gray-500 mt-1">{people || <span className="text-red-500">担当未定</span>}</div>
        {wait && <div className="text-xs text-purple-700 mt-0.5">{wait}</div>}
        {due && <div className={"text-xs mt-0.5 " + due.cls}>{due.text}</div>}
        {!FINISHED_STATUSES.includes(t.status) && (
          <div className={"text-[11px] mt-0.5 " + (days >= STALE_DAYS && t.status !== "paused" ? "text-red-500" : "text-gray-400")}>
            この段階で{days}日
          </div>
        )}
        {FINISHED_STATUSES.includes(t.status) && (
          <div className="text-[11px] mt-0.5 text-green-600">{STATUS_LABELS[t.status]?.label} {t.statusChangedAt.slice(5, 10).replace("-", "/")}</div>
        )}
        {t.category === "article" && t.status === "published" && (t.requester?.id === userId || isAdminUser) && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); completeTask(t.id) }}
            className="mt-2 w-full text-xs bg-emerald-600 text-white rounded-md py-1 hover:bg-emerald-700"
          >
            ✓ 完了にする
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-6 py-6 max-w-7xl">
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <h1 className="text-xl font-bold text-gray-800">🎨 制作ダッシュボード</h1>
            <div className="flex-1" />
            <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} className="w-4 h-4" />
              自分のタスクだけ
            </label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900">
              <option value="">すべての分類</option>
              {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button type="button" onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
              ＋ 新規タスク
            </button>
          </div>

          {/* 新規タスク */}
          {creating && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
              <div className="text-sm font-medium text-blue-900 mb-3">新規タスク</div>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">分類</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900">
                    {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="col-span-3">
                  <label className="block text-xs text-gray-500 mb-1">案件名 <span className="text-red-500">*</span></label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900" placeholder={form.category === "article" ? "例: 求人記事の給与欄修正" : "例: 助成金の申請書類まとめ"} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">企業{form.category === "article" ? <span className="text-red-500"> *</span> : "（任意）"}</label>
                  <input list="company-options" value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900" placeholder="企業名を入力して候補から選択" />
                  <datalist id="company-options">
                    {companies.map(c => <option key={c.id} value={c.name}>{c.companyId ?? ""}</option>)}
                  </datalist>
                </div>
                {form.category === "article" && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">種別</label>
                    <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900">
                      {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">優先度</label>
                  <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900">
                    {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">納期</label>
                  <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">担当（メイン）</label>
                  <select value={form.assigneeId} onChange={e => setForm({ ...form, assigneeId: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900">
                    <option value="">あとで決める</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">サブ担当（任意・複数可）</label>
                  <div className="flex flex-wrap gap-1.5">
                    {users.filter(u => u.id !== form.assigneeId).map(u => {
                      const on = form.subAssigneeIds.includes(u.id)
                      return (
                        <button key={u.id} type="button"
                          onClick={() => setForm({ ...form, subAssigneeIds: on ? form.subAssigneeIds.filter(x => x !== u.id) : [...form.subAssigneeIds, u.id] })}
                          className={"text-xs px-2.5 py-1 rounded-full border " + (on ? "bg-blue-100 text-blue-800 border-blue-300" : "bg-white text-gray-600 border-gray-200")}>
                          {u.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="col-span-4">
                  <label className="block text-xs text-gray-500 mb-1">依頼内容・メモ</label>
                  <textarea value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} rows={2} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900" />
                </div>
              </div>
              {formErr && <p className="text-xs text-red-600 mt-2">{formErr}</p>}
              <div className="flex gap-2 mt-3">
                <button type="button" onClick={submitCreate} disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{saving ? "登録中..." : "登録"}</button>
                <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-white">キャンセル</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-gray-400 text-sm py-12 text-center">読み込み中...</div>
          ) : (
            <>
              {/* 要対応 */}
              <div className="grid grid-cols-4 gap-3 mb-5">
                {alertCards.map(a => {
                  const selected = alertFilter === a.key
                  return (
                    <button key={a.key} type="button" onClick={() => setAlertFilter(selected ? "" : a.key)}
                      className={"text-left rounded-xl border px-4 py-3 transition " + a.cls + (selected ? " ring-2 ring-blue-400" : "")}>
                      <div className="text-xs">{a.label}</div>
                      <div className="text-2xl font-bold">{alerts[a.key].length}<span className="text-sm font-normal ml-0.5">件</span></div>
                    </button>
                  )
                })}
              </div>
              {alertFilter && (
                <p className="text-xs text-blue-700 mb-3">
                  「{alertCards.find(a => a.key === alertFilter)?.label}」の案件だけを表示中
                  <button type="button" onClick={() => setAlertFilter("")} className="ml-2 underline">解除</button>
                </p>
              )}

              {moveErr && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-sm text-red-700 flex items-center">
                  {moveErr}
                  <button type="button" onClick={() => setMoveErr("")} className="ml-auto text-xs underline">閉じる</button>
                </div>
              )}
              <p className="text-xs text-gray-400 mb-2">カードをドラッグして別の列に移すと、ステータスが変わります。クリックで詳細を開きます。公開済みの記事は、依頼営業がカードの「完了にする」で締めます。</p>

              {/* カンバン */}
              <div className="grid grid-cols-6 gap-2 mb-5">
                {BOARD_COLUMNS.map(col => {
                  const list = boardTasks.filter(t => (col.statuses as readonly string[]).includes(t.status))
                  const isOver = dragOver === col.key && dragId != null
                  return (
                    <div
                      key={col.key}
                      onDragOver={e => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragOver !== col.key) setDragOver(col.key) } }}
                      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null) }}
                      onDrop={e => {
                        e.preventDefault()
                        const id = e.dataTransfer.getData("text/plain") || dragId
                        setDragOver(null)
                        setDragId(null)
                        if (id) moveTask(id, col.key)
                      }}
                      className={"rounded-xl p-2.5 min-h-[200px] transition " + (isOver ? "bg-blue-100 ring-2 ring-blue-300" : "bg-gray-100")}
                    >
                      <div className="px-1 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-gray-700">{col.label}</span>
                          <span className="text-xs text-gray-500">{list.length}</span>
                        </div>
                        <div className="text-[10px] text-gray-400 h-3.5">{col.key === "done" ? "直近" + DONE_SHOW_DAYS + "日" : col.hint}</div>
                      </div>
                      {list.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-6">なし</p>
                      ) : (
                        list.map(renderCard)
                      )}
                    </div>
                  )
                })}
              </div>

              {/* 担当者ごとの件数 */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
                <div className="text-sm font-medium text-gray-700 mb-3">担当者ごとの抱えている件数</div>
                <div className="space-y-2">
                  {loadRows.map(r => (
                    <div key={r.name} className="grid grid-cols-[6rem_1fr_3rem] items-center gap-2 text-sm">
                      <span className="text-gray-700 truncate">{r.name}</span>
                      <div className="h-2.5 bg-gray-100 rounded"><div className="h-2.5 bg-blue-400 rounded" style={{ width: (r.count / maxLoad) * 100 + "%" }} /></div>
                      <span className="text-gray-500 text-right">{r.count}件</span>
                    </div>
                  ))}
                  {unassignedCount > 0 && (
                    <div className="grid grid-cols-[6rem_1fr_3rem] items-center gap-2 text-sm">
                      <span className="text-red-600">未割当</span>
                      <div className="h-2.5 bg-gray-100 rounded"><div className="h-2.5 bg-red-400 rounded" style={{ width: (unassignedCount / maxLoad) * 100 + "%" }} /></div>
                      <span className="text-gray-500 text-right">{unassignedCount}件</span>
                    </div>
                  )}
                  {loadRows.length === 0 && unassignedCount === 0 && <p className="text-xs text-gray-400">進行中の案件はありません</p>}
                </div>
              </div>

              {/* アーカイブ */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 mb-8">
                <button type="button" onClick={() => setShowArchive(!showArchive)} className="flex items-center gap-2 w-full text-left">
                  <span className="text-sm font-medium text-gray-500">アーカイブ（停止・{DONE_SHOW_DAYS}日より前に完了）</span>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{archived.length}</span>
                  <span className="ml-auto text-xs text-gray-400">{showArchive ? "▲ 閉じる" : "▼ 表示する"}</span>
                </button>
                {showArchive && (
                  <div className="mt-3 divide-y divide-gray-100">
                    {archived.map(t => (
                      <button key={t.id} type="button" onClick={() => router.push("/production/" + t.id)} className="w-full text-left flex items-center gap-3 py-2 text-sm hover:bg-gray-50">
                        <span className={"text-[10px] px-1.5 py-0.5 rounded " + (STATUS_LABELS[t.status]?.cls ?? "")}>{STATUS_LABELS[t.status]?.label ?? t.status}</span>
                        <span className="text-gray-900">{t.company ? t.company.name + " ／ " : ""}{t.name}</span>
                        <span className="ml-auto text-xs text-gray-400">{t.statusChangedAt.slice(0, 10)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
