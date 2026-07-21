"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"

type User = {
  id: string
  name: string
  email: string
  role: string
  roles: string[]
  isActive: boolean
  chatworkAccountId: string | null
  createdAt: string
}

const ROLE_OPTIONS = [
  { value: "sales", label: "営業", cls: "bg-gray-100 text-gray-700" },
  { value: "production", label: "制作", cls: "bg-pink-100 text-pink-800" },
  { value: "marketer", label: "マーケター", cls: "bg-cyan-100 text-cyan-800" },
  { value: "advisor", label: "キャリアアドバイザー", cls: "bg-emerald-100 text-emerald-800" },
  { value: "admin", label: "管理者", cls: "bg-purple-100 text-purple-800" },
]

function roleLabel(value: string) {
  return ROLE_OPTIONS.find(r => r.value === value)?.label ?? value
}
function roleCls(value: string) {
  return ROLE_OPTIONS.find(r => r.value === value)?.cls ?? "bg-gray-100 text-gray-600"
}

function generatePassword() {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$"
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: "", email: "", password: "", roles: ["sales"] as string[], chatworkAccountId: "" })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [generatedPassword, setGeneratedPassword] = useState("")
  const [userName, setUserName] = useState("")
  const [myId, setMyId] = useState("")

  // 編集パネル
  const [editingId, setEditingId] = useState("")
  const [editRoles, setEditRoles] = useState<string[]>([])
  const [editChatwork, setEditChatwork] = useState("")
  const [saving, setSaving] = useState(false)
  const [rowError, setRowError] = useState("")

  const fetchUsers = async () => {
    const res = await fetch("/api/users")
    const data = await res.json()
    if (Array.isArray(data)) setUsers(data)
  }

  useEffect(() => {
    fetchUsers()
    fetch("/api/auth/session").then(r => r.json()).then(s => {
      setUserName(s?.user?.name ?? "")
      setMyId(s?.user?.id ?? "")
    })
  }, [])

  const handleGeneratePassword = () => {
    const pwd = generatePassword()
    setForm(f => ({ ...f, password: pwd }))
    setGeneratedPassword(pwd)
  }

  const toggleFormRole = (role: string) => {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role],
    }))
  }

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.password) {
      setError("名前・メールアドレス・パスワードを入力してください")
      return
    }
    if (form.roles.length === 0) {
      setError("ロールを1つ以上選択してください")
      return
    }
    setLoading(true)
    setError("")
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setForm({ name: "", email: "", password: "", roles: ["sales"], chatworkAccountId: "" })
      setShowForm(false)
      setGeneratedPassword("")
      fetchUsers()
    } else {
      const data = await res.json()
      setError(data.error ?? "エラーが発生しました")
    }
    setLoading(false)
  }

  const startEdit = (user: User) => {
    setEditingId(user.id)
    setEditRoles([...user.roles])
    setEditChatwork(user.chatworkAccountId ?? "")
    setRowError("")
  }

  const cancelEdit = () => {
    setEditingId("")
    setEditRoles([])
    setEditChatwork("")
    setRowError("")
  }

  const toggleEditRole = (role: string) => {
    setEditRoles(rs => rs.includes(role) ? rs.filter(r => r !== role) : [...rs, role])
  }

  const saveEdit = async (user: User) => {
    setSaving(true)
    setRowError("")
    const payload: Record<string, unknown> = {
      id: user.id,
      chatworkAccountId: editChatwork.trim(),
    }
    // 自分自身の場合、ロールは送らない（サーバー側でも弾かれる）
    if (user.id !== myId) payload.roles = editRoles

    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      await fetchUsers()
      cancelEdit()
    } else {
      const d = await res.json()
      setRowError(d.error ?? "保存に失敗しました")
    }
    setSaving(false)
  }

  const toggleActive = async (user: User) => {
    const next = !user.isActive
    const msg = next
      ? user.name + " を有効に戻しますか？"
      : user.name + " を無効化しますか？（ログインできなくなります。データは残ります）"
    if (!confirm(msg)) return

    setRowError("")
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, isActive: next }),
    })
    if (res.ok) {
      await fetchUsers()
    } else {
      const d = await res.json()
      setRowError(d.error ?? "変更に失敗しました")
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />

      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold text-gray-800">ユーザー管理</h1>
            <button onClick={() => { setShowForm(!showForm); setGeneratedPassword("") }} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
              ＋ ユーザー追加
            </button>
          </div>

          {showForm && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">新規ユーザー追加</h2>
              {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">名前</label>
                  <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="例：山田太郎" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">メールアドレス</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="例：yamada@tenshokudo.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">パスワード</label>
                  <div className="flex gap-2">
                    <input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-900" placeholder="パスワード" />
                    <button type="button" onClick={handleGeneratePassword} className="px-3 py-2 text-xs bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 whitespace-nowrap">
                      自動生成
                    </button>
                  </div>
                  {generatedPassword && (
                    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-xs text-yellow-800 font-medium">⚠️ このパスワードをメモしてください：</p>
                      <p className="text-sm font-mono font-bold text-yellow-900 mt-1 select-all">{generatedPassword}</p>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ChatWorkアカウントID（任意）</label>
                  <input type="text" value={form.chatworkAccountId} onChange={e => setForm(f => ({ ...f, chatworkAccountId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-900" placeholder="例：1234567" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-2">ロール（複数選択可）</label>
                  <div className="flex flex-wrap gap-2">
                    {ROLE_OPTIONS.map(r => {
                      const sel = form.roles.includes(r.value)
                      return (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => toggleFormRole(r.value)}
                          className={"text-xs px-3 py-1.5 rounded-full border transition-colors " + (sel ? "bg-blue-100 text-blue-800 border-blue-300 font-medium" : "bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-400")}
                        >
                          {sel ? "✓ " : ""}{r.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => { setShowForm(false); setGeneratedPassword("") }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">キャンセル</button>
                <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{loading ? "登録中..." : "登録する"}</button>
              </div>
            </div>
          )}

          {rowError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{rowError}</div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">名前</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">メールアドレス</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">ロール</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">ChatWork ID</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">状態</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => {
                  const isEditing = editingId === user.id
                  const isSelf = user.id === myId
                  return (
                    <tr key={user.id} className={"hover:bg-gray-50 " + (user.isActive ? "" : "opacity-50 bg-gray-50")}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {user.name}
                        {isSelf && <span className="ml-2 text-[10px] text-blue-600">(自分)</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                      <td className="px-4 py-3">
                        {isEditing && !isSelf ? (
                          <div className="flex flex-wrap gap-1.5">
                            {ROLE_OPTIONS.map(r => {
                              const sel = editRoles.includes(r.value)
                              return (
                                <button
                                  key={r.value}
                                  type="button"
                                  onClick={() => toggleEditRole(r.value)}
                                  className={"text-[11px] px-2 py-1 rounded-full border transition-colors " + (sel ? "bg-blue-100 text-blue-800 border-blue-300 font-medium" : "bg-white text-gray-400 border-gray-200")}
                                >
                                  {sel ? "✓ " : ""}{r.label}
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {user.roles.length > 0 ? user.roles.map(r => (
                              <span key={r} className={"text-xs px-2 py-1 rounded-full font-medium " + roleCls(r)}>{roleLabel(r)}</span>
                            )) : <span className="text-xs text-gray-300">未設定</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editChatwork}
                            onChange={e => setEditChatwork(e.target.value)}
                            className="w-28 border border-gray-300 rounded px-2 py-1 text-sm font-mono text-gray-900"
                            placeholder="1234567"
                          />
                        ) : (
                          user.chatworkAccountId
                            ? <span className="text-sm font-mono text-gray-700">{user.chatworkAccountId}</span>
                            : <span className="text-xs text-gray-300">未設定</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {user.isActive
                          ? <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-100 text-green-700">有効</span>
                          : <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-200 text-gray-500">無効</span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex items-center gap-2 justify-end">
                            <button onClick={() => saveEdit(user)} disabled={saving} className="text-xs bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50">
                              {saving ? "保存中" : "保存"}
                            </button>
                            <button onClick={cancelEdit} className="text-xs text-gray-500 hover:text-gray-700">取消</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 justify-end">
                            <button onClick={() => startEdit(user)} className="text-xs text-blue-500 hover:text-blue-700">編集</button>
                            {!isSelf && (
                              <button onClick={() => toggleActive(user)} className={"text-xs " + (user.isActive ? "text-red-400 hover:text-red-600" : "text-green-600 hover:text-green-700")}>
                                {user.isActive ? "無効化" : "有効化"}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400 mt-3">
            ※ 無効化したユーザーはログインできなくなりますが、担当企業や過去の履歴は保持されます。自分自身のロール変更・無効化はできません。
          </p>
        </div>
      </main>
    </div>
  )
}