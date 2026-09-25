import Anthropic from "@anthropic-ai/sdk"
import type { CompanyFunnelReport, Comparison, FunnelRates } from "@/lib/funnelAnalysis"

// =====================================================================
// 設定
// =====================================================================

/** 使うモデル。環境変数で差し替え可能 */
const MODEL = process.env.REPORT_MODEL ?? "claude-sonnet-5"

/** 応募がこれ未満なら所見を書かせない（少なすぎて傾向と言えないため） */
export const MIN_APPLY_FOR_INSIGHT = 10

/**
 * セクション定義（コード側で固定。AIは増減できない）
 * needsComparison: 比較対象が1つも無いときは書かせない
 */
const SECTIONS = [
  { key: "overview", title: "全体の傾向", maxChars: 100, needsComparison: false,
    instruction: "期間全体の応募から入社までの流れを要約する。" },
  { key: "strengths", title: "強み", maxChars: 80, needsComparison: true,
    instruction: "比較対象の平均を上回っている段階を挙げる。上回っている点が無ければ、比較的良い点を1つ挙げる。" },
  { key: "issues", title: "課題と次の打ち手", maxChars: 120, needsComparison: true,
    instruction: "比較対象の平均を下回っている段階を挙げ、改善の方向性を1つ提案する。原因は断定しない。" },
] as const

type SectionKey = (typeof SECTIONS)[number]["key"]

export type InsightSection = {
  key: SectionKey
  title: string
  /** 生成した文章。省略時は null */
  text: string | null
  /** 省略した理由（text が null のとき） */
  skippedReason: string | null
}

export type ReportInsight = {
  sections: InsightSection[]
  model: string | null
  generatedAt: string
}

// =====================================================================
// 数値の整形（AIに渡す前にすべて確定させる）
// =====================================================================

function pct(v: number | null): string {
  return v == null ? "算出不可" : (v * 100).toFixed(1) + "%"
}
function diff(own: number | null, other: number | null): string {
  if (own == null || other == null) return ""
  const d = (own - other) * 100
  const sign = d > 0 ? "+" : d < 0 ? "−" : "±"
  return `（差 ${sign}${Math.abs(d).toFixed(1)}pt）`
}
function avg1(v: number): string {
  return v.toFixed(1)
}

const RATE_LABELS: { key: keyof FunnelRates; label: string }[] = [
  { key: "applyToSet", label: "応募→面接設定" },
  { key: "setToDone", label: "面接設定→面接実施" },
  { key: "doneToHire", label: "面接実施→入社" },
  { key: "applyToHire", label: "応募→入社" },
]

/** AIに渡す「事実」テキスト。ここに無い数値はAIに使わせない */
function buildFacts(r: CompanyFunnelReport): string {
  const c = r.total.counts
  const uuOk = r.total.uuCoverage != null && r.total.uuCoverage >= 0.9
  const comps: Comparison[] = [r.comparisons.area, r.comparisons.size]
  const lines: string[] = []

  lines.push(`対象期間: ${r.period.from.year}年${r.period.from.month}月〜${r.period.to.year}年${r.period.to.month}月`)
  lines.push("")
  lines.push("【御社の実績】")
  lines.push(`応募 ${c.apply}件${uuOk ? `（実人数 ${r.total.uu}人）` : ""}`)
  lines.push(`面接設定 ${c.interviewSet}件 / 面接実施 ${c.interviewDone}件 / 入社 ${c.hired}件`)
  if (c.inquiryOnly > 0) lines.push(`応募のうち問い合わせのみ ${c.inquiryOnly}件`)
  if (c.rejected > 0) lines.push(`不採用 ${c.rejected}件（面接前後の判別不可）`)
  lines.push("")

  lines.push("【歩留まり】")
  for (const rl of RATE_LABELS) {
    const own = r.total.rates[rl.key]
    const parts = [`御社 ${pct(own)}`]
    for (const cmp of comps) {
      if (cmp.available) parts.push(`${cmp.label} ${pct(cmp.rates[rl.key])}${diff(own, cmp.rates[rl.key])}`)
    }
    lines.push(`${rl.label}: ${parts.join(" / ")}`)
  }
  const perApply = [`御社 ${c.apply}件`]
  const perHire = [`御社 ${c.hired}件`]
  for (const cmp of comps) {
    if (cmp.available) {
      perApply.push(`${cmp.label} ${avg1(cmp.perCompany.apply)}件`)
      perHire.push(`${cmp.label} ${avg1(cmp.perCompany.hired)}件`)
    }
  }
  lines.push(`1社あたり応募数: ${perApply.join(" / ")}`)
  lines.push(`1社あたり入社数: ${perHire.join(" / ")}`)
  for (const cmp of comps) {
    if (!cmp.available) lines.push(`${cmp.label}: 比較なし`)
  }
  lines.push("")

  lines.push("【月別】")
  for (const m of r.monthly) {
    lines.push(
      `${m.year}年${m.month}月: 応募 ${m.counts.apply}件 / 面接設定 ${m.counts.interviewSet}件 / 面接実施 ${m.counts.interviewDone}件 / 入社 ${m.counts.hired}件`,
    )
  }

  return lines.join("\n")
}

