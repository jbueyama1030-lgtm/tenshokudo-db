"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"

// ===== API の返り値（src/lib/funnelAnalysis.ts と同じ形） =====
type YearMonth = { year: number; month: number }
type Period = { from: YearMonth; to: YearMonth }
type FunnelCounts = {
  apply: number
  interviewSet: number
  interviewDone: number
  hired: number
  rejected: number
  inquiryOnly: number
}
type FunnelRates = {
  applyToSet: number | null
  setToDone: number | null
  doneToHire: number | null
  applyToHire: number | null
}
type MonthlyPoint = YearMonth & { counts: FunnelCounts; uu: number; rates: FunnelRates }
type Comparison =
  | {
      available: true
      label: string
      companyCount: number
      totals: FunnelCounts
      perCompany: FunnelCounts
      uuTotal: number
      rates: FunnelRates
      applyPerUu: number | null
    }
  | { available: false; label: string; reason: string }
type Report = {
  company: {
    id: string
    name: string
    companyId: string | null
    prefecture: string
    vehicleCount: number | null
    driverCount: number | null
  }
  period: Period
  generatedAt: string
  total: {
    counts: FunnelCounts
    uu: number
    uuCoverage: number | null
    rates: FunnelRates
    applyPerUu: number | null
    statusBreakdown: Record<string, number>
  }
  monthly: MonthlyPoint[]
  comparisons: { area: Comparison; size: Comparison }
  notes: string[]
}

