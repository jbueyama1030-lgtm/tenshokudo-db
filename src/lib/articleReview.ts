// 置き場所: src/lib/articleReview.ts
import { prisma } from "@/lib/prisma"
import { analyzeCompanyFunnel, type Comparison, type FunnelCounts, type FunnelRates, type Period } from "@/lib/funnelAnalysis"
import { analyzeArticleComparison, loadArticleTexts, type ArticleComparison } from "@/lib/articleAnalysis"
import { analyzeProductionImpact, type ProductionImpactRow } from "@/lib/productionImpact"
import { generateSections, pct, type PlannedSection, type ReportInsight } from "@/lib/reportWriter"

/** 記事改善レポートの既定期間 */
export const REVIEW_DEFAULT_MONTHS = 6
/** AIに読ませる記事本文の1項目あたりの最大文字数（社内向けなので定例報告より長め） */
const REVIEW_TEXT_MAX_CHARS = 1000
/** AIに渡すメモの最大文字数 */
const MEMO_MAX_CHARS = 800

// =====================================================================
// データ
// =====================================================================

export type ArticleReviewData = {
  company: { id: string; name: string; companyId: string | null; prefecture: string }
  period: Period
  generatedAt: string
  article: {
    title: string | null
    isListed: boolean
    pageUpdatedAt: string | null
    lastImportedAt: string
    /** 取り込みで内容の変更を検知した回数（初回取り込みを含む） */
    versionCount: number
    lastChangedAt: string | null
  } | null
  funnel: { counts: FunnelCounts; rates: FunnelRates; uu: number }
  area: Comparison
  features: ArticleComparison
  impacts: ProductionImpactRow[]
  /** 社内向け。顧客に渡す資料には使わない */
  memos: {
    adoptionChallenge: string | null
    negotiationMemo: string | null
    memo: string | null
    persona: string[]
    condIdealPerson: string | null
    nextAction: string | null
  }
}

/**
 * 記事改善（社内向け）用データ。商談メモ・社内メモも含む。
 * 代理店ユーザーには出さない（制作情報を含むため）。呼び出し側のAPIで判定すること。
 */
export async function buildArticleReviewData(companyDbId: string, period: Period): Promise<ArticleReviewData | null> {
  const [funnel, company, article, features, impacts] = await Promise.all([
    analyzeCompanyFunnel(companyDbId, period),
    prisma.company.findUnique({
      where: { id: companyDbId },
      select: {
        adoptionChallenge: true, negotiationMemo: true, memo: true,
        persona: true, condIdealPerson: true, nextAction: true,
      },
    }),
    prisma.jobArticle.findUnique({
      where: { companyRef: companyDbId },
      select: {
        id: true, title: true, isListed: true, pageUpdatedAt: true, lastImportedAt: true,
        _count: { select: { snapshots: true } },
        snapshots: { orderBy: { capturedAt: "desc" }, take: 1, select: { capturedAt: true } },
      },
    }),
    analyzeArticleComparison(companyDbId, period),
    analyzeProductionImpact(companyDbId),
  ])
  if (!funnel || !company) return null

  return {
    company: {
      id: funnel.company.id,
      name: funnel.company.name,
      companyId: funnel.company.companyId,
      prefecture: funnel.company.prefecture,
    },
    period,
    generatedAt: new Date().toISOString(),
    article: article
      ? {
          title: article.title,
          isListed: article.isListed,
          pageUpdatedAt: article.pageUpdatedAt ? article.pageUpdatedAt.toISOString() : null,
          lastImportedAt: article.lastImportedAt.toISOString(),
          versionCount: article._count.snapshots,
          lastChangedAt: article.snapshots[0] ? article.snapshots[0].capturedAt.toISOString() : null,
        }
      : null,
    funnel: { counts: funnel.total.counts, rates: funnel.total.rates, uu: funnel.total.uu },
    area: funnel.comparisons.area,
    features,
    impacts,
    memos: {
      adoptionChallenge: company.adoptionChallenge,
      negotiationMemo: company.negotiationMemo,
      memo: company.memo,
      persona: company.persona ?? [],
      condIdealPerson: company.condIdealPerson,
      nextAction: company.nextAction,
    },
  }
}