// =====================================================================
// 数値チェック（AIが事実に無い数字を書いていないか）
// =====================================================================

/** 単位つきの数値だけを対象にする（「2つ」「1点」などは見ない） */
const UNIT_NUMBER = /(\d+(?:\.\d+)?)\s*(%|pt|ポイント|件|人|社)/g

function numbersIn(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of text.matchAll(/\d+(?:\.\d+)?/g)) out.add(m[0])
  return out
}

function hasUnknownNumber(text: string, allowed: Set<string>): boolean {
  for (const m of text.matchAll(UNIT_NUMBER)) {
    if (!allowed.has(m[1])) return true
  }
  return false
}

// =====================================================================
// 本体
// =====================================================================

const SYSTEM_PROMPT = `あなたは、タクシー業界専門の求人媒体「転職道」の営業担当者です。
顧客企業の採用担当者に渡す定例報告書の「所見」を書きます。

厳守するルール:
- 使ってよい数値は【事実】に書かれているものだけです。計算・推測で新しい数値を作らないでください。数値を引用するときは【事実】の表記のまま書いてください。
- 読み手は顧客企業の採用担当者です。「御社」と呼び、です・ます調で書いてください。
- 他社の企業名や、個別企業を推測させる表現は使わないでください。
- 原因は断定せず、「〜の可能性があります」「〜が考えられます」と書いてください。
- 各セクションは指定の文字数以内で、箇条書きや記号を使わず文章で書いてください。
- 出力は指定されたキーだけを持つJSONオブジェクトのみです。前置きやコードブロックは付けないでください。`

export async function writeInsight(report: CompanyFunnelReport): Promise<ReportInsight> {
  const generatedAt = new Date().toISOString()

  // ---- 書かせるセクションを決める（データ不足はAIを呼ばずに省略） ----
  const hasComparison = report.comparisons.area.available || report.comparisons.size.available
  const tooFew = report.total.counts.apply < MIN_APPLY_FOR_INSIGHT

  const plan = SECTIONS.map(s => {
    if (tooFew) {
      return { ...s, skip: `期間内の応募が${MIN_APPLY_FOR_INSIGHT}件未満のため省略しています。` }
    }
    if (s.needsComparison && !hasComparison) {
      return { ...s, skip: "比較対象となるデータが無いため省略しています。" }
    }
    return { ...s, skip: null as string | null }
  })

  const targets = plan.filter(p => p.skip == null)
  if (targets.length === 0) {
    return {
      sections: plan.map(p => ({ key: p.key, title: p.title, text: null, skippedReason: p.skip })),
      model: null,
      generatedAt,
    }
  }

  // ---- AIを呼ぶ ----
  const facts = buildFacts(report)
  const spec = targets
    .map(t => `- "${t.key}"（${t.title}／${t.maxChars}字以内）: ${t.instruction}`)
    .join("\n")

  const userPrompt = `【事実】
${facts}

【書いてほしいセクション】
${spec}

次の形のJSONだけを出力してください:
{${targets.map(t => `"${t.key}": "..."`).join(", ")}}`

  const client = new Anthropic() // ANTHROPIC_API_KEY を環境変数から読む
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  })

  const raw = msg.content.map(b => (b.type === "text" ? b.text : "")).join("")
  const cleaned = raw.replace(/```json|```/g, "").trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error("AIの出力を読み取れませんでした")
  }

  // ---- 検証（数値の不一致があるセクションは載せない） ----
  const allowed = numbersIn(facts)

  const sections: InsightSection[] = plan.map(p => {
    if (p.skip) return { key: p.key, title: p.title, text: null, skippedReason: p.skip }

    const v = parsed[p.key]
    const text = typeof v === "string" ? v.trim() : ""
    if (!text) {
      return { key: p.key, title: p.title, text: null, skippedReason: "文章を生成できなかったため省略しています。" }
    }
    if (hasUnknownNumber(text, allowed)) {
      console.warn("[reportWriter] 事実に無い数値を検出", { key: p.key, text })
      return { key: p.key, title: p.title, text: null, skippedReason: "自動チェックで数値の不一致を検出したため省略しています。" }
    }
    return { key: p.key, title: p.title, text, skippedReason: null }
  })

  return { sections, model: MODEL, generatedAt }
}