// ===== 表示ヘルパー =====
function pct(v: number | null | undefined, digits = 1): string {
  if (v == null) return "—"
  return (v * 100).toFixed(digits) + "%"
}
function num(v: number | null | undefined, digits = 0): string {
  if (v == null) return "—"
  return v.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
function ymLabel(ym: YearMonth): string {
  return `${ym.year}年${ym.month}月`
}
function ymValue(ym: YearMonth): string {
  return `${ym.year}-${String(ym.month).padStart(2, "0")}`
}
/** 自社と比較の差（ポイント）。どちらかが null なら null */
function diffPt(own: number | null, other: number | null): number | null {
  if (own == null || other == null) return null
  return (own - other) * 100
}

function DiffBadge({ own, other }: { own: number | null; other: number | null }) {
  const d = diffPt(own, other)
  if (d == null) return null
  if (Math.abs(d) < 0.05) return <span className="ml-1 text-[10px] text-gray-400">±0</span>
  const up = d > 0
  return (
    <span className={"ml-1 text-[10px] " + (up ? "text-emerald-700" : "text-rose-700")}>
      {up ? "▲" : "▼"}{Math.abs(d).toFixed(1)}pt
    </span>
  )
}

const RATE_ROWS: { key: keyof FunnelRates; label: string }[] = [
  { key: "applyToSet", label: "応募 → 面接設定" },
  { key: "setToDone", label: "面接設定 → 面接実施" },
  { key: "doneToHire", label: "面接実施 → 入社" },
  { key: "applyToHire", label: "応募 → 入社" },
]

export default function CompanyReportPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [userName, setUserName] = useState("")
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [fromInput, setFromInput] = useState("")
  const [toInput, setToInput] = useState("")

  // from/to を引数で受け取る（state に依存させない＝無限ループ防止）
  const load = async (from: string, to: string) => {
    setLoading(true)
    setError("")
    const qs = new URLSearchParams()
    if (from) qs.set("from", from)
    if (to) qs.set("to", to)
    const res = await fetch(`/api/companies/${id}/report?${qs.toString()}`)
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) {
      setError(data?.error ?? "レポートを読み込めませんでした")
      setReport(null)
    } else {
      setReport(data)
      setFromInput(ymValue(data.period.from))
      setToInput(ymValue(data.period.to))
      // 期間をURLに残す（共有・再読込用）
      window.history.replaceState(null, "", `?from=${ymValue(data.period.from)}&to=${ymValue(data.period.to)}`)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => setUserName(s?.user?.name ?? ""))
    const sp = new URLSearchParams(window.location.search)
    load(sp.get("from") ?? "", sp.get("to") ?? "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const area = report?.comparisons.area
  const size = report?.comparisons.size
  const areaOk = area?.available ? area : null
  const sizeOk = size?.available ? size : null

  // 月次グラフの最大値（応募）
  const maxApply = report ? Math.max(1, ...report.monthly.map(m => m.counts.apply)) : 1
  const uuReliable = report?.total.uuCoverage != null && report.total.uuCoverage >= 0.9

  return (
    <div className="flex h-screen bg-gray-50 print:block print:h-auto print:bg-white">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .report-section { break-inside: avoid; }
        }
      `}</style>

      {/* flex にしないと Sidebar が画面の高さまで伸びない */}
      <div className="print:hidden flex">
        <Sidebar userName={userName} />
      </div>

      <main className="flex-1 overflow-auto print:overflow-visible">
        <div className="px-8 py-6 max-w-4xl print:p-0 print:max-w-none">

          {/* 操作バー（印刷しない） */}
          <div className="print:hidden mb-6">
            <div className="flex items-center gap-3 mb-4">
              <button type="button" onClick={() => router.push("/companies/" + id)} className="text-sm text-gray-400 hover:text-gray-600">
                ← 企業詳細
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-3 bg-white rounded-xl border border-gray-200 p-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">開始月</label>
                <input type="month" value={fromInput} onChange={e => setFromInput(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">終了月</label>
                <input type="month" value={toInput} onChange={e => setToInput(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900" />
              </div>
              <button type="button" onClick={() => load(fromInput, toInput)} disabled={loading}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                {loading ? "集計中..." : "期間を反映"}
              </button>
              <div className="flex-1" />
              <button type="button" onClick={() => window.print()} disabled={!report}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                🖨 印刷 / PDF保存
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              PDFにするときは、印刷画面の送信先で「PDFに保存」を選び、「ヘッダーとフッター」のチェックを外してください。
            </p>
          </div>

          {error && <div className="bg-white rounded-xl border border-rose-200 p-6 text-sm text-rose-700">{error}</div>}
          {!report && !error && <div className="text-sm text-gray-400 py-12 text-center">集計中...</div>}

          {report && (
            <article className="bg-white rounded-xl border border-gray-200 p-8 print:border-0 print:rounded-none print:p-0 text-gray-900">

              {/* 表紙ヘッダー */}
              <header className="report-section border-b-2 border-gray-900 pb-4 mb-6">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">転職道 採用状況レポート</p>
                    <h1 className="text-2xl font-bold">{report.company.name} 様</h1>
                  </div>
                  <div className="text-right text-xs text-gray-600 leading-relaxed">
                    <div>対象期間　{ymLabel(report.period.from)} 〜 {ymLabel(report.period.to)}</div>
                    <div>作成日　{new Date(report.generatedAt).toLocaleDateString("ja-JP")}</div>
                  </div>
                </div>
                <div className="flex gap-4 mt-3 text-xs text-gray-500">
                  <span>所在地：{report.company.prefecture}</span>
                  <span>保有台数：{report.company.vehicleCount != null ? report.company.vehicleCount + "台" : "未入力"}</span>
                  <span>乗務員数：{report.company.driverCount != null ? report.company.driverCount + "名" : "未入力"}</span>
                </div>
              </header>

              {/* 1. 期間サマリー */}
              <section className="report-section mb-8">
                <h2 className="text-base font-bold mb-3">期間の実績</h2>
                <div className="grid grid-cols-4 border border-gray-300">
                  {[
                    { label: "応募", value: report.total.counts.apply, sub: uuReliable ? `実人数 ${num(report.total.uu)}人` : null },
                    { label: "面接設定", value: report.total.counts.interviewSet, sub: null },
                    { label: "面接実施", value: report.total.counts.interviewDone, sub: null },
                    { label: "入社", value: report.total.counts.hired, sub: null },
                  ].map((c, i) => (
                    <div key={c.label} className={"px-4 py-3 " + (i > 0 ? "border-l border-gray-300" : "")}>
                      <div className="text-xs text-gray-500">{c.label}</div>
                      <div className="text-2xl font-bold tabular-nums">{num(c.value)}<span className="text-sm font-normal ml-0.5">件</span></div>
                      {c.sub && <div className="text-[11px] text-gray-500">{c.sub}</div>}
                    </div>
                  ))}
                </div>
              </section>

              {/* 2. 歩留まりと比較 */}
              <section className="report-section mb-8">
                <h2 className="text-base font-bold mb-1">選考の歩留まり</h2>
                <p className="text-xs text-gray-500 mb-3">各段階へ進んだ割合です。比較対象は他社の合計値から算出した平均で、個社名は含みません。</p>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-y border-gray-900">
                      <th className="text-left py-2 pr-2 font-medium">段階</th>
                      <th className="text-right py-2 px-2 font-medium">御社</th>
                      <th className="text-right py-2 px-2 font-medium">{area?.label ?? "エリア平均"}</th>
                      <th className="text-right py-2 pl-2 font-medium">{size?.label ?? "同規模平均"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RATE_ROWS.map(r => (
                      <tr key={r.key} className="border-b border-gray-200">
                        <td className="py-2 pr-2">{r.label}</td>
                        <td className="py-2 px-2 text-right font-bold tabular-nums">{pct(report.total.rates[r.key])}</td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          {areaOk ? <>{pct(areaOk.rates[r.key])}<DiffBadge own={report.total.rates[r.key]} other={areaOk.rates[r.key]} /></> : "—"}
                        </td>
                        <td className="py-2 pl-2 text-right tabular-nums">
                          {sizeOk ? <>{pct(sizeOk.rates[r.key])}<DiffBadge own={report.total.rates[r.key]} other={sizeOk.rates[r.key]} /></> : "—"}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-b border-gray-200">
                      <td className="py-2 pr-2">応募数（1社あたり）</td>
                      <td className="py-2 px-2 text-right font-bold tabular-nums">{num(report.total.counts.apply)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{areaOk ? num(areaOk.perCompany.apply, 1) : "—"}</td>
                      <td className="py-2 pl-2 text-right tabular-nums">{sizeOk ? num(sizeOk.perCompany.apply, 1) : "—"}</td>
                    </tr>
                    <tr className="border-b border-gray-900">
                      <td className="py-2 pr-2">入社数（1社あたり）</td>
                      <td className="py-2 px-2 text-right font-bold tabular-nums">{num(report.total.counts.hired)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{areaOk ? num(areaOk.perCompany.hired, 1) : "—"}</td>
                      <td className="py-2 pl-2 text-right tabular-nums">{sizeOk ? num(sizeOk.perCompany.hired, 1) : "—"}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="text-[11px] text-gray-500 mt-2 space-y-0.5">
                  {areaOk && <div>{areaOk.label}：比較対象 {areaOk.companyCount}社</div>}
                  {sizeOk && <div>{sizeOk.label}：比較対象 {sizeOk.companyCount}社</div>}
                  {area && !area.available && <div>{area.label}：{area.reason}</div>}
                  {size && !size.available && <div>{size.label}：{size.reason}</div>}
                </div>
              </section>

              {/* 3. 月次推移 */}
              <section className="report-section mb-8">
                <h2 className="text-base font-bold mb-3">月別の推移</h2>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-y border-gray-900">
                      <th className="text-left py-2 pr-2 font-medium w-24">月</th>
                      <th className="text-left py-2 px-2 font-medium">応募</th>
                      {uuReliable && <th className="text-right py-2 px-2 font-medium w-16">実人数</th>}
                      <th className="text-right py-2 px-2 font-medium w-16">面接設定</th>
                      <th className="text-right py-2 px-2 font-medium w-16">面接実施</th>
                      <th className="text-right py-2 pl-2 font-medium w-14">入社</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.monthly.map(m => (
                      <tr key={`${m.year}-${m.month}`} className="border-b border-gray-200">
                        <td className="py-1.5 pr-2 tabular-nums">{m.year}/{String(m.month).padStart(2, "0")}</td>
                        <td className="py-1.5 px-2">
                          <div className="flex items-center gap-2">
                            <div className="h-3 bg-gray-800" style={{ width: `${(m.counts.apply / maxApply) * 70}%` }} />
                            <span className="tabular-nums text-xs">{m.counts.apply}</span>
                          </div>
                        </td>
                        {uuReliable && <td className="py-1.5 px-2 text-right tabular-nums">{m.uu}</td>}
                        <td className="py-1.5 px-2 text-right tabular-nums">{m.counts.interviewSet}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{m.counts.interviewDone}</td>
                        <td className="py-1.5 pl-2 text-right tabular-nums font-bold">{m.counts.hired}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              {/* 注記 */}
              {report.notes.length > 0 && (
                <section className="report-section border-t border-gray-300 pt-3">
                  <h2 className="text-xs font-bold text-gray-600 mb-1">集計についての注記</h2>
                  <ul className="text-[11px] text-gray-600 space-y-0.5 list-disc pl-4">
                    {report.notes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </section>
              )}
            </article>
          )}
        </div>
      </main>
    </div>
  )
}
