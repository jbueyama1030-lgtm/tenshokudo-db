// 置き場所: src/app/import/ad-costs/sheet/page.tsx
"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useMemo, useState } from "react"
import { currentFiscalYear, parseSheet, splitYm, type SheetItem } from "@/lib/adCostSheet"

type Mode = "direct" | "overhead" | "split" | "skip"
type Mapping = {
  sourceName: string
  mode: Mode
  adName: string
  inflow: string
  splitAName: string
  splitAInflow: string
  splitBName: string
  splitBInflow: string
}
type Existing = { name: string; inflow: string | null; category: string; year: number; month: number; totalCost: number | null }
type History = { name: string; inflow: string | null; category: string }

const MODE_LABELS: Record<Mode, string> = {
  direct: "流入元に紐づける",
  overhead: "全体費（流入元なし）",
  split: "2つに分ける",
  skip: "取り込まない",
}

function yen(n: number | null | undefined): string {
  return n == null ? "—" : "¥" + Math.round(n).toLocaleString("ja-JP")
}
function monthLabel(ym: string): string {
  const { year, month } = splitYm(ym)
  return `${year}年${month}月`
}
/** APIの取り込み方（null を含む）を画面用にそろえる */
function normalizeMapping(m: Partial<Record<keyof Mapping, string | null>>): Mapping {
  return {
    sourceName: m.sourceName ?? "",
    mode: (["direct", "overhead", "split", "skip"].includes(m.mode ?? "") ? m.mode : "direct") as Mode,
    adName: m.adName ?? "", inflow: m.inflow ?? "",
    splitAName: m.splitAName ?? "", splitAInflow: m.splitAInflow ?? "",
    splitBName: m.splitBName ?? "", splitBInflow: m.splitBInflow ?? "",
  }
}

/** 「※上山」などの注記や空白を除いた比較用の名前 */
function norm(s: string): string {
  return s.replace(/※.*$/, "").replace(/[\s\u3000]/g, "").trim()
}

/** 過去の明細名・保存済みの取り込み方から、最初の取り込み方を推測する */
function suggest(item: SheetItem, saved: Mapping | undefined, history: History[]): Mapping {
  if (saved) return saved
  const base: Mapping = { sourceName: item.name, mode: "direct", adName: item.name, inflow: "", splitAName: "", splitAInflow: "", splitBName: "", splitBInflow: "" }

  // プライムサーブ（indeed＋ と indeed エントリーに分ける）
  if (item.name.includes("プライムサーブ")) {
    const a = history.find(h => h.name.includes("プライムサーブ") && (h.inflow ?? "").includes("＋"))
    const b = history.find(h => h.name.includes("プライムサーブ") && h.name.includes("エントリー"))
    return {
      ...base,
      mode: "split",
      splitAName: a?.name ?? "プライムサーブ（indeed＋）運用費を入れる",
      splitAInflow: a?.inflow ?? "indeed＋",
      splitBName: b?.name ?? "プライムサーブ（indeedエントリー）運用費を入れる",
      splitBInflow: b?.inflow ?? "indeed",
    }
  }

  const n = norm(item.name)
  const hit =
    history.find(h => h.name === item.name) ??
    history.find(h => norm(h.name) === n) ??
    history.find(h => norm(h.name).startsWith(n) || n.startsWith(norm(h.name)))
  if (hit) {
    return { ...base, adName: hit.name, mode: hit.category === "overhead" ? "overhead" : "direct", inflow: hit.inflow ?? "" }
  }
  return base
}

