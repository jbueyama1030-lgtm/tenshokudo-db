// 置き場所: src/app/companies/[id]/proposal/page.tsx
"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"

// ===== API の返り値（src/lib/proposal.ts と同じ形） =====
type YearMonth = { year: number; month: number }
type FunnelCounts = { apply: number; interviewSet: number; interviewDone: number; hired: number; rejected: number; inquiryOnly: number }
type FunnelRates = { applyToSet: number | null; setToDone: number | null; doneToHire: number | null; applyToHire: number | null }
type Comparison =
  | { available: true; label: string; companyCount: number; totals: FunnelCounts; perCompany: FunnelCounts; rates: FunnelRates }
  | { available: false; label: string; reason: string }
type FeatureRow = { feature: string; own: boolean; topHas: number; topRate: number; allHas: number; allRate: number; gap: number }
type Features =
  | { available: true; scopeLabel: string; peerCount: number; topCount: number; hasOwnArticle: boolean; rows: FeatureRow[] }
  | { available: false; reason: string }
type Proposal = {
  company: {
    id: string; name: string; prefecture: string
    vehicleCount: number | null; driverCount: number | null
    shifts: string[]; apps: string[]
    annualHiringTarget: number | null; adoptionChallenge: string | null
    isListed: boolean
  }
  period: { from: YearMonth; to: YearMonth }
  generatedAt: string
  area: Comparison
  size: Comparison
  features: Features
}
type InsightSection = { key: string; title: string; text: string | null; skippedReason: string | null }
type ReportInsight = { sections: InsightSection[] }

const FEATURE_ROWS_SHOWN = 10

function pct(v: number | null | undefined, digits = 1): string {
  return v == null ? "—" : (v * 100).toFixed(digits) + "%"
}
function ymLabel(ym: YearMonth) { return `${ym.year}年${ym.month}月` }
function ymValue(ym: YearMonth) { return `${ym.year}-${String(ym.month).padStart(2, "0")}` }

