// 置き場所: src/app/marketing/applicants/page.tsx
"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useMemo, useState } from "react"

type Stats = {
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
  hired: number
}
type Period = Stats & { label: string }
type Group = Stats & { key: string }

const BAND_LABELS = ["〜20代", "30代", "40代", "50代", "60代", "70代〜"]
const BAND_COLORS = ["#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#1e3a8a"]
/** 年齢の記入がこれ未満の行は、構成がぶれるので薄く表示 */
const MIN_AGE_SAMPLES = 30

function ratio(n: number, d: number): number | null {
  return d > 0 ? n / d : null
}
function pct(n: number, d: number, digits = 0): string {
  return d > 0 ? ((n / d) * 100).toFixed(digits) + "%" : "—"
}
function older(s: Stats): number {
  return s.bands[3] + s.bands[4] + s.bands[5]
}

/** 年代構成の横棒 */
function AgeBar({ s }: { s: Stats }) {
  return (
    <div className="flex h-4 rounded overflow-hidden bg-gray-100 min-w-[8rem]">
      {s.withAge > 0 && s.bands.map((b, i) => (
        <div key={i} title={`${BAND_LABELS[i]} ${b}件（${pct(b, s.withAge)}）`}
          style={{ width: (b / s.withAge) * 100 + "%", background: BAND_COLORS[i] }} />
      ))}
    </div>
  )
}

type SortKey = "key" | "total" | "avgAge" | "older" | "female" | "lic" | "unopened" | "hireRate"

