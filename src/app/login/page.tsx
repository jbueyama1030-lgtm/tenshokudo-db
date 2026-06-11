"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    })
    if (result?.error) {
      setError("メールアドレスまたはパスワードが正しくありません")
    } else {
      router.push("/dashboard")
    }
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="bg-[#111827] p-8 rounded-xl w-full max-w-md">
        <h1 className="text-white text-2xl font-bold mb-2">転職道</h1>
        <p className="text-gray-400 text-sm mb-8">営業管理システム</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-gray-300 text-sm block mb-1">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#1a2235] text-white px-4 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label className="text-gray-300 text-sm block mb-1">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#1a2235] text-white px-4 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition"
          >
            ログイン
          </button>
        </form>
      </div>
    </div>
  )
}