// 置き場所: src/components/ApplicantProfile.tsx
"use client"
import { useEffect, useState } from "react"

type Segment = { label: string; total: number; hired: number }
type SegmentSet = { age: Segment[]; license: Segment[]; total: number; hired: number }
type Data = {
  segments: { target: SegmentSet; area: SegmentSet | null; areaLabel: string | null }
  months: number
  total: number
  ages: { key: string; label: string; count: number; hired: number }[]
  withAge: number
  gender: { male: number; female: number; unknown: number }
  license2: { yes: number; no: number; unknown: number }
  opened: { opened: number; unopened: number; unknown: number }
  prefs: { pref: string; count: number }[]
  withPref: number
}

const PERIODS = [
  { months: 3, label: "直近3か月" },
  { months: 6, label: "直近6か月" },
  { months: 12, label: "直近12か月" },
]

function pct(n: number, d: number): string {
  return d > 0 ? Math.round((n / d) * 100) + "%" : "—"
}

/** 企業詳細「応募・実績」タブの、応募者の属性（年代・性別・二種・開封・居住地） */
export default function ApplicantProfile({ companyId }: { companyId: string }) {
  const [months, setMonths] = useState(12)
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState("")

  useEffect(() => {
    setData(null)
    setErr("")
    fetch("/api/companies/" + companyId + "/applicants?months=" + months).then(async r => {
      if (!r.ok) { setErr("応募者の情報を読み込めませんでした"); return }
      setData(await r.json())
    })
  }, [companyId, months])

  const maxAge = data ? Math.max(1, ...data.ages.map(a => a.count)) : 1

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-4">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-sm font-semibold text-gray-700">応募者の属性</h2>
        <div className="flex-1" />
        <div className="flex gap-1">
          {PERIODS.map(p => (
            <button key={p.months} type="button" onClick={() => setMonths(p.months)}
              className={"px-3 py-1 text-xs rounded-full border " + (months === p.months ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400")}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {!data && !err && <p className="text-sm text-gray-400 py-6 text-center">集計中...</p>}

      {data && data.total === 0 && <p className="text-sm text-gray-400 py-6 text-center">この期間の応募はありません</p>}

      {data && data.total > 0 && (
        <>
          {/* 企業開封 */}
          {data.opened.unopened > 0 && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
              <span className="text-2xl font-bold text-red-600">{data.opened.unopened}<span className="text-xs font-normal ml-1">件</span></span>
              <span className="text-sm text-red-700">の応募が、企業にまだ開封されていません（{pct(data.opened.unopened, data.total)}）。企業への確認をおすすめします。</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            {/* 年代 */}
            <div>
              <div className="text-xs text-gray-500 mb-2">年代（年齢の記入がある {data.withAge}件）</div>
              <div className="space-y-1.5">
                {data.ages.map(a => (
                  <div key={a.key} className="grid grid-cols-[4rem_1fr_4.5rem] items-center gap-2 text-sm">
                    <span className="text-gray-600">{a.label}</span>
                    <div className="h-3 bg-gray-100 rounded">
                      <div className="h-3 bg-blue-500 rounded" style={{ width: (a.count / maxAge) * 100 + "%" }} />
                    </div>
                    <span className="text-right tabular-nums text-gray-700">
                      {a.count}
                      {a.hired > 0 && <span className="text-[10px] text-green-600 ml-1">入社{a.hired}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 性別・二種・居住地 */}
            <div className="space-y-4">
              <div>
                <div className="text-xs text-gray-500 mb-1.5">性別</div>
                <div className="flex h-3 rounded overflow-hidden bg-gray-100">
                  <div className="bg-blue-500" style={{ width: pct(data.gender.male, data.total) }} />
                  <div className="bg-pink-400" style={{ width: pct(data.gender.female, data.total) }} />
                </div>
                <div className="flex gap-4 text-xs text-gray-600 mt-1">
                  <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />男性 {data.gender.male}（{pct(data.gender.male, data.total)}）</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-pink-400 mr-1" />女性 {data.gender.female}（{pct(data.gender.female, data.total)}）</span>
                  {data.gender.unknown > 0 && <span className="text-gray-400">不明 {data.gender.unknown}</span>}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1.5">二種免許</div>
                <div className="flex h-3 rounded overflow-hidden bg-gray-100">
                  <div className="bg-emerald-500" style={{ width: pct(data.license2.yes, data.total) }} />
                  <div className="bg-gray-400" style={{ width: pct(data.license2.no, data.total) }} />
                </div>
                <div className="flex gap-4 text-xs text-gray-600 mt-1">
                  <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />有り {data.license2.yes}</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-gray-400 mr-1" />無し {data.license2.no}</span>
                  {data.license2.unknown > 0 && <span className="text-gray-400">未記入 {data.license2.unknown}</span>}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1.5">応募者の居住地（住所の記入がある {data.withPref}件）</div>
                {data.prefs.length === 0 ? (
                  <p className="text-xs text-gray-400">記入がありません</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {data.prefs.map(p => (
                      <span key={p.pref} className="text-xs bg-gray-100 text-gray-700 rounded-full px-2.5 py-1">{p.pref} {p.count}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* 年代別・二種別の入社率 */}
          <div className="grid grid-cols-2 gap-6 mt-6 pt-5 border-t border-gray-100">
            {([
              { title: "年代別の入社率", key: "age" as const },
              { title: "二種免許の有無別の入社率", key: "license" as const },
            ]).map(block => (
              <div key={block.key}>
                <div className="text-xs text-gray-500 mb-2">{block.title}</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-gray-400 border-b border-gray-100">
                      <th className="text-left py-1 font-normal">区分</th>
                      <th className="text-right py-1 font-normal">応募</th>
                      <th className="text-right py-1 font-normal">入社</th>
                      <th className="text-right py-1 font-normal">入社率</th>
                      {data.segments.area && <th className="text-right py-1 font-normal">{data.segments.areaLabel}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.segments.target[block.key].map((r, i) => {
                      const a = data.segments.area?.[block.key][i]
                      if (r.total === 0 && (!a || a.total === 0)) return null
                      const rate = r.total > 0 ? r.hired / r.total : null
                      const aRate = a && a.total > 0 ? a.hired / a.total : null
                      const diff = rate != null && aRate != null && r.total >= 5 ? (rate - aRate) * 100 : null
                      return (
                        <tr key={r.label} className={r.total < 5 ? "text-gray-400" : ""}>
                          <td className="py-1">{r.label}</td>
                          <td className="py-1 text-right tabular-nums">{r.total}</td>
                          <td className="py-1 text-right tabular-nums">{r.hired}</td>
                          <td className="py-1 text-right tabular-nums font-medium">{pct(r.hired, r.total)}</td>
                          {data.segments.area && (
                            <td className="py-1 text-right tabular-nums text-xs text-gray-500">
                              {a ? pct(a.hired, a.total) : "—"}
                              {diff != null && Math.abs(diff) >= 0.5 && (
                                <span className={"ml-1 " + (diff > 0 ? "text-emerald-600" : "text-rose-600")}>{diff > 0 ? "▲" : "▼"}</span>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-gray-400 mt-4">応募 {data.total}件の集計です。個人は特定できない形で表示しています。応募5件未満の行は灰色にしています（率がぶれやすいため）。</p>
        </>
      )}
    </div>
  )
}
