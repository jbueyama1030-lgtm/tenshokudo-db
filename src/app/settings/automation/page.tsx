// 置き場所: src/app/settings/automation/page.tsx
// 自動化の設定（役員のみ）。初回電話クエストのオン・オフと、会社独自の休み
"use client"

import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"

type Settings = {
  firstCall: { enabled: boolean; startAt: string | null }
  holidays: { date: string; name: string }[]
}

const fmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
})

export default function AutomationSettingsPage() {
  const [data, setData] = useState<Settings | null>(null)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [userName, setUserName] = useState("")
  const [newDate, setNewDate] = useState("")
  const [newName, setNewName] = useState("")

  const load = async () => {
    const res = await fetch("/api/settings/automation", { cache: "no-store" })
    const d = await res.json().catch(() => null)
    if (!res.ok) {
      setError(d?.error ?? "設定を読み込めませんでした")
      return
    }
    setError("")
    setData(d)
  }

  useEffect(() => {
    load()
    fetch("/api/auth/session").then(r => r.json()).then(s => setUserName(s?.user?.name ?? ""))
  }, [])

  const toggleFirstCall = async () => {
    if (!data) return
    const next = !data.firstCall.enabled
    if (next && !data.firstCall.startAt && !confirm("初回電話のクエストを始めます。今から後の応募に、担当営業と補佐あてのクエストが出るようになります。よろしいですか？")) return
    setSaving(true)
    const res = await fetch("/api/settings/automation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstCallEnabled: next }),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => null)
      setError(e?.error ?? "保存できませんでした")
    }
    await load()
    setSaving(false)
  }

  const addHoliday = async () => {
    if (!newDate) return
    setSaving(true)
    const res = await fetch("/api/settings/holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: newDate, name: newName }),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => null)
      setError(e?.error ?? "追加できませんでした")
    } else {
      setNewDate("")
      setNewName("")
    }
    await load()
    setSaving(false)
  }

  const removeHoliday = async (date: string) => {
    setSaving(true)
    await fetch("/api/settings/holidays?date=" + encodeURIComponent(date), { method: "DELETE" })
    await load()
    setSaving(false)
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-6">自動化の設定</h1>
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        {!data && !error && <p className="text-sm text-gray-400">読み込み中...</p>}

        {data && (
          <div className="space-y-4 max-w-2xl">
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">応募者への初回電話のクエスト</h2>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    自社の企業に応募が入ったら、担当営業と営業補佐に初回電話のクエストを出します（TEL応募・代理店案件は対象外）。
                    期日は営業時間内の応募がその日の18:00、夜間・休日の応募が次の営業日の18:00です。
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    {data.firstCall.startAt
                      ? "使い始めた日時：" + fmt.format(new Date(data.firstCall.startAt)) + "（これより前の応募には出しません）"
                      : "まだ使い始めていません"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={toggleFirstCall}
                  className={"shrink-0 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 " + (data.firstCall.enabled ? "bg-green-600 text-white" : "bg-gray-200 text-gray-700")}
                >
                  {data.firstCall.enabled ? "オン" : "オフ"}
                </button>
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-800">会社の休み</h2>
              <p className="text-xs text-gray-500 mt-1">土日と日本の祝日は自動で休みになります。年末年始など、会社独自の休みだけ追加してください。</p>
              <div className="flex gap-2 mt-3 flex-wrap">
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="例：年末年始" className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                <button type="button" disabled={saving || !newDate} onClick={addHoliday} className="px-4 py-2 rounded-lg text-sm bg-[#185FA5] text-white disabled:opacity-50">追加</button>
              </div>
              <ul className="mt-3 divide-y divide-gray-100">
                {data.holidays.length === 0 && <li className="text-sm text-gray-400 py-2">登録されていません</li>}
                {data.holidays.map(h => (
                  <li key={h.date} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-gray-800">{h.date}　{h.name}</span>
                    <button type="button" disabled={saving} onClick={() => removeHoliday(h.date)} className="text-xs text-gray-400 hover:text-red-600">削除</button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
