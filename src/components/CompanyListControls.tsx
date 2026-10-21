// 置き場所: src/components/CompanyListControls.tsx
"use client"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

/** 担当者のプルダウン（選ぶとURLを切り替える） */
export function UserSelect({
  users,
  selected,
  hrefFor,
}: {
  users: { id: string; name: string }[]
  selected: string
  hrefFor: Record<string, string>
}) {
  const router = useRouter()
  return (
    <select
      value={selected}
      onChange={e => router.push(hrefFor[e.target.value] ?? "/companies")}
      className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white min-w-[9rem]"
    >
      <option value="all">全員</option>
      {users.map(u => (
        <option key={u.id} value={u.id}>{u.name}</option>
      ))}
    </select>
  )
}

/** 打ちながら絞り込む検索欄（0.4秒止まったらURLを更新） */
export function LiveSearch({ initial, baseHref }: { initial: string; baseHref: string }) {
  const router = useRouter()
  const [q, setQ] = useState(initial)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) { first.current = false; return }
    const t = setTimeout(() => {
      const url = new URL(baseHref, window.location.origin)
      if (q.trim()) url.searchParams.set("q", q.trim())
      else url.searchParams.delete("q")
      router.replace(url.pathname + (url.search ? url.search : ""))
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  return (
    <div className="relative flex-1">
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="会社名・企業ID・住所・電話番号で検索（入力すると絞り込まれます）"
        className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {q && (
        <button type="button" onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">✕</button>
      )}
    </div>
  )
}