// =====================================================================
// AI所見（社内向け）
// =====================================================================

const REVIEW_SYSTEM_PROMPT = `あなたは、タクシー業界専門の求人媒体「転職道」の制作ディレクターです。
社内の営業・制作担当に向けて、掲載中の求人記事の改善指示を書きます。

厳守するルール:
- 読み手は社内の営業・制作担当です。です・ます調で、具体的かつ簡潔に書いてください。
- 使ってよい数値は【事実】に書かれているものだけです。計算・推測で新しい数値を作らないでください。
- 【営業メモ】は社内情報です。改善の方向性を考える材料として使ってかまいませんが、記事にそのまま載せるべきでない内容（担当者の人柄、価格交渉、競合との比較など）を記事に書くよう指示しないでください。
- 【記事本文】に書かれておらず、【営業メモ】にだけある情報を記事に追加する提案は、「要確認」と付けてください。
- 記事の特徴と成果の関係は傾向であって因果ではありません。「上位企業では〜を打ち出している割合が高い」の形で書いてください。
- 過去の改修の前後比較は、季節や広告の出稿量でも応募が変わるため、改修の効果と断定しないでください。
- 指定の文字数以内で書いてください。「直すべき箇所」は優先順に番号（1. 2. 3.）を付けて書いてかまいません。
- 文章の中で半角のダブルクォートは使わず、書き換え例は「」で囲んでください。`

function memoText(label: string, v: string | null): string | null {
  if (!v || !v.trim()) return null
  const t = v.trim()
  return `${label}: ${t.length > MEMO_MAX_CHARS ? t.slice(0, MEMO_MAX_CHARS) + "（以下略）" : t}`
}

function buildReviewFacts(
  d: ArticleReviewData,
  texts: { label: string; text: string; truncated: boolean }[] | null,
): string {
  const lines: string[] = []
  const c = d.funnel.counts
  lines.push(`対象期間: ${d.period.from.year}年${d.period.from.month}月〜${d.period.to.year}年${d.period.to.month}月`)
  lines.push("")
  lines.push("【御社の実績】")
  lines.push(`応募 ${c.apply}件 / 面接設定 ${c.interviewSet}件 / 面接実施 ${c.interviewDone}件 / 入社 ${c.hired}件`)
  lines.push(`応募→面接設定 ${pct(d.funnel.rates.applyToSet)} / 応募→入社 ${pct(d.funnel.rates.applyToHire)}`)
  if (d.area.available) {
    lines.push(`${d.area.label}: 応募→面接設定 ${pct(d.area.rates.applyToSet)} / 応募→入社 ${pct(d.area.rates.applyToHire)} / 1社あたり応募 ${d.area.perCompany.apply.toFixed(1)}件`)
  }

  if (d.article) {
    lines.push("")
    lines.push("【記事の状態】")
    if (d.article.pageUpdatedAt) {
      lines.push(`求人ページの最終更新: ${new Date(d.article.pageUpdatedAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}`)
    }
    lines.push(`掲載状況: ${d.article.isListed ? "掲載中" : "掲載終了"}`)
  }

  if (d.features.available) {
    const f = d.features
    lines.push("")
    lines.push(`【記事の打ち出し】比較対象: ${f.scopeLabel} ${f.peerCount}社（うち入社率の上位 ${f.topCount}社）`)
    if (f.rows.length === 0) lines.push("上位企業と全体で打ち出し方に目立った差のある特徴は無い")
    for (const row of f.rows.slice(0, 10)) {
      lines.push(`${row.feature}: 御社 ${row.own ? "あり" : "なし"} / 上位企業 ${pct(row.topRate)}（${row.topHas}/${f.topCount}社） / 全体 ${pct(row.allRate)}`)
    }
  }

  const withAfter = d.impacts.filter(i => i.after)
  if (withAfter.length > 0) {
    lines.push("")
    lines.push("【過去の記事改修の前後比較】（公開月の前後。公開月そのものは含まない）")
    for (const i of withAfter) {
      const pub = new Date(i.publishedAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })
      lines.push(
        `${i.taskName}（${pub}公開）: 公開前${i.before.months}ヶ月 応募 ${i.before.apply}件・入社 ${i.before.hired}件 → 公開後${i.after!.months}ヶ月 応募 ${i.after!.apply}件・入社 ${i.after!.hired}件${i.afterPartial ? "（公開後は途中経過）" : ""}`,
      )
    }
  }

  const memoLines = [
    memoText("採用課題", d.memos.adoptionChallenge),
    d.memos.persona.length > 0 ? `採用したい人物像（ペルソナ）: ${d.memos.persona.join("、")}` : null,
    memoText("求める人物像", d.memos.condIdealPerson),
    memoText("商談メモ", d.memos.negotiationMemo),
    memoText("メモ", d.memos.memo),
    memoText("次回アクション", d.memos.nextAction),
  ].filter((v): v is string => !!v)
  if (memoLines.length > 0) {
    lines.push("")
    lines.push("【営業メモ】（社内情報）")
    lines.push(...memoLines)
  }

  if (texts && texts.length > 0) {
    lines.push("")
    lines.push("【記事本文】（長い項目は先頭のみ）")
    for (const t of texts) {
      lines.push(`＜${t.label}＞`)
      lines.push(t.text + (t.truncated ? "（以下略）" : ""))
    }
  }

  return lines.join("\n")
}