export default function ProposalPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [userName, setUserName] = useState("")
  const [data, setData] = useState<Proposal | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [fromInput, setFromInput] = useState("")
  const [toInput, setToInput] = useState("")
  const [insight, setInsight] = useState<ReportInsight | null>(null)
  const [insightLoading, setInsightLoading] = useState(false)
  const [insightError, setInsightError] = useState("")

  // from/to を引数で受け取る（state に依存させない＝無限ループ防止）
  const load = async (from: string, to: string) => {
    setLoading(true)
    setError("")
    const qs = new URLSearchParams()
    if (from) qs.set("from", from)
    if (to) qs.set("to", to)
    const res = await fetch(`/api/companies/${id}/proposal?${qs.toString()}`)
    const d = await res.json().catch(() => null)
    if (!res.ok || !d) {
      setError(d?.error ?? "提案データを読み込めませんでした")
      setData(null)
    } else {
      setData(d)
      setInsight(null)
      setInsightError("")
      setFromInput(ymValue(d.period.from))
      setToInput(ymValue(d.period.to))
      window.history.replaceState(null, "", `?from=${ymValue(d.period.from)}&to=${ymValue(d.period.to)}`)
    }
    setLoading(false)
  }

  const generateInsight = async () => {
    if (!data) return
    setInsightLoading(true)
    setInsightError("")
    const res = await fetch(`/api/companies/${id}/proposal/insight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: ymValue(data.period.from), to: ymValue(data.period.to) }),
    })
    const d = await res.json().catch(() => null)
    if (!res.ok || !d) setInsightError(d?.error ?? "所見の生成に失敗しました")
    else setInsight(d)
    setInsightLoading(false)
  }

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => setUserName(s?.user?.name ?? ""))
    const sp = new URLSearchParams(window.location.search)
    load(sp.get("from") ?? "", sp.get("to") ?? "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const areaOk = data?.area.available ? data.area : null
  const sizeOk = data?.size.available ? data.size : null
  const feat = data?.features
  const featTop = feat && feat.available ? feat.topCount : 0
  const featPeer = feat && feat.available ? feat.peerCount : 0

  const marketRows: { label: string; get: (c: Extract<Comparison, { available: true }>) => string }[] = [
    { label: "応募数（1社あたり）", get: c => c.perCompany.apply.toFixed(1) + "件" },
    { label: "面接設定（1社あたり）", get: c => c.perCompany.interviewSet.toFixed(1) + "件" },
    { label: "入社数（1社あたり）", get: c => c.perCompany.hired.toFixed(1) + "名" },
    { label: "応募 → 面接設定", get: c => pct(c.rates.applyToSet) },
    { label: "応募 → 入社", get: c => pct(c.rates.applyToHire) },
  ]

  return (
    <div className="flex h-screen bg-gray-50 print:block print:h-auto print:bg-white">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .report-section { break-inside: avoid; }
        }
      `}</style>

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
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">新規提案（顧客向け）</span>
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
              <button type="button" onClick={generateInsight} disabled={!data || insightLoading}
                className="px-4 py-2 text-sm border border-blue-300 rounded-lg text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                {insightLoading ? "提案文を生成中..." : insight ? "✨ 提案文を作り直す" : "✨ 提案文を生成"}
              </button>
              <button type="button" onClick={() => window.print()} disabled={!data}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                🖨 印刷 / PDF保存
              </button>
            </div>
            {insightError && <p className="text-xs text-rose-600 mt-2">{insightError}</p>}
            <p className="text-xs text-gray-400 mt-2">
              顧客に渡す資料です。商談メモ・社内メモは使っていません。採用課題・年間採用目標を企業詳細に入力すると、提案文に反映されます。
            </p>
          </div>

          {error && <div className="bg-white rounded-xl border border-rose-200 p-6 text-sm text-rose-700">{error}</div>}
          {!data && !error && <div className="text-sm text-gray-400 py-12 text-center">集計中...</div>}

          {data && (
            <article className="bg-white rounded-xl border border-gray-200 p-8 print:border-0 print:rounded-none print:p-0 text-gray-900">

              <header className="report-section border-b-2 border-gray-900 pb-4 mb-6">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">転職道 タクシー採用のご提案</p>
                    <h1 className="text-2xl font-bold">{data.company.name} 様</h1>
                  </div>
                  <div className="text-right text-xs text-gray-600 leading-relaxed">
                    <div>参照期間　{ymLabel(data.period.from)} 〜 {ymLabel(data.period.to)}</div>
                    <div>作成日　{new Date(data.generatedAt).toLocaleDateString("ja-JP")}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
                  <span>所在地：{data.company.prefecture}</span>
                  <span>保有台数：{data.company.vehicleCount != null ? data.company.vehicleCount + "台" : "未入力"}</span>
                  <span>乗務員数：{data.company.driverCount != null ? data.company.driverCount + "名" : "未入力"}</span>
                  {data.company.shifts.length > 0 && <span>募集勤務形態：{data.company.shifts.join("・")}</span>}
                  {data.company.annualHiringTarget != null && <span>年間採用目標：{data.company.annualHiringTarget}名</span>}
                </div>
              </header>

              {/* 1. エリアの採用状況 */}
              <section className="report-section mb-8">
                <h2 className="text-base font-bold mb-1">転職道での採用の相場</h2>
                <p className="text-xs text-gray-500 mb-3">
                  参照期間中に転職道へ掲載していた企業の実績です。比較対象は複数社の合計から算出した平均で、個社名は含みません。
                </p>
                {!areaOk && !sizeOk ? (
                  <p className="text-xs text-gray-500">比較できる掲載企業のデータが不足しています。</p>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-y border-gray-900">
                        <th className="text-left py-2 pr-2 font-medium">項目</th>
                        <th className="text-right py-2 px-2 font-medium">{data.area.label}</th>
                        <th className="text-right py-2 pl-2 font-medium">{data.size.label}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketRows.map(r => (
                        <tr key={r.label} className="border-b border-gray-200">
                          <td className="py-2 pr-2">{r.label}</td>
                          <td className="py-2 px-2 text-right tabular-nums font-bold">{areaOk ? r.get(areaOk) : "—"}</td>
                          <td className="py-2 pl-2 text-right tabular-nums font-bold">{sizeOk ? r.get(sizeOk) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="text-[11px] text-gray-500 mt-2 space-y-0.5">
                  {areaOk && <div>{areaOk.label}：比較対象 {areaOk.companyCount}社</div>}
                  {sizeOk && <div>{sizeOk.label}：比較対象 {sizeOk.companyCount}社</div>}
                  {!data.area.available && <div>{data.area.label}：{data.area.reason}</div>}
                  {!data.size.available && <div>{data.size.label}：{data.size.reason}</div>}
                </div>
              </section>

              {/* 2. 上位企業の記事の打ち出し */}
              <section className="report-section mb-8">
                <h2 className="text-base font-bold mb-1">採用が進んでいる企業の打ち出し方</h2>
                {feat && feat.available ? (
                  <>
                    <p className="text-xs text-gray-500 mb-3">
                      {feat.scopeLabel}のうち、応募が一定数ある{feat.peerCount}社を入社率で並べ、上位{feat.topCount}社の記事が打ち出している特徴です。
                      上位企業と全体の差が5ポイント以上あるものだけを表示しています。
                    </p>
                    {feat.rows.length === 0 ? (
                      <p className="text-xs text-gray-500">上位企業と全体で、打ち出し方に目立った差のある特徴はありませんでした。</p>
                    ) : (
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-y border-gray-900">
                            <th className="text-left py-2 pr-2 font-medium">特徴</th>
                            <th className="text-right py-2 px-2 font-medium w-36">上位企業</th>
                            <th className="text-right py-2 pl-2 font-medium w-36">全体</th>
                          </tr>
                        </thead>
                        <tbody>
                          {feat.rows.slice(0, FEATURE_ROWS_SHOWN).map(row => (
                            <tr key={row.feature} className="border-b border-gray-200">
                              <td className="py-1.5 pr-2">{row.feature}</td>
                              <td className="py-1.5 px-2 text-right tabular-nums">
                                <span className="font-bold">{pct(row.topRate, 0)}</span>
                                <span className="text-[10px] text-gray-500 ml-1">（{row.topHas}/{featTop}社）</span>
                              </td>
                              <td className="py-1.5 pl-2 text-right tabular-nums">
                                {pct(row.allRate, 0)}
                                <span className="text-[10px] text-gray-500 ml-1">（{row.allHas}/{featPeer}社）</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <p className="text-[11px] text-gray-500 mt-2">
                      上位企業の傾向を示すもので、打ち出せば入社が増えることを示すものではありません。
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-gray-500">{feat && !feat.available ? feat.reason : ""}</p>
                )}
              </section>

              {/* 3. 提案文（AI） */}
              {insight && (
                <section className="report-section mb-8">
                  <h2 className="text-base font-bold mb-3">ご提案</h2>
                  <div className="space-y-3">
                    {insight.sections.map(sec => (
                      <div key={sec.key} className="border-l-2 border-gray-900 pl-3">
                        <h3 className="text-sm font-bold mb-0.5">{sec.title}</h3>
                        {sec.text
                          ? <p className="text-sm leading-relaxed whitespace-pre-line">{sec.text}</p>
                          : <p className="text-xs text-gray-500">{sec.skippedReason}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="report-section border-t border-gray-300 pt-3">
                <h2 className="text-xs font-bold text-gray-600 mb-1">この資料について</h2>
                <ul className="text-[11px] text-gray-600 space-y-0.5 list-disc pl-4">
                  <li>数値は転職道に掲載していた企業の実績から算出した平均・割合で、御社での成果を保証するものではありません。</li>
                  <li>入社率は応募から入社に至った割合です。直近の月には選考中の応募者が含まれる場合があります。</li>
                </ul>
              </section>
            </article>
          )}
        </div>
      </main>
    </div>
  )
}
