// 置き場所: src/app/companies/[id]/article-review/page.tsx
"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"

// ===== API の返り値（src/lib/articleReview.ts と同じ形） =====
type YearMonth = { year: number; month: number }
type FunnelCounts = { apply: number; interviewSet: number; interviewDone: number; hired: number; rejected: number; inquiryOnly: number }
type FunnelRates = { applyToSet: number | null; setToDone: number | null; doneToHire: number | null; applyToHire: number | null }
type Comparison =
  | { available: true; label: string; companyCount: number; perCompany: FunnelCounts; rates: FunnelRates }
  | { available: false; label: string; reason: string }
type FeatureRow = { feature: string; own: boolean; topHas: number; topRate: number; allHas: number; allRate: number; gap: number }
type Features =
  | { available: true; scopeLabel: string; peerCount: number; topCount: number; rows: FeatureRow[] }
  | { available: false; reason: string }
type ImpactWindow = { from: YearMonth; to: YearMonth; months: number; apply: number; hired: number }
type ImpactRow = { taskName: string; taskType: string; publishedAt: string; before: ImpactWindow; after: ImpactWindow | null; afterPartial: boolean }
type Review = {
  company: { id: string; name: string; companyId: string | null; prefecture: string }
  period: { from: YearMonth; to: YearMonth }
  generatedAt: string
  article: {
    title: string | null; isListed: boolean; pageUpdatedAt: string | null
    lastImportedAt: string; versionCount: number; lastChangedAt: string | null
  } | null
  funnel: { counts: FunnelCounts; rates: FunnelRates; uu: number }
  area: Comparison
  features: Features
  impacts: ImpactRow[]
  memos: {
    adoptionChallenge: string | null; negotiationMemo: string | null; memo: string | null
    persona: string[]; condIdealPerson: string | null; nextAction: string | null
  }
}
type InsightSection = { key: string; title: string; text: string | null; skippedReason: string | null }
type ReportInsight = { sections: InsightSection[] }

const TASK_TYPE_LABELS: Record<string, string> = { new: "新規", revise: "修正", renewal: "リニューアル" }

function pct(v: number | null | undefined, digits = 1): string {
  return v == null ? "—" : (v * 100).toFixed(digits) + "%"
}
function ymValue(ym: YearMonth) { return `${ym.year}-${String(ym.month).padStart(2, "0")}` }
function ymShort(ym: YearMonth) { return `${ym.year}/${String(ym.month).padStart(2, "0")}` }
function dateJa(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—"
}
function perMonth(w: ImpactWindow, key: "apply" | "hired") {
  return w.months > 0 ? (w[key] / w.months).toFixed(1) : "—"
}