/** 転職道全体の応募者の傾向（推移・流入元／エリア別の比較） */
export default function ApplicantTrendPage() {
  const [userName, setUserName] = useState("")
  const [view, setView] = useState<"trend" | "compare">("trend")
  const [unit, setUnit] = useState<"quarter" | "month">("quarter")
  const [groupBy, setGroupBy] = useState<"inflow" | "pref">("inflow")
  const [months, setMonths] = useState(12)
  const [excludeTel, setExcludeTel] = useState(true)
  const [inflow, setInflow] = useState("")
  const [pref, setPref] = useState("")
  const [prefMode, setPrefMode] = useState<"company" | "applicant">("company")
  const [sortKey, setSortKey] = useState<SortKey>("total")
  const [sortDesc, setSortDesc] = useState(true)

  const [periods, setPeriods] = useState<Period[] | null>(null)
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [options, setOptions] = useState<{ inflows: string[]; prefs: string[] }>({ inflows: [], prefs: [] })
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => setUserName(s?.user?.name ?? ""))
  }, [])

  useEffect(() => {
    setLoading(true)
    setErr("")
    const q = new URLSearchParams({
      view, unit, groupBy, months: String(months), excludeTel: excludeTel ? "1" : "0", prefMode,
    })
    if (inflow) q.set("inflow", inflow)
    if (pref) q.set("pref", pref)
    fetch("/api/marketing/applicants?" + q.toString()).then(async r => {
      const d = await r.json().catch(() => null)
      setLoading(false)
      if (!r.ok || !d) { setErr(d?.error ?? "読み込めませんでした"); return }
      setOptions(d.options)
      if (d.view === "trend") setPeriods(d.periods)
      else setGroups(d.groups)
    })
  }, [view, unit, groupBy, months, excludeTel, inflow, pref, prefMode])

  // ===== 推移 =====
  const shown = (periods ?? []).filter(p => p.total > 0)
  const first = shown.find(p => p.withAge >= MIN_AGE_SAMPLES)
  const last = [...shown].reverse().find(p => p.withAge >= MIN_AGE_SAMPLES)

  // ===== 比較（並べ替え） =====
  const sortedGroups = useMemo(() => {
    const list = [...(groups ?? [])]
    const val = (g: Group): number | string => {
      switch (sortKey) {
        case "key": return g.key
        case "total": return g.total
        case "avgAge": return g.avgAge ?? -1
        case "older": return ratio(older(g), g.withAge) ?? -1
        case "female": return ratio(g.female, g.withGender) ?? -1
        case "lic": return ratio(g.lic, g.withLic) ?? -1
        case "unopened": return ratio(g.unopened, g.withOpened) ?? -1
        case "hireRate": return ratio(g.hired, g.total) ?? -1
      }
    }
    list.sort((a, b) => {
      const va = val(a), vb = val(b)
      const c = typeof va === "string" ? va.localeCompare(vb as string, "ja") : (va as number) - (vb as number)
      return sortDesc ? -c : c
    })
    return list
  }, [groups, sortKey, sortDesc])

  const clickSort = (k: SortKey) => {
    if (sortKey === k) setSortDesc(!sortDesc)
    else { setSortKey(k); setSortDesc(k !== "key") }
  }
  const sortTh = (k: SortKey, label: string, align: "left" | "right" = "right") => (
    <th key={k} className={"px-3 py-3 font-medium cursor-pointer select-none hover:text-gray-800 " + (align === "left" ? "text-left" : "text-right")} onClick={() => clickSort(k)}>
      {label}
      <span className="text-[10px] ml-0.5">{sortKey === k ? (sortDesc ? "▼" : "▲") : ""}</span>
    </th>
  )

  const filterLabel = [inflow && "流入元：" + inflow, pref && (prefMode === "company" ? "企業の所在地：" : "応募者の居住地：") + pref]
    .filter(Boolean).join(" ／ ")

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-7xl">
          <h1 className="text-2xl font-bold text-gray-900">応募者の傾向</h1>
          <p className="text-sm text-gray-500 mt-0.5 mb-5">転職道全体の応募者の年齢層・性別・二種免許の推移と、流入元・エリアごとの違い</p>

          {/* 表示の切り替え */}
          <div className="flex gap-1 border-b border-gray-200 mb-4">
            {[
              { key: "trend", label: "推移を見る" },
              { key: "compare", label: "流入元・エリアで比べる" },
            ].map(t => (
              <button key={t.key} type="button" onClick={() => setView(t.key as typeof view)}
                className={"px-4 py-2.5 text-sm -mb-px border-b-2 " + (view === t.key ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500 hover:text-gray-700")}>
                {t.label}
              </button>
            ))}
          </div>

          {/* 絞り込み */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-5 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <select value={inflow} onChange={e => setInflow(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 bg-white max-w-[14rem]">
                <option value="">すべての流入元</option>
                {options.inflows.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
              <select value={pref} onChange={e => setPref(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 bg-white">
                <option value="">すべてのエリア</option>
                {options.prefs.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <div className="flex gap-1">
                {([
                  { key: "company", label: "企業の所在地" },
                  { key: "applicant", label: "応募者の居住地" },
                ] as const).map(m => (
                  <button key={m.key} type="button" onClick={() => { setPrefMode(m.key); setPref("") }}
                    className={"px-3 py-1.5 text-xs rounded-full border " + (prefMode === m.key ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400")}>
                    エリア＝{m.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={excludeTel} onChange={e => setExcludeTel(e.target.checked)} className="w-4 h-4" />
                TEL応募を除く
              </label>
              {(inflow || pref) && (
                <button type="button" onClick={() => { setInflow(""); setPref("") }} className="text-xs text-gray-400 hover:text-gray-600 underline">絞り込みを解除</button>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap pt-3 border-t border-gray-100">
              {view === "trend" ? (
                <div className="flex gap-1">
                  {(["quarter", "month"] as const).map(u => (
                    <button key={u} type="button" onClick={() => setUnit(u)}
                      className={"px-3.5 py-1.5 text-xs rounded-full border " + (unit === u ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400")}>
                      {u === "quarter" ? "四半期ごと" : "月ごと"}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex gap-1">
                    {([
                      { key: "inflow", label: "流入元ごと" },
                      { key: "pref", label: "エリアごと" },
                    ] as const).map(g => (
                      <button key={g.key} type="button" onClick={() => setGroupBy(g.key)}
                        className={"px-3.5 py-1.5 text-xs rounded-full border " + (groupBy === g.key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400")}>
                        {g.label}
                      </button>
                    ))}
                  </div>
                  <select value={months} onChange={e => setMonths(Number(e.target.value))} className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 bg-white">
                    {[3, 6, 12, 24, 36].map(m => <option key={m} value={m}>直近{m}か月</option>)}
                  </select>
                  <span className="text-xs text-gray-400">列の見出しを押すと並べ替えられます</span>
                </>
              )}
              {filterLabel && <span className="ml-auto text-xs text-blue-700">{filterLabel}</span>}
            </div>
          </div>

          {err && <div className="bg-white rounded-2xl border border-red-200 p-6 text-sm text-red-700 mb-4">{err}</div>}
          {loading && <div className="text-sm text-gray-400 py-12 text-center">集計中...</div>}

          {/* ===== 推移 ===== */}
          {!loading && view === "trend" && periods && (
            shown.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-500">該当する応募がありません</div>
            ) : (
              <>
                {first && last && first.label !== last.label && (
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
                      <div className="text-xs text-gray-500">平均年齢</div>
                      <div className="text-2xl font-bold text-gray-900">{first.avgAge?.toFixed(1)} → {last.avgAge?.toFixed(1)}<span className="text-sm font-normal text-gray-400 ml-1">歳</span></div>
                      <div className="text-[11px] text-gray-400">{first.label} → {last.label}</div>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
                      <div className="text-xs text-gray-500">50代以上の割合</div>
                      <div className="text-2xl font-bold text-gray-900">{pct(older(first), first.withAge)} → {pct(older(last), last.withAge)}</div>
                      <div className="text-[11px] text-gray-400">年齢の記入がある応募のうち</div>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
                      <div className="text-xs text-gray-500">女性の割合</div>
                      <div className="text-2xl font-bold text-gray-900">{pct(first.female, first.withGender, 1)} → {pct(last.female, last.withGender, 1)}</div>
                      <div className="text-[11px] text-gray-400">性別の記入がある応募のうち</div>
                    </div>
                  </div>
                )}

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
                    {shown.map(p => (
                      <div key={p.label} className={"grid grid-cols-[5.5rem_1fr_9rem] items-center gap-3 " + (p.withAge < MIN_AGE_SAMPLES ? "opacity-40" : "")}>
                        <span className="text-xs text-gray-600 tabular-nums">{p.label}</span>
                        <AgeBar s={p} />
                        <span className="text-xs text-gray-500 tabular-nums">平均 {p.avgAge != null ? p.avgAge.toFixed(1) : "—"}歳<span className="text-gray-300 ml-1">（{p.withAge}件）</span></span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-3">年齢の記入がある応募だけで構成比を出しています。記入が{MIN_AGE_SAMPLES}件未満の期間は薄く表示しています。</p>
                </div>

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
                        <th className="text-right px-3 py-3 font-medium">入社率</th>
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
                          {p.bands.map((b, i) => <td key={i} className="px-3 py-2 text-right tabular-nums text-gray-600">{pct(b, p.withAge)}</td>)}
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600">{pct(p.female, p.withGender, 1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600">{pct(p.lic, p.withLic)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600">{pct(p.hired, p.total, 1)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-gray-600">{pct(p.unopened, p.withOpened)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          )}

          {/* ===== 比較 ===== */}
          {!loading && view === "compare" && groups && (
            sortedGroups.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-500">該当する応募がありません</div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-500">
                      {sortTh("key", groupBy === "inflow" ? "流入元" : (prefMode === "company" ? "企業の所在地" : "応募者の居住地"), "left")}
                      {sortTh("total", "応募")}
                      <th className="text-left px-3 py-3 font-medium">年代構成</th>
                      {sortTh("avgAge", "平均年齢")}
                      {sortTh("older", "50代以上")}
                      {sortTh("female", "女性")}
                      {sortTh("lic", "二種有り")}
                      {sortTh("hireRate", "入社率")}
                      {sortTh("unopened", "未開封")}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedGroups.map(g => (
                      <tr key={g.key} className={"hover:bg-gray-50 " + (g.withAge < MIN_AGE_SAMPLES ? "text-gray-400" : "")}>
                        <td className="px-3 py-2.5">
                          <button type="button" className="text-left hover:text-blue-600 hover:underline"
                            onClick={() => { if (groupBy === "inflow") setInflow(g.key); else if (g.key !== "不明") setPref(g.key); setView("trend") }}
                            title="この条件で推移を見る">
                            {g.key}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{g.total.toLocaleString()}</td>
                        <td className="px-3 py-2.5 w-48"><AgeBar s={g} /></td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium">{g.avgAge != null ? g.avgAge.toFixed(1) : "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{pct(older(g), g.withAge)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{pct(g.female, g.withGender, 1)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{pct(g.lic, g.withLic)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{pct(g.hired, g.total, 1)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{pct(g.unopened, g.withOpened)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-gray-400 px-4 py-2 border-t border-gray-100">
                  名前を押すと、その条件で推移を表示します。年齢の記入が{MIN_AGE_SAMPLES}件未満の行は灰色にしています（割合がぶれやすいため）。
                </p>
              </div>
            )
          )}
        </div>
      </main>
    </div>
  )
}