export function hasReviewMemos(d: ArticleReviewData): boolean {
  const m = d.memos
  return !!(m.adoptionChallenge || m.negotiationMemo || m.memo || m.condIdealPerson || m.persona.length > 0)
}

export async function writeArticleReviewInsight(d: ArticleReviewData): Promise<ReportInsight> {
  const texts = await loadArticleTexts(d.company.id, REVIEW_TEXT_MAX_CHARS)
  const hasTexts = !!texts && texts.length > 0
  const hasImpacts = d.impacts.some(i => i.after)
  const noArticle = "転職道の記事データが無いため省略しています（記事インポートで取り込むと反映されます）。"

  const plan: PlannedSection[] = [
    {
      key: "diagnosis",
      title: "現状の診断",
      maxChars: 180,
      instruction: "実績・エリア比較・記事の打ち出しから、記事のどこに課題がありそうかを要約する。",
      skip: hasTexts ? null : noArticle,
    },
    {
      key: "fixes",
      title: "直すべき箇所（優先順）",
      maxChars: 400,
      instruction:
        "【記事本文】のどの項目をどう直すかを、優先度の高い順に最大3つ書く。各項目に対象の項目名と、見出しや一文の書き換え例を「」で示す。古い情報（過去の年号・終了した可能性のあるキャンペーン）があれば指摘する。",
      skip: hasTexts ? null : noArticle,
    },
    {
      key: "salesInput",
      title: "営業情報から反映すべき点",
      maxChars: 200,
      instruction:
        "【営業メモ】の採用課題・人物像・商談内容のうち、記事の訴求に反映したほうがよい点を挙げる。記事に無い情報は「要確認」と付ける。",
      skip: !hasTexts ? noArticle : hasReviewMemos(d) ? null : "採用課題・商談メモなどが未入力のため省略しています。",
    },
    {
      key: "effect",
      title: "過去の改修の効果",
      maxChars: 150,
      instruction: "【過去の記事改修の前後比較】の数字を使って、改修前後の変化を述べる。効果と断定しない。",
      skip: hasImpacts ? null : "公開後の実績がある制作タスク（公開日の入ったもの）が無いため省略しています。",
    },
  ]
  return generateSections(plan, buildReviewFacts(d, texts), REVIEW_SYSTEM_PROMPT)
}
