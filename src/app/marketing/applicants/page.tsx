// 置き場所: src/app/marketing/applicants/page.tsx
"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"

type Period = {
  label: string
  total: number
  withAge: number
  avgAge: number | null
  medianAge: number | null
  bands: number[]
  female: number
  withGender: number
  lic: number
  withLic: number
  unopened: number
  withOpened: number
}

const BAND_LABELS = ["〜20代", "30代", "40代", "50代", "60代", "70代〜"]
const BAND_COLORS = ["#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#1e3a8a"]

function pct(n: number, d: number, digits = 0): string {
  return d > 0 ? ((n / d) * 100).toFixed(digits) + "%" : "—"
}

/** 転職道全体の応募者の年齢層などの推移 */
export default function ApplicantTrendPage() {
  const [userName, setUserName] = useState("")
  const [unit, setUnit] = useState<"quarter" | "month">("quarter")
  const [excludeTel, setExcludeTel] = useState(true)
  const [periods, setPeriods] = useState<Period[] | null>(null)
  const [err, setErr] = useState("")

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => setUserName(s?.user?.name ?? ""))
  }, [])

  useEffect(() => {
    setPeriods(null)
    setErr("")
    fetch(`/api/marketing/applicants?unit=${unit}&excludeTel=${excludeTel ? "1" : "0"}`).then(async r => {
      const d = await r.json().catch(() => null)
      if (!r.ok || !d) { setErr(d?.error ?? "読み込めませんでした"); return }
      setPeriods(d.periods)
    })
  }, [unit, excludeTel])

  // 年齢の記入が少ない期間は構成がぶれるので、記入30件未満は薄く表示
  const MIN_AGE_SAMPLES = 30
  const shown = (periods ?? []).filter(p => p.total > 0)
  const withAgeAll = shown.reduce((s, p) => s + p.withAge, 0)
  const first = shown.find(p => p.withAge >= MIN_AGE_SAMPLES)
  const last = [...shown].reverse().find(p => p.withAge >= MIN_AGE_SAMPLES)

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-6xl">
          <h1 className="text-2xl font-bold text-gray-900">応募者の傾向</h1>
          <p className="text-sm text-gray-500 mt-0.5 mb-5">転職道全体の応募者の年齢層・性別・二種免許の推移</p>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-5 flex items-center gap-3 flex-wrap">
            <div className="flex gap-1">
              {(["quarter", "month"] as const).map(u => (
                <button key={u} type="button" onClick={() => setUnit(u)}
                  className={"px-3.5 py-1.5 text-xs rounded-full border " + (unit === u ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400")}>
                  {u === "quarter" ? "四半期ごと" : "月ごと"}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={excludeTel} onChange={e => setExcludeTel(e.target.checked)} className="w-4 h-4" />
              TEL応募を除く
            </label>
            <span className="text-xs text-gray-400">TEL応募は年齢が入っていないことが多いため、除くと構成の比較がしやすくなります</span>
          </div>

          {err && <div className="bg-white rounded-2xl border border-red-200 p-6 text-sm text-red-700">{err}</div>}
          {!periods && !err && <div className="text-sm text-gray-400 py-12 text-center">集計中...</div>}

          {periods && withAgeAll === 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-500">
              まだ年齢のデータがありません。翌朝の自動取り込み（または応募明細インポート）のあとに表示されます。
            </div>
          )}

          {periods && withAgeAll > 0 && (
            <>
              {/* 変化のまとめ */}
              {first && last && first.label !== last.label && (
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
                    <div className="text-xs text-gray-500">平均年齢</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {first.avgAge?.toFixed(1)} → {last.avgAge?.toFixed(1)}<span className="text-sm font-normal text-gray-400 ml-1">歳</span>
                    </div>
                    <div className="text-[11px] text-gray-400">{first.label} → {last.label}</div>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
                    <div className="text-xs text-gray-500">50代以上の割合</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {pct(first.bands[3] + first.bands[4] + first.bands[5], first.withAge)} → {pct(last.bands[3] + last.bands[4] + last.bands[5], last.withAge)}
                    </div>
                    <div className="text-[11px] text-gray-400">年齢の記入がある応募のうち</div>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
                    <div className="text-xs text-gray-500">女性の割合</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {pct(first.female, first.withGender, 1)} → {pct(last.female, last.withGender, 1)}
                    </div>
                    <div className="text-[11px] text-gray-400">性別の記入がある応募のうち</div>
                  </div>
                </div>
              )}

              {/* 年代構成の推移 */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-5">
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <h2 className="text-sm font-semibold text-gray-700">年代構成の推移</h2>
                  <div className="flex gap-3 text-[11px] text-gray-600 flex-wrap">
                    {BAND_LABELS.map((l, i) => (
                      <span key={l}><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ background: BAND_COLORS[i] }} />{l}</span>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {shown.map(p => {
                    const thin = p.withAge < MIN_AGE_SAMPLES
                    return (
                      <div key={p.label} className={"grid grid-cols-[5.5rem_1fr_9rem] items-center gap-3 " + (thin ? "opacity-40" : "")}>
                        <span className="text-xs text-gray-600 tabular-nums">{p.label}</span>
                        <div className="flex h-5 rounded overflow-hidden bg-gray-100">
                          {p.withAge > 0 && p.bands.map((b, i) => (
                            <div key={i} title={`${BAND_LABELS[i]} ${b}件（${pct(b, p.withAge)}）`}
                              style={{ width: (b / p.withAge) * 100 + "%", background: BAND_COLORS[i] }} />
                          ))}
                        </div>
                        <span className="text-xs text-gray-500 tabular-nums">
                          平均 {p.avgAge != null ? p.avgAge.toFixed(1) : "—"}歳
                          <span className="text-gray-300 ml-1">（{p.withAge}件）</span>
                        </span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[11px] text-gray-400 mt-3">年齢の記入がある応募だけで構成比を出しています。記入が{MIN_AGE_SAMPLES}件未満の期間は薄く表示しています。</p>
              </div>

              {/* 表 */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-500">
                      <th className="text-left px-4 py-3 font-medium">期間</th>
                      <th className="text-right px-3 py-3 font-medium">応募</th>
                      <th className="text-right px-3 py-3 font-medium">年齢の記入率</th>
                      <th className="text-right px-3 py-3 font-medium">平均年齢</th>
                      <th className="text-right px-3 py-3 font-medium">中央値</th>
                      {BAND_LABELS.map(l => <th key={l} className="text-right px-3 py-3 font-medium">{l}</th>)}
                      <th className="text-right px-3 py-3 font-medium">女性</th>
                      <th className="text-right px-3 py-3 font-medium">二種有り</th>
                      <th className="text-right px-4 py-3 font-medium">未開封</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[...shown].reverse().map(p => (
                      <tr key={p.label} className="hover:bg-gray-50">
                        <td className="px-4 py-2 tabular-nums text-gray-700">{p.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.total.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-500">{pct(p.withAge, p.total)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{p.avgAge != null ? p.avgAge.toFixed(1) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.medianAge != null ? p.medianAge.toFixed(0) : "—"}</td>
                        {p.bands.map((b, i) => (
                          <td key={i} className="px-3 py-2 text-right tabular-nums text-gray-600">{pct(b, p.withAge)}</td>
                        ))}
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">{pct(p.female, p.withGender, 1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">{pct(p.lic, p.withLic)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-600">{pct(p.unopened, p.withOpened)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">各割合は、その項目に記入がある応募を分母にしています。個人は特定できない形の集計です。</p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