export default function AdCostSheetImportPage() {
  const [userName, setUserName] = useState("")
  const [fy, setFy] = useState(currentFiscalYear())
  const [text, setText] = useState("")
  const [items, setItems] = useState<SheetItem[] | null>(null)
  const [parseErr, setParseErr] = useState("")
  const [mappings, setMappings] = useState<Record<string, Mapping>>({})
  const [existing, setExisting] = useState<Existing[]>([])
  const [history, setHistory] = useState<History[]>([])
  const [inflows, setInflows] = useState<string[]>([])
  const [savedMappings, setSavedMappings] = useState<Mapping[]>([])
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set())
  // 分割の A の金額（"明細名|2026-05" → 金額）
  const [splitA, setSplitA] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState("")
  const [err, setErr] = useState("")

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => setUserName(s?.user?.name ?? ""))
  }, [])

  // 年度が変わったら、保存済みの取り込み方と既存の広告費を読み直す
  useEffect(() => {
    fetch("/api/ad-costs/sheet?fy=" + fy).then(async r => {
      const d = await r.json().catch(() => null)
      if (!r.ok || !d) { setErr(d?.error ?? "読み込めませんでした"); return }
      setExisting(d.existing)
      setHistory(d.history)
      setInflows(d.inflows)
      setSavedMappings(d.mappings.map(normalizeMapping))
    })
  }, [fy])

  const read = () => {
    setResult("")
    const r = parseSheet(text, fy)
    if (r.error) { setParseErr(r.error); setItems(null); return }
    setParseErr("")
    const withData = r.items.filter(i => Object.keys(i.amounts).length > 0)
    setItems(withData)
    const m: Record<string, Mapping> = {}
    for (const it of withData) {
      const saved = savedMappings.find(s => s.sourceName === it.name)
      // 保存済みでも名前が空なら明細名を入れておく
      m[it.name] = suggest(it, saved ? { ...saved, adName: saved.adName || it.name } : undefined, history)
    }
    setMappings(m)
    // 最初は「金額がある月のうち、まだDBに広告費が入っていない月」を選んでおく
    const monthsWithData = Array.from(new Set(withData.flatMap(i => Object.keys(i.amounts)))).sort()
    const filled = new Set(existing.map(e => `${e.year}-${String(e.month).padStart(2, "0")}`))
    const initial = monthsWithData.filter(ym => !filled.has(ym))
    setSelectedMonths(new Set(initial.length > 0 ? initial : monthsWithData.slice(-1)))
  }

  const monthsWithData = useMemo(
    () => (items ? Array.from(new Set(items.flatMap(i => Object.keys(i.amounts)))).sort() : []),
    [items],
  )
  const months = monthsWithData.filter(m => selectedMonths.has(m))

  const setMap = (name: string, patch: Partial<Mapping>) => setMappings(prev => ({ ...prev, [name]: { ...prev[name], ...patch } }))

  // ===== 取り込む行を組み立てる =====
  type OutRow = { name: string; inflow: string | null; category: string; year: number; month: number; totalCost: number; source: string }
  const { outRows, problems } = useMemo(() => {
    const out: OutRow[] = []
    const probs: string[] = []
    for (const it of items ?? []) {
      const m = mappings[it.name]
      if (!m || m.mode === "skip") continue
      for (const ym of months) {
        const amount = it.amounts[ym]
        if (amount == null) continue
        const { year, month } = splitYm(ym)
        if (m.mode === "split") {
          const aRaw = splitA[it.name + "|" + ym]
          if (aRaw == null || aRaw === "") { probs.push(`${it.name}（${monthLabel(ym)}）：${m.splitAName || "A"} の金額が未入力`); continue }
          const a = Number(aRaw)
          if (!Number.isFinite(a) || a < 0 || a > amount) { probs.push(`${it.name}（${monthLabel(ym)}）：分ける金額が合計を超えています`); continue }
          out.push({ name: m.splitAName || it.name + "（A）", inflow: m.splitAInflow || null, category: "direct", year, month, totalCost: a, source: it.name })
          out.push({ name: m.splitBName || it.name + "（B）", inflow: m.splitBInflow || null, category: "direct", year, month, totalCost: amount - a, source: it.name })
        } else {
          if (m.mode === "direct" && !m.inflow) probs.push(`${it.name}：流入元が未選択`)
          out.push({
            name: m.adName || it.name,
            inflow: m.mode === "overhead" ? null : m.inflow || null,
            category: m.mode === "overhead" ? "overhead" : "direct",
            year, month, totalCost: amount, source: it.name,
          })
        }
      }
    }
    return { outRows: out, problems: Array.from(new Set(probs)) }
  }, [items, mappings, months, splitA])

  const existingKey = (name: string, year: number, month: number) => existing.find(e => e.name === name && e.year === year && e.month === month)

  const runImport = async () => {
    if (problems.length > 0 || outRows.length === 0) return
    if (!confirm(`${months.map(monthLabel).join("・")} の広告費 ${outRows.length}行を取り込みます。よろしいですか？`)) return
    setSaving(true)
    setErr("")
    const res = await fetch("/api/ad-costs/sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: outRows.map(({ source, ...r }) => r),
        mappings: Object.values(mappings),
      }),
    })
    setSaving(false)
    const d = await res.json().catch(() => null)
    if (!res.ok || !d) { setErr(d?.error ?? "取り込みに失敗しました"); return }
    setResult(`取り込みました（追加 ${d.created}行・上書き ${d.updated}行）。取り込み方は次回のために保存しました。`)
    // 既存データを読み直す
    const r2 = await fetch("/api/ad-costs/sheet?fy=" + fy)
    const d2 = await r2.json().catch(() => null)
    if (d2) { setExisting(d2.existing); setSavedMappings(d2.mappings.map(normalizeMapping)) }
  }

  const splitItems = (items ?? []).filter(it => mappings[it.name]?.mode === "split" && months.some(ym => it.amounts[ym] != null))

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-6xl">
          <h1 className="text-2xl font-bold text-gray-900">広告費を損益表から取り込む</h1>
          <p className="text-sm text-gray-500 mt-0.5 mb-5">損益表の「■広告費（転職道）」の表を貼り付けると、月ごとの広告費としてそのまま取り込めます</p>

          {err && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">{err}</div>}
          {result && <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-sm text-green-800">{result}</div>}

          {/* 1. 貼り付け */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">1. 損益表を貼り付ける</h2>
            <p className="text-xs text-gray-500 mb-3">
              スプレッドシートで、月の見出しの行（05月・06月…）から「■広告費（転職道）」の明細の最後の行までを選んでコピーし、下に貼り付けてください。列は明細名・種別・各月が入っていればOKです（チェック欄や合計の列が入っていても大丈夫です）。TSJ や外注費の行が入っていても、読み込みません。
            </p>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs text-gray-500">年度</label>
              <select value={fy} onChange={e => setFy(Number(e.target.value))} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900">
                {[0, -1, -2, 1].map(d => {
                  const y = currentFiscalYear() + d
                  return <option key={y} value={y}>{y}年度（{y}年5月〜{y + 1}年4月）</option>
                })}
              </select>
            </div>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={6} placeholder="ここに貼り付け（Ctrl + V）"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono text-gray-900" />
            {parseErr && <p className="text-xs text-red-600 mt-1">{parseErr}</p>}
            <button type="button" onClick={read} disabled={!text.trim()} className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">読み込む</button>
          </section>

          {items && (
            <>
              {/* 2. 月を選ぶ */}
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-1">2. 取り込む月を選ぶ</h2>
                <p className="text-xs text-gray-500 mb-3">● はDBにすでに広告費が入っている月です。選んだ月だけ取り込みます（同じ明細はすべて上書き）。</p>
                <div className="flex flex-wrap gap-2">
                  {monthsWithData.map(ym => {
                    const { year, month } = splitYm(ym)
                    const filled = existing.some(e => e.year === year && e.month === month)
                    const on = selectedMonths.has(ym)
                    return (
                      <button key={ym} type="button" onClick={() => {
                        const next = new Set(selectedMonths)
                        if (on) next.delete(ym)
                        else next.add(ym)
                        setSelectedMonths(next)
                      }}
                        className={"px-3 py-1.5 rounded-full text-xs border " + (on ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400")}>
                        {monthLabel(ym)}{filled && <span className={on ? "ml-1 text-blue-100" : "ml-1 text-gray-400"}>●</span>}
                      </button>
                    )
                  })}
                </div>
              </section>

              {/* 3. 取り込み方 */}
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-1">3. 明細ごとの取り込み方</h2>
                <p className="text-xs text-gray-500 mb-3">過去の広告費から自動で引き継いでいます。新しい明細や違っているところだけ直してください。設定は次回のために保存されます。</p>
                <datalist id="inflow-options">{inflows.map(i => <option key={i} value={i} />)}</datalist>
                <div className="divide-y divide-gray-100">
                  {items.map(it => {
                    const m = mappings[it.name]
                    if (!m) return null
                    const total = months.reduce((s, ym) => s + (it.amounts[ym] ?? 0), 0)
                    const isNew = !savedMappings.some(s => s.sourceName === it.name) && !history.some(h => h.name === (m.adName || it.name))
                    return (
                      <div key={it.name} className={"py-3 " + (m.mode === "skip" ? "opacity-50" : "")}>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="min-w-[14rem] flex-1">
                            <div className="text-sm font-medium text-gray-900">
                              {it.name}
                              {isNew && m.mode !== "skip" && <span className="ml-2 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">新しい明細</span>}
                            </div>
                            <div className="text-[11px] text-gray-400">{it.kind}{months.length > 0 && <span className="ml-2">選んだ月の合計 {yen(total)}</span>}</div>
                          </div>
                          <select value={m.mode} onChange={e => setMap(it.name, { mode: e.target.value as Mode })} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900">
                            {(Object.keys(MODE_LABELS) as Mode[]).map(k => <option key={k} value={k}>{MODE_LABELS[k]}</option>)}
                          </select>
                          {m.mode === "direct" && (
                            <input list="inflow-options" value={m.inflow} onChange={e => setMap(it.name, { inflow: e.target.value })} placeholder="流入元を選ぶ"
                              className={"w-44 border rounded-lg px-2 py-1.5 text-sm text-gray-900 " + (m.inflow ? "border-gray-200" : "border-red-300 bg-red-50")} />
                          )}
                        </div>
                        {(m.mode === "direct" || m.mode === "overhead") && (
                          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-400">
                            DBでの明細名
                            <input value={m.adName} onChange={e => setMap(it.name, { adName: e.target.value })} className="flex-1 max-w-md border border-gray-200 rounded px-2 py-1 text-xs text-gray-700" />
                          </div>
                        )}
                        {m.mode === "split" && (
                          <div className="mt-2 grid grid-cols-2 gap-3 bg-gray-50 rounded-lg p-3">
                            {(["A", "B"] as const).map(k => (
                              <div key={k}>
                                <div className="text-[11px] text-gray-500 mb-1">{k === "A" ? "A：入力した金額を入れる明細" : "B：残り（合計 − A）を入れる明細"}</div>
                                <input value={k === "A" ? m.splitAName : m.splitBName} onChange={e => setMap(it.name, k === "A" ? { splitAName: e.target.value } : { splitBName: e.target.value })}
                                  placeholder="DBでの明細名" className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 mb-1" />
                                <input list="inflow-options" value={k === "A" ? m.splitAInflow : m.splitBInflow} onChange={e => setMap(it.name, k === "A" ? { splitAInflow: e.target.value } : { splitBInflow: e.target.value })}
                                  placeholder="流入元" className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-700" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* 4. 分ける金額 */}
              {splitItems.length > 0 && (
                <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-5">
                  <h2 className="text-sm font-semibold text-gray-700 mb-1">4. 分ける金額を入れる</h2>
                  <p className="text-xs text-gray-500 mb-3">
                    プライムサーブは、運用会社のレポート（直接投稿）の<strong>転職道分（TS・TA・TB）の費用の合計</strong>を A に入れてください。残りが自動で B（フィード＝indeed）になります。
                  </p>
                  {splitItems.map(it => {
                    const m = mappings[it.name]
                    return (
                      <div key={it.name} className="mb-3">
                        <div className="text-sm font-medium text-gray-900 mb-1.5">{it.name}</div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[11px] text-gray-400 border-b border-gray-100">
                              <th className="text-left py-1 font-normal">月</th>
                              <th className="text-right py-1 font-normal">損益表の合計</th>
                              <th className="text-right py-1 font-normal">A：{m.splitAInflow || m.splitAName}</th>
                              <th className="text-right py-1 font-normal">B：{m.splitBInflow || m.splitBName}（自動）</th>
                            </tr>
                          </thead>
                          <tbody>
                            {months.filter(ym => it.amounts[ym] != null).map(ym => {
                              const key = it.name + "|" + ym
                              const total = it.amounts[ym]
                              const a = splitA[key]
                              const b = a !== undefined && a !== "" && Number.isFinite(Number(a)) ? total - Number(a) : null
                              // 前回の値（DBに入っている A の金額）を候補として表示
                              const { year, month } = splitYm(ym)
                              const prevA = existingKey(m.splitAName, year, month)?.totalCost
                              return (
                                <tr key={ym} className="border-b border-gray-50">
                                  <td className="py-1.5">{monthLabel(ym)}</td>
                                  <td className="py-1.5 text-right tabular-nums">{yen(total)}</td>
                                  <td className="py-1.5 text-right">
                                    <input type="number" value={a ?? ""} onChange={e => setSplitA(prev => ({ ...prev, [key]: e.target.value }))}
                                      placeholder={prevA != null ? String(prevA) : "金額"}
                                      className={"w-36 border rounded px-2 py-1 text-sm text-right " + (a ? "border-gray-200" : "border-red-300 bg-red-50")} />
                                    {prevA != null && !a && (
                                      <button type="button" onClick={() => setSplitA(prev => ({ ...prev, [key]: String(prevA) }))} className="ml-1 text-[11px] text-blue-600 hover:underline">今の値を使う</button>
                                    )}
                                  </td>
                                  <td className={"py-1.5 text-right tabular-nums " + (b != null && b < 0 ? "text-red-600" : "")}>{b != null ? yen(b) : "—"}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  })}
                </section>
              )}

              {/* 5. 確認して取り込む */}
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-8">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">{splitItems.length > 0 ? "5" : "4"}. 確認して取り込む</h2>
                {months.length === 0 ? (
                  <p className="text-sm text-gray-400">取り込む月を選んでください</p>
                ) : (
                  <>
                    {months.map(ym => {
                      const { year, month } = splitYm(ym)
                      const rows = outRows.filter(r => r.year === year && r.month === month)
                      const total = rows.reduce((s, r) => s + r.totalCost, 0)
                      const prevTotal = existing.filter(e => e.year === year && e.month === month).reduce((s, e) => s + (e.totalCost ?? 0), 0)
                      return (
                        <div key={ym} className="mb-5">
                          <div className="flex items-baseline gap-3 mb-1">
                            <span className="text-sm font-semibold text-gray-800">{monthLabel(ym)}</span>
                            <span className="text-xs text-gray-500">取り込む合計 {yen(total)}</span>
                            {prevTotal > 0 && <span className="text-xs text-gray-400">（今のDBの合計 {yen(prevTotal)}）</span>}
                          </div>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-[11px] text-gray-400 border-b border-gray-100">
                                <th className="text-left py-1 font-normal">DBでの明細名</th>
                                <th className="text-left py-1 font-normal">流入元</th>
                                <th className="text-right py-1 font-normal">今の金額</th>
                                <th className="text-right py-1 font-normal">取り込む金額</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map(r => {
                                const ex = existingKey(r.name, r.year, r.month)
                                const changed = !ex || ex.totalCost !== r.totalCost
                                return (
                                  <tr key={r.name} className="border-b border-gray-50">
                                    <td className="py-1.5 text-gray-800">{r.name}</td>
                                    <td className="py-1.5 text-gray-500 text-xs">{r.category === "overhead" ? "全体費" : r.inflow || "—"}</td>
                                    <td className="py-1.5 text-right tabular-nums text-gray-400">{ex ? yen(ex.totalCost) : "新規"}</td>
                                    <td className={"py-1.5 text-right tabular-nums " + (changed ? "font-semibold text-blue-700" : "text-gray-500")}>{yen(r.totalCost)}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )
                    })}

                    {problems.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-xs text-amber-800">
                        <div className="font-medium mb-1">取り込む前に直してください</div>
                        <ul className="list-disc pl-4 space-y-0.5">{problems.map(p => <li key={p}>{p}</li>)}</ul>
                      </div>
                    )}
                    <button type="button" onClick={runImport} disabled={saving || problems.length > 0 || outRows.length === 0}
                      className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                      {saving ? "取り込み中..." : `取り込む（${outRows.length}行）`}
                    </button>
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
