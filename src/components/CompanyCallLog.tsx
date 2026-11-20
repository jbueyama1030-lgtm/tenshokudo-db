// 置き場所: src/components/CompanyCallLog.tsx
// 企業ページ「応募対応」タブ。月ごとの集計と、1応募＝1行の表。
// 2回以上電話した行やメモのある行は、押すと1回目・2回目の詳細が開く
"use client"

import Link from "next/link"
import { Fragment, useEffect, useState } from "react"

type Item = {
  key: string
  appliedAt: string | null
  externalId: string | null
  entryType: string | null
  inflow: string | null
  open: { attempt: number; dueAt: string } | null
  result: string | null
  resultLabel: string | null
  doneBy: string | null
  attempts: number
  lastNote: string | null
  history: { attempt: number; resultLabel: string | null; resultNote: string | null; doneAt: string | null; doneBy: string | null }[]
}

type Data = {
  month: string
  openCount: number
  summary: { total: number; connected: number; unreachable: number; other: number; open: number }
  items: Item[]
}

const fmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
})

function thisMonth(): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).format(new Date())
  return p.slice(0, 7)
}

function shiftMonth(month: string, diff: number): string {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + diff, 1))
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0")
}

function resultCls(result: string | null): string {
  if (result === "connected") return "bg-green-100 text-green-800"
  if (result === "unreachable" || result === "wrong_number") return "bg-red-50 text-red-700"
  return "bg-gray-100 text-gray-700"
}

export default function CompanyCallLog({ companyId }: { companyId: string }) {
  const [month, setMonth] = useState<string>(thisMonth)
  const [data, setData] = useState<Data | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/companies/" + companyId + "/quests?month=" + month, { cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setData(null) })
    return () => { cancelled = true }
  }, [companyId, month])

  const [y, m] = month.split("-").map(Number)
  const s = data?.summary
  const isCurrent = month === thisMonth()

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="px-2 py-1 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="前の月">←</button>
          <h2 className="text-sm font-semibold text-gray-800">{y}年{m}月の応募対応</h2>
          <button type="button" disabled={isCurrent} onClick={() => setMonth(shiftMonth(month, 1))} className="px-2 py-1 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30" aria-label="次の月">→</button>
        </div>
        <Link href="/quests" className="text-xs text-blue-600 hover:underline">クエスト画面へ</Link>
      </div>

      {s && (
        <div className="grid grid-cols-5 gap-2 mb-4">
          {[
            { label: "応募", value: s.total, cls: "text-gray-900" },
            { label: "つながった", value: s.connected, cls: "text-green-700" },
            { label: "連絡つかず", value: s.unreachable, cls: "text-red-700" },
            { label: "その他", value: s.other, cls: "text-gray-700" },
            { label: "対応待ち", value: s.open, cls: "text-amber-700" },
          ].map(c => (
            <div key={c.label} className="bg-gray-50 rounded-xl px-3 py-2">
              <div className="text-[11px] text-gray-500">{c.label}</div>
              <div className={"text-lg font-bold " + c.cls}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {!data && <p className="text-sm text-gray-400 py-6 text-center">読み込み中...</p>}
      {data && data.items.length === 0 && (
        <p className="text-sm text-gray-400 py-6 text-center">この月の記録はありません（TEL応募と、クエストを使い始める前の応募は対象外です）</p>
      )}

      {data && data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="py-2 pr-3 font-medium">応募日時</th>
                <th className="py-2 pr-3 font-medium">種別</th>
                <th className="py-2 pr-3 font-medium">流入</th>
                <th className="py-2 pr-3 font-medium">結果</th>
                <th className="py-2 pr-3 font-medium">対応</th>
                <th className="py-2 pr-3 font-medium text-center">回数</th>
                <th className="py-2 font-medium">メモ</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map(it => {
                const expandable = it.history.length > 1 || it.history.some(h => h.resultNote)
                const expanded = openKey === it.key
                return (
                  <Fragment key={it.key}>
                    <tr
                      onClick={() => expandable && setOpenKey(expanded ? null : it.key)}
                      className={"border-b border-gray-50 " + (expandable ? "cursor-pointer hover:bg-gray-50" : "")}
                    >
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-800">{it.appliedAt ? fmt.format(new Date(it.appliedAt)) : "-"}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-600">{it.entryType ?? "-"}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-600">{it.inflow ?? "-"}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {it.open ? (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            ● {it.open.attempt >= 2 ? "かけ直し待ち" : "対応待ち"}（{fmt.format(new Date(it.open.dueAt))}）
                          </span>
                        ) : (
                          <span className={"text-xs font-bold px-2 py-0.5 rounded-full " + resultCls(it.result)}>{it.resultLabel}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-800">{it.doneBy ?? "—"}</td>
                      <td className="py-2 pr-3 text-center text-gray-600">
                        {it.attempts > 0 ? it.attempts : "—"}
                        {expandable && <span className="ml-1 text-gray-400">{expanded ? "▴" : "▾"}</span>}
                      </td>
                      <td className="py-2 text-gray-600 max-w-[16rem] truncate">{it.lastNote ?? ""}</td>
                    </tr>
                    {expanded && (
                      <tr className="bg-gray-50">
                        <td colSpan={7} className="px-3 py-2">
                          <ol className="space-y-1 text-xs">
                            {it.history.map(h => (
                              <li key={h.attempt} className="flex flex-wrap items-center gap-2">
                                <span className="text-gray-400">{h.attempt}回目</span>
                                <span className="rounded-full bg-blue-50 text-blue-800 font-bold px-2 py-0.5">{h.doneBy ?? "不明"}</span>
                                <span className="font-bold text-gray-900">{h.resultLabel}</span>
                                <span className="text-gray-400">{h.doneAt ? fmt.format(new Date(h.doneAt)) : ""}</span>
                                {h.resultNote && <span className="text-gray-700">「{h.resultNote}」</span>}
                              </li>
                            ))}
                          </ol>
                          {it.externalId && <div className="text-[11px] text-gray-400 mt-1">応募ID {it.externalId}</div>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
