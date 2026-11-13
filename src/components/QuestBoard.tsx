// 置き場所: src/components/QuestBoard.tsx
// 自分のクエスト画面の本体。スマホで片手で使えるよう、ボタンは大きめ（高さ44px以上）にしている。
"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

type Quest = {
  id: string
  type: string
  status: string
  attempt: number
  dueAt: string
  company: { id: string; name: string } | null
  application: {
    externalId: string | null
    appliedAt: string
    entryType: string | null
    inflow: string
    status: string
    age: number | null
    gender: string | null
    hasLicense2: boolean | null
    applicantPref: string | null
  } | null
  assignees: { id: string; name: string; role: string }[]
  lockedBy: { id: string; name: string } | null
  lockedAt: string | null
  result: string | null
  resultLabel: string | null
  resultNote: string | null
  doneAt: string | null
  doneBy: { id: string; name: string } | null
  canAct: boolean
}

type ListResponse = { me: string; now: string; myDoneThisWeek: number; quests: Quest[] }

// 人が選ぶ結果（サーバー側の FIRST_CALL_RESULTS と同じ並び）
const RESULTS: { key: string; label: string; primary?: boolean }[] = [
  { key: "connected", label: "つながった", primary: true },
  { key: "absent", label: "不在" },
  { key: "wrong_number", label: "番号違い・使われていない" },
  { key: "declined", label: "辞退・応募した覚えがない" },
  { key: "company_contacted", label: "企業がすでに連絡済み" },
  { key: "not_needed", label: "電話不要（理由を入力）" },
]

const fmtDateTime = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
})
const fmtTime = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" })
const fmtDay = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })

function dt(iso: string): string {
  return fmtDateTime.format(new Date(iso))
}

function dueBadge(dueIso: string, now: number): { label: string; cls: string; overdue: boolean; today: boolean } {
  const due = new Date(dueIso)
  if (due.getTime() < now) {
    return { label: "期日超過（" + dt(dueIso) + "）", cls: "bg-red-100 text-red-700", overdue: true, today: false }
  }
  if (fmtDay.format(due) === fmtDay.format(new Date(now))) {
    return { label: "今日 " + fmtTime.format(due) + " まで", cls: "bg-amber-100 text-amber-800", overdue: false, today: true }
  }
  return { label: dt(dueIso) + " まで", cls: "bg-gray-100 text-gray-600", overdue: false, today: false }
}

function applicantSummary(a: NonNullable<Quest["application"]>): string {
  return [
    a.age != null ? a.age + "歳" : null,
    a.gender,
    a.hasLicense2 === true ? "二種あり" : a.hasLicense2 === false ? "二種なし" : null,
    a.applicantPref,
  ].filter(Boolean).join("・")
}

