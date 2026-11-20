// 置き場所: src/components/CompanyCallLog.tsx
// 企業ページの「初回電話の記録」。応募ごとに、誰が・いつ・どんな結果だったかを並べる
"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

type Item = {
  key: string
  appliedAt: string | null
  externalId: string | null
  entryType: string | null
  inflow: string | null
  open: { attempt: number; dueAt: string } | null
  history: { attempt: number; resultLabel: string | null; resultNote: string | null; doneAt: string | null; doneBy: string | null }[]
}

const fmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
})

export default function CompanyCallLog({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    fetch("/api/companies/" + companyId + "/quests", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : { items: [] }))
      .then(d => setItems(Array.isArray(d.items) ? d.items : []))
      .catch(() => setItems([]))
  }, [companyId])

  const list = items ?? []
  const shown = showAll ? list : list.slice(0, 5)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">初回電話の記録</h2>
        <Link href="/quests" className="text-xs text-blue-600 hover:underline">クエストへ</Link>
      </div>
      {items === null && <p className="text-sm text-gray-400">読み込み中...</p>}
      {items !== null && list.length === 0 && <p className="text-sm text-gray-400">まだ記録はありません</p>}
      <ul className="space-y-3">
        {shown.map(it => (
          <li key={it.key} className="text-xs border-b border-gray-100 pb-2 last:border-0">
            <div className="text-gray-500">
              応募 {it.appliedAt ? fmt.format(new Date(it.appliedAt)) : "-"}・{it.entryType ?? "種別なし"}
              {it.externalId && <span className="text-gray-400">（ID {it.externalId}）</span>}
            </div>
            {it.history.map(h => (
              <div key={h.attempt} className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="text-gray-400">{h.attempt}回目</span>
                <span className="rounded-full bg-blue-50 text-blue-800 font-bold px-2 py-0.5">{h.doneBy ?? "不明"}</span>
                <span className="font-bold text-gray-900">{h.resultLabel}</span>
                <span className="text-gray-400">{h.doneAt ? fmt.format(new Date(h.doneAt)) : ""}</span>
                {h.resultNote && <span className="w-full text-gray-700">「{h.resultNote}」</span>}
              </div>
            ))}
            {it.open && (
              <div className="mt-1 text-amber-700">
                {it.open.attempt >= 2 ? "かけ直し" : "初回電話"}の対応待ち（期日 {fmt.format(new Date(it.open.dueAt))}）
              </div>
            )}
          </li>
        ))}
      </ul>
      {list.length > 5 && (
        <button type="button" onClick={() => setShowAll(v => !v)} className="mt-2 text-xs text-gray-500 hover:text-gray-700">
          {showAll ? "閉じる" : "もっと見る（" + list.length + "件）"}
        </button>
      )}
    </div>
  )
}
