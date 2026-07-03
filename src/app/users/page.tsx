"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"

type User = {
  id: string
  name: string
  email: string
  role: string
  createdAt: string
}

function generatePassword() {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$"
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "sales" })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [generatedPassword, setGeneratedPassword] = useState("")
  const [userName, setUserName] = useState("")

  const fetchUsers = async () => {
    const res = await fetch("/api/users")
    const data = await res.json()
    setUsers(data)
  }

  useEffect(() => {
    fetchUsers()
    fetch("/api/auth/session").then(r => r.json()).then(s => setUserName(s?.user?.name ?? ""))
  }, [])

  const handleGeneratePassword = () => {
    const pwd = generatePassword()
    setForm(f => ({ ...f, password: pwd }))
    setGeneratedPassword(pwd)
  }

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.password) {
      setError("全項目を入力してください")
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
      setForm({ name: "", email: "", password: "", role: "sales" })
      setShowForm(false)
      setGeneratedPassword("")
      fetchUsers()
    } else {
      const data = await res.json()
      setError(data.error ?? "エラーが発生しました")
    }
    setLoading(false)
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
                  <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="例：山田太郎" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">メールアドレス</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="例：yamada@tenshokudo.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">パスワード</label>
                  <div className="flex gap-2">
                    <input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="パスワード" />
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
                  <label className="block text-xs font-medium text-gray-500 mb-1">権限</label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="sales">営業</option>
                    <option value="production">制作</option>
                    <option value="admin">管理者</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => { setShowForm(false); setGeneratedPassword("") }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">キャンセル</button>
                <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{loading ? "登録中..." : "登録する"}</button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">名前</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">メールアドレス</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">権限</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">登録日</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{user.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={"text-xs px-2 py-1 rounded-full font-medium " + (user.role === "admin" ? "bg-purple-100 text-purple-800" : user.role === "production" ? "bg-pink-100 text-pink-800" : "bg-gray-100 text-gray-600")}>{user.role === "admin" ? "管理者" : user.role === "production" ? "制作" : "営業"}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{new Date(user.createdAt).toLocaleDateString("ja-JP")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}