export default function QuestBoard({ userName }: { userName: string }) {
  const [scope, setScope] = useState<"mine" | "all">("mine")
  const [view, setView] = useState<"open" | "done">("open")
  const [data, setData] = useState<ListResponse | null>(null)
  const [loadError, setLoadError] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [pendingNotNeeded, setPendingNotNeeded] = useState<string | null>(null)
  const [flash, setFlash] = useState("")

  const load = useCallback(async () => {
    const res = await fetch("/api/quests?scope=" + scope + "&view=" + view, { cache: "no-store" })
    if (!res.ok) {
      setLoadError("クエストを読み込めませんでした。時間をおいてもう一度開いてください。")
      return
    }
    setLoadError("")
    setData(await res.json())
  }, [scope, view])

  useEffect(() => {
    load()
    // ほかの人の「対応中」を反映するため、30秒ごとに読み直す（画面を見ているときだけ）
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load()
    }, 30000)
    return () => clearInterval(timer)
  }, [load])

  const setError = (id: string, msg: string) => setErrors(e => ({ ...e, [id]: msg }))

  const lock = async (q: Quest) => {
    setBusyId(q.id)
    setError(q.id, "")
    const res = await fetch("/api/quests/" + q.id + "/lock", { method: "POST" })
    if (!res.ok) {
      const e = await res.json().catch(() => null)
      setError(q.id, e?.error ?? "対応中にできませんでした")
    }
    await load()
    setBusyId(null)
  }

  const unlock = async (q: Quest) => {
    setBusyId(q.id)
    await fetch("/api/quests/" + q.id + "/lock", { method: "DELETE" })
    setPendingNotNeeded(null)
    await load()
    setBusyId(null)
  }

  const submit = async (q: Quest, result: string) => {
    const note = notes[q.id] ?? ""
    if (result === "not_needed" && !note.trim()) {
      setPendingNotNeeded(q.id)
      setError(q.id, "電話不要の理由を一言入れてから、もう一度押してください")
      return
    }
    setBusyId(q.id)
    setError(q.id, "")
    const res = await fetch("/api/quests/" + q.id + "/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result, note }),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => null)
      setError(q.id, e?.error ?? "結果を保存できませんでした")
      setBusyId(null)
      return
    }
    const d = await res.json().catch(() => null)
    setFlash(
      d?.nextQuestId
        ? (q.company?.name ?? "") + "：不在のため、翌営業日にかけ直しのクエストを出しました"
        : (q.company?.name ?? "") + "：結果を記録しました",
    )
    setTimeout(() => setFlash(""), 5000)
    setNotes(n => ({ ...n, [q.id]: "" }))
    setPendingNotNeeded(null)
    await load()
    setBusyId(null)
  }

  // 期日の判定はサーバーの時刻を使う（読み直すたびに更新される）
  const now = data ? new Date(data.now).getTime() : 0
  const quests = data?.quests ?? []
  const overdueCount = view === "open" ? quests.filter(q => new Date(q.dueAt).getTime() < now).length : 0
  const todayCount = view === "open" ? quests.filter(q => dueBadge(q.dueAt, now).today).length : 0

  const tabCls = (on: boolean) =>
    "flex-1 min-h-[40px] rounded-lg text-sm " + (on ? "bg-white text-gray-900 font-bold shadow-sm" : "text-gray-500")

  return (
    <div className="max-w-2xl mx-auto pb-10">
      <header className="bg-[#0C1A2E] text-white px-4 py-3 md:rounded-b-2xl">
        <div className="text-[11px] text-white/50">転職道DB</div>
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-bold">{scope === "mine" ? "自分のクエスト" : "全員のクエスト"}</h1>
          <span className="text-xs text-white/60">{userName}</span>
        </div>
      </header>

      <div className="px-3 pt-3 space-y-2">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button type="button" className={tabCls(scope === "mine")} onClick={() => setScope("mine")}>自分</button>
          <button type="button" className={tabCls(scope === "all")} onClick={() => setScope("all")}>全員</button>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button type="button" className={tabCls(view === "open")} onClick={() => setView("open")}>対応待ち</button>
          <button type="button" className={tabCls(view === "done")} onClick={() => setView("done")}>完了（7日）</button>
        </div>
      </div>

      {view === "open" && (
        <div className="grid grid-cols-3 gap-2 px-3 pt-3">
          <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
            <div className="text-[11px] text-gray-500">今日が期日</div>
            <div className="text-xl font-bold text-gray-900">{todayCount}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
            <div className="text-[11px] text-red-700">期日超過</div>
            <div className="text-xl font-bold text-red-700">{overdueCount}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
            <div className="text-[11px] text-gray-500">今週の完了（自分）</div>
            <div className="text-xl font-bold text-gray-900">{data?.myDoneThisWeek ?? "-"}</div>
          </div>
        </div>
      )}

      {flash && (
        <div className="mx-3 mt-3 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2" role="status">{flash}</div>
      )}
      {loadError && <p className="mx-3 mt-3 text-sm text-red-600">{loadError}</p>}

      <div className="px-3 pt-3 space-y-3">
        {!data && !loadError && <p className="text-sm text-gray-400 text-center py-10">読み込み中...</p>}
        {data && quests.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-10">
            {view === "open" ? "対応待ちのクエストはありません" : "この7日間に完了したクエストはありません"}
          </p>
        )}

        {quests.map(q => {
          const badge = dueBadge(q.dueAt, now)
          const lockedByMe = q.lockedBy?.id === data?.me
          const lockedByOther = !!q.lockedBy && !lockedByMe
          const a = q.application
          const busy = busyId === q.id
          return (
            <article key={q.id} className={"bg-white rounded-2xl border p-3 " + (view === "open" && badge.overdue ? "border-red-200" : "border-gray-200")}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  {q.company ? (
                    <Link href={"/companies/" + q.company.id} className="text-base font-bold text-gray-900 hover:underline">{q.company.name}</Link>
                  ) : <span className="text-base font-bold text-gray-900">（企業なし）</span>}
                  <div className="text-xs text-gray-600 mt-0.5">
                    {q.attempt >= 2 ? "かけ直し（2回目）" : "新しい応募に初回電話"}
                  </div>
                </div>
                {view === "open" ? (
                  <span className={"shrink-0 text-[11px] font-bold px-2 py-1 rounded-full " + badge.cls}>{badge.label}</span>
                ) : (
                  <span className="shrink-0 text-[11px] font-bold px-2 py-1 rounded-full bg-green-100 text-green-800">{q.resultLabel}</span>
                )}
              </div>

              {a && (
                <div className="bg-gray-50 rounded-xl px-3 py-2 mt-2 text-xs leading-relaxed text-gray-700">
                  <div>応募 {dt(a.appliedAt)}・{a.entryType ?? "種別なし"}・{a.inflow}</div>
                  {applicantSummary(a) && <div>{applicantSummary(a)}</div>}
                  <div className="text-gray-500">
                    {a.externalId ? "応募ID " + a.externalId : "応募IDなし（応募日時で探してください）"}
                    ／電話番号は転職道の管理画面で確認
                  </div>
                </div>
              )}

              <div className="text-[11px] text-gray-400 mt-2">
                {q.assignees.map(p => p.role + " " + p.name).join("　")}
              </div>

              {view === "done" ? (
                <div className="text-xs text-gray-600 mt-2">
                  {q.doneBy?.name ?? "-"}・{q.doneAt ? dt(q.doneAt) : ""}
                  {q.resultNote && <div className="mt-1 text-gray-800 whitespace-pre-wrap">「{q.resultNote}」</div>}
                </div>
              ) : lockedByOther ? (
                <div className="mt-3 rounded-xl bg-gray-100 text-gray-600 text-sm px-3 py-3 text-center">
                  🔒 {q.lockedBy?.name}さんが対応中（{q.lockedAt ? fmtTime.format(new Date(q.lockedAt)) : ""}〜）
                </div>
              ) : lockedByMe ? (
                <div className="mt-3">
                  <div className="text-xs text-gray-500 mb-1.5">電話の結果を選ぶ</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {RESULTS.map(r => (
                      <button
                        key={r.key}
                        type="button"
                        disabled={busy}
                        onClick={() => submit(q, r.key)}
                        className={
                          "min-h-[44px] rounded-xl text-xs px-2 disabled:opacity-50 " +
                          (r.primary ? "bg-[#185FA5] text-white font-bold" : "bg-white text-gray-700 border border-gray-300")
                        }
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <label htmlFor={"note-" + q.id} className="block text-[11px] text-gray-500 mt-2">
                    一言メモ{pendingNotNeeded === q.id ? "（電話不要の理由・必須）" : "（任意）"}
                  </label>
                  <input
                    id={"note-" + q.id}
                    type="text"
                    value={notes[q.id] ?? ""}
                    onChange={e => setNotes(n => ({ ...n, [q.id]: e.target.value }))}
                    placeholder="例：明日の面接を企業に依頼済み"
                    className="w-full min-h-[40px] mt-1 border border-gray-300 rounded-xl px-3 text-sm text-gray-900"
                  />
                  <button type="button" disabled={busy} onClick={() => unlock(q)} className="w-full mt-2 min-h-[40px] text-xs text-gray-500">
                    やめる（ほかの人が対応できるように戻す）
                  </button>
                </div>
              ) : q.canAct ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => lock(q)}
                  className="w-full mt-3 min-h-[48px] rounded-xl bg-[#185FA5] text-white text-sm font-bold disabled:opacity-50"
                >
                  電話する（自分を対応中にする）
                </button>
              ) : (
                <p className="mt-2 text-[11px] text-gray-400">担当ではないため、見るだけです</p>
              )}

              {errors[q.id] && <p className="text-xs text-red-600 mt-2">{errors[q.id]}</p>}
            </article>
          )
        })}
      </div>
    </div>
  )
}