export default function ArticleReviewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [userName, setUserName] = useState("")
  const [data, setData] = useState<Review | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [fromInput, setFromInput] = useState("")
  const [toInput, setToInput] = useState("")
  const [insight, setInsight] = useState<ReportInsight | null>(null)
  const [insightLoading, setInsightLoading] = useState(false)
  const [insightError, setInsightError] = useState("")

  const load = async (from: string, to: string) => {
    setLoading(true)
    setError("")
    const qs = new URLSearchParams()
    if (from) qs.set("from", from)
    if (to) qs.set("to", to)
    const res = await fetch(`/api/companies/${id}/article-review?${qs.toString()}`)
    const d = await res.json().catch(() => null)
    if (!res.ok || !d) {
      setError(d?.error ?? "記事改善データを読み込めませんでした")
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
    const res = await fetch(`/api/companies/${id}/article-review/insight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: ymValue(data.period.from), to: ymValue(data.period.to) }),
    })
    const d = await res.json().catch(() => null)
    if (!res.ok || !d) setInsightError(d?.error ?? "改善案の生成に失敗しました")
    else setInsight(d)
    setInsightLoading(false)
  }

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => setUserName(s?.user?.name ?? ""))
    const sp = new URLSearchParams(window.location.search)
    load(sp.get("from") ?? "", sp.get("to") ?? "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const feat = data?.features
  const featTop = feat && feat.available ? feat.topCount : 0
  const areaOk = data?.area.available ? data.area : null
  const memoItems = data
    ? [
        { label: "採用課題", value: data.memos.adoptionChallenge },
        { label: "ペルソナ", value: data.memos.persona.length > 0 ? data.memos.persona.join("、") : null },
        { label: "求める人物像", value: data.memos.condIdealPerson },
        { label: "商談メモ", value: data.memos.negotiationMemo },
        { label: "メモ", value: data.memos.memo },
        { label: "次回アクション", value: data.memos.nextAction },
      ]
    : []

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

          <div className="print:hidden mb-6">
            <div className="flex items-center gap-3 mb-4">
              <button type="button" onClick={() => router.push("/companies/" + id)} className="text-sm text-gray-400 hover:text-gray-600">
                ← 企業詳細
              </button>
              <span className="text-xs bg-amber-50 text-amber-800 px-2 py-1 rounded">記事改善（社内向け・顧客に渡さない）</span>
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
                {insightLoading ? "改善案を生成中..." : insight ? "✨ 改善案を作り直す" : "✨ 改善案を生成"}
              </button>
              <button type="button" onClick={() => window.print()} disabled={!data}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                🖨 印刷 / PDF保存
              </button>
            </div>
            {insightError && <p className="text-xs text-rose-600 mt-2">{insightError}</p>}
          </div>

          {error && <div className="bg-white rounded-xl border border-rose-200 p-6 text-sm text-rose-700">{error}</div>}
          {!data && !error && <div className="text-sm text-gray-400 py-12 text-center">集計中...</div>}

          {data && (
            <article className="bg-white rounded-xl border border-gray-200 p-8 print:border-0 print:rounded-none print:p-0 text-gray-900">

              <header className="report-section border-b-2 border-gray-900 pb-4 mb-6">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs text-amber-700 mb-1">【社内資料】記事改善レポート</p>
                    <h1 className="text-2xl font-bold">{data.company.name}</h1>
                  </div>
                  <div className="text-right text-xs text-gray-600 leading-relaxed">
                    <div>対象期間　{ymShort(data.period.from)} 〜 {ymShort(data.period.to)}</div>
                    <div>作成日　{new Date(data.generatedAt).toLocaleDateString("ja-JP")}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
                  <span>企業ID：{data.company.companyId ?? "—"}</span>
                  <span>所在地：{data.company.prefecture}</span>
                  {data.article ? (
                    <>
                      <span>掲載：{data.article.isListed ? "掲載中" : "掲載終了"}</span>
                      <span>求人ページ更新：{dateJa(data.article.pageUpdatedAt)}</span>
                      <span>内容の変更検知：{data.article.versionCount}版（最終 {dateJa(data.article.lastChangedAt)}）</span>
                    </>
                  ) : (
                    <span className="text-rose-600">記事データ未取り込み</span>
                  )}
                </div>
                {data.article?.title && (
                  <p className="text-xs text-gray-700 mt-2 whitespace-pre-line">タイトル：{data.article.title}</p>
                )}
              </header>

              {/* 1. 実績 */}
              <section className="report-section mb-8">
                <h2 className="text-base font-bold mb-3">期間の実績</h2>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-y border-gray-900">
                      <th className="text-left py-2 pr-2 font-medium">項目</th>
                      <th className="text-right py-2 px-2 font-medium">この企業</th>
                      <th className="text-right py-2 pl-2 font-medium">{data.area.label}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-200">
                      <td className="py-2 pr-2">応募数</td>
                      <td className="py-2 px-2 text-right tabular-nums font-bold">{data.funnel.counts.apply}件</td>
                      <td className="py-2 pl-2 text-right tabular-nums">{areaOk ? areaOk.perCompany.apply.toFixed(1) + "件（1社あたり）" : "—"}</td>
                    </tr>
                    <tr className="border-b border-gray-200">
                      <td className="py-2 pr-2">応募 → 面接設定</td>
                      <td className="py-2 px-2 text-right tabular-nums font-bold">{pct(data.funnel.rates.applyToSet)}</td>
                      <td className="py-2 pl-2 text-right tabular-nums">{areaOk ? pct(areaOk.rates.applyToSet) : "—"}</td>
                    </tr>
                    <tr className="border-b border-gray-900">
                      <td className="py-2 pr-2">応募 → 入社</td>
                      <td className="py-2 px-2 text-right tabular-nums font-bold">{pct(data.funnel.rates.applyToHire)}</td>
                      <td className="py-2 pl-2 text-right tabular-nums">{areaOk ? pct(areaOk.rates.applyToHire) : "—"}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              {/* 2. 記事の打ち出し */}
              <section className="report-section mb-8">
                <h2 className="text-base font-bold mb-1">記事の打ち出し（上位企業との比較）</h2>
                {feat && feat.available ? (
                  <>
                    <p className="text-xs text-gray-500 mb-3">
                      {feat.scopeLabel} {feat.peerCount}社のうち入社率上位{feat.topCount}社との比較。差が5ポイント以上の特徴のみ、記事に無いもの → あるものの順。
                    </p>
                    {feat.rows.length === 0 ? (
                      <p className="text-xs text-gray-500">目立った差のある特徴はありません。</p>
                    ) : (
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-y border-gray-900">
                            <th className="text-left py-2 pr-2 font-medium">特徴</th>
                            <th className="text-center py-2 px-2 font-medium w-20">この記事</th>
                            <th className="text-right py-2 px-2 font-medium w-32">上位企業</th>
                            <th className="text-right py-2 pl-2 font-medium w-20">全体</th>
                          </tr>
                        </thead>
                        <tbody>
                          {feat.rows.slice(0, 12).map(row => (
                            <tr key={row.feature} className="border-b border-gray-200">
                              <td className="py-1.5 pr-2">{row.feature}</td>
                              <td className="py-1.5 px-2 text-center">{row.own ? "●" : <span className="text-rose-600 font-bold">なし</span>}</td>
                              <td className="py-1.5 px-2 text-right tabular-nums">
                                <span className="font-bold">{pct(row.topRate, 0)}</span>
                                <span className="text-[10px] text-gray-500 ml-1">（{row.topHas}/{featTop}社）</span>
                              </td>
                              <td className="py-1.5 pl-2 text-right tabular-nums">{pct(row.allRate, 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-500">{feat && !feat.available ? feat.reason : ""}</p>
                )}
              </section>

              {/* 3. 過去の改修の前後比較 */}
              <section className="report-section mb-8">
                <h2 className="text-base font-bold mb-1">過去の記事改修の前後比較</h2>
                <p className="text-xs text-gray-500 mb-3">
                  制作タスクの公開日を基準に、公開月の前後3ヶ月（公開月は除く・公開後は先月まで）の月平均を比べています。季節や広告の影響も含むため、改修の効果とは断定できません。
                </p>
                {data.impacts.length === 0 ? (
                  <p className="text-xs text-gray-500">公開日の入った制作タスクがありません。</p>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-y border-gray-900">
                        <th className="text-left py-2 pr-2 font-medium">制作タスク</th>
                        <th className="text-left py-2 px-2 font-medium w-24">公開日</th>
                        <th className="text-right py-2 px-2 font-medium">公開前 応募/月</th>
                        <th className="text-right py-2 px-2 font-medium">公開後 応募/月</th>
                        <th className="text-right py-2 pl-2 font-medium">入社（前→後）</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.impacts.map((i, idx) => (
                        <tr key={idx} className="border-b border-gray-200">
                          <td className="py-1.5 pr-2">
                            {i.taskName}
                            <span className="text-[10px] text-gray-500 ml-1">（{TASK_TYPE_LABELS[i.taskType] ?? i.taskType}）</span>
                          </td>
                          <td className="py-1.5 px-2 tabular-nums">{dateJa(i.publishedAt)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{perMonth(i.before, "apply")}件</td>
                          <td className="py-1.5 px-2 text-right tabular-nums font-bold">
                            {i.after ? perMonth(i.after, "apply") + "件" : "—"}
                            {i.afterPartial && <span className="text-[10px] text-gray-500 ml-1">（途中）</span>}
                          </td>
                          <td className="py-1.5 pl-2 text-right tabular-nums">
                            {i.before.hired} → {i.after ? i.after.hired : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              {/* 4. 営業メモ（社内） */}
              <section className="report-section mb-8">
                <h2 className="text-base font-bold mb-3">営業からの情報（社内）</h2>
                <dl className="text-sm space-y-2">
                  {memoItems.map(m => (
                    <div key={m.label} className="grid grid-cols-[7rem_1fr] gap-2">
                      <dt className="text-xs text-gray-500 pt-0.5">{m.label}</dt>
                      <dd className="whitespace-pre-wrap">{m.value ? m.value : <span className="text-xs text-gray-400">未入力</span>}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              {/* 5. 改善案（AI） */}
              {insight && (
                <section className="report-section mb-8">
                  <h2 className="text-base font-bold mb-3">改善案</h2>
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
            </article>
          )}
        </div>
      </main>
    </div>
  )
}
