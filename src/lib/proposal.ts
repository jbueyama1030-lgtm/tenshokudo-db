// 置き場所: src/lib/proposal.ts
import { prisma } from "@/lib/prisma"
import { analyzeCompanyFunnel, type Comparison, type Period, type YearMonth } from "@/lib/funnelAnalysis"
import { analyzeFeatureTrends, type ArticleComparison } from "@/lib/articleAnalysis"
import { generateSections, pct, type PlannedSection, type ReportInsight } from "@/lib/reportWriter"

/** 新規提案の既定期間（相場は長めに見る） */
export const PROPOSAL_DEFAULT_MONTHS = 12

// =====================================================================
// データ
// =====================================================================

export type ProposalData = {
  company: {
    id: string
    name: string
    prefecture: string
    vehicleCount: number | null
    driverCount: number | null
    shifts: string[]
    apps: string[]
    annualHiringTarget: number | null
    adoptionChallenge: string | null
    /** 転職道に掲載中の記事があるか */
    isListed: boolean
  }
  period: Period
  inProgressMonth: YearMonth | null
  generatedAt: string
  area: Comparison
  size: Comparison
  features: ArticleComparison
}

/**
 * 未掲載企業への提案用データ。
 * 顧客に渡す資料なので、商談メモ・社内メモは使わない（採用課題・年間採用目標など顧客と話す前提の項目のみ）。
 */
export async function buildProposalData(companyDbId: string, period: Period): Promise<ProposalData | null> {
  const [funnel, company, article] = await Promise.all([
    analyzeCompanyFunnel(companyDbId, period),
    prisma.company.findUnique({
      where: { id: companyDbId },
      select: { shifts: true, apps: true, annualHiringTarget: true, adoptionChallenge: true },
    }),
    prisma.jobArticle.findUnique({
      where: { companyRef: companyDbId },
      select: { features: true, isListed: true },
    }),
  ])
  if (!funnel || !company) return null

  const prefecture = funnel.company.prefecture
  const features = await analyzeFeatureTrends(
    {
      prefecture: prefecture === "不明" ? null : prefecture,
      excludeCompanyId: companyDbId,
      ownFeatures: article?.features ?? null,
    },
    period,
  )

  return {
    company: {
      id: funnel.company.id,
      name: funnel.company.name,
      prefecture,
      vehicleCount: funnel.company.vehicleCount,
      driverCount: funnel.company.driverCount,
      shifts: company.shifts ?? [],
      apps: company.apps ?? [],
      annualHiringTarget: company.annualHiringTarget,
      adoptionChallenge: company.adoptionChallenge,
      isListed: !!article?.isListed,
    },
    period,
    inProgressMonth: funnel.inProgressMonth,
    generatedAt: new Date().toISOString(),
    area: funnel.comparisons.area,
    size: funnel.comparisons.size,
    features,
  }
}

// =====================================================================
// AI所見
// =====================================================================

const PROPOSAL_ROWS_FOR_AI = 8

const PROPOSAL_SYSTEM_PROMPT = `あなたは、タクシー業界専門の求人媒体「転職道」の営業担当者です。
まだ転職道に掲載していないタクシー会社に向けた、採用のご提案資料の文章を書きます。

厳守するルール:
- 使ってよい数値は【事実】に書かれているものだけです。計算・推測で新しい数値を作らないでください。数値を引用するときは【事実】の表記のまま書いてください。
- 読み手は提案先企業の経営者・採用担当者です。「御社」と呼び、です・ます調で書いてください。
- 成果を約束しないでください。「〜件の応募が見込めます」「〜名採用できます」とは書かず、「同エリアの掲載企業では1社あたり平均〜」の形で相場として示してください。
- 他社の企業名や、個別企業を推測させる表現は使わないでください。
- 記事の特徴と成果の関係は傾向であって因果ではありません。「上位企業では〜を打ち出している割合が高い」の形で書き、御社に該当する制度があるかは分からないため「該当する制度があれば」と前置きしてください。
- 【事実】に無い御社の制度・待遇・実績を、あるものとして書かないでください。
- 各セクションは指定の文字数以内で、箇条書きや記号を使わず文章で書いてください。
- 文章の中で半角のダブルクォートは使わず、強調したい語は「」で囲んでください。`

function comparisonLines(c: Comparison): string[] {
  if (!c.available) return [`${c.label}: 比較なし（${c.reason}）`]
  return [
    `${c.label}（比較対象 ${c.companyCount}社）: 1社あたり 応募 ${c.perCompany.apply.toFixed(1)}件 / 面接設定 ${c.perCompany.interviewSet.toFixed(1)}件 / 入社 ${c.perCompany.hired.toFixed(1)}件`,
    `${c.label}の歩留まり: 応募→面接設定 ${pct(c.rates.applyToSet)} / 応募→入社 ${pct(c.rates.applyToHire)}`,
  ]
}

function buildProposalFacts(d: ProposalData): string {
  const c = d.company
  const lines: string[] = []
  lines.push(`対象期間: ${d.period.from.year}年${d.period.from.month}月〜${d.period.to.year}年${d.period.to.month}月（転職道の掲載企業の実績）`)
  lines.push("")
  lines.push("【御社の情報】")
  lines.push(`所在地: ${c.prefecture}`)
  if (c.vehicleCount != null) lines.push(`保有台数: ${c.vehicleCount}台`)
  if (c.driverCount != null) lines.push(`乗務員数: ${c.driverCount}名`)
  if (c.shifts.length > 0) lines.push(`募集勤務形態: ${c.shifts.join("、")}`)
  if (c.apps.length > 0) lines.push(`導入アプリ: ${c.apps.join("、")}`)
  if (c.annualHiringTarget != null) lines.push(`年間採用目標: ${c.annualHiringTarget}名`)
  if (c.adoptionChallenge) lines.push(`採用課題: ${c.adoptionChallenge.slice(0, 600)}`)
  lines.push("")
  lines.push("【エリア・同規模の採用状況】")
  lines.push(...comparisonLines(d.area))
  lines.push(...comparisonLines(d.size))

  if (d.features.available) {
    const f = d.features
    lines.push("")
    lines.push(`【上位企業の記事の打ち出し】比較対象: ${f.scopeLabel} ${f.peerCount}社（うち入社率の上位 ${f.topCount}社）`)
    if (f.rows.length === 0) lines.push("上位企業と全体で打ち出し方に目立った差のある特徴は無い")
    for (const row of f.rows.slice(0, PROPOSAL_ROWS_FOR_AI)) {
      lines.push(`${row.feature}: 上位企業 ${pct(row.topRate)}（${row.topHas}/${f.topCount}社） / 全体 ${pct(row.allRate)}`)
    }
  }
  return lines.join("\n")
}

export async function writeProposalInsight(d: ProposalData): Promise<ReportInsight> {
  const hasComparison = d.area.available || d.size.available
  const hasNeeds = !!d.company.adoptionChallenge || d.company.annualHiringTarget != null
  const hasFeatures = d.features.available && d.features.rows.length > 0

  const plan: PlannedSection[] = [
    {
      key: "market",
      title: "エリアの採用状況",
      maxChars: 140,
      instruction: "エリア平均・同規模平均の1社あたり応募数・入社数と歩留まりを使い、転職道での採用の相場感を伝える。",
      skip: hasComparison ? null : "比較できる掲載企業のデータが無いため省略しています。",
    },
    {
      key: "fit",
      title: "御社の課題に合わせたご提案",
      maxChars: 180,
      instruction:
        "御社の採用課題・年間採用目標・勤務形態・台数を踏まえ、転職道の活用で取り組めることを提案する。目標と相場を比べる場合も達成を約束しない。",
      skip: hasNeeds ? null : "採用課題・年間採用目標が未入力のため省略しています（企業詳細で入力すると反映されます）。",
    },
    {
      key: "article",
      title: "記事で打ち出したいポイント",
      maxChars: 160,
      instruction: "上位企業で打ち出している割合が高い特徴を2〜3個挙げ、該当する制度があれば記事で打ち出すことを勧める。",
      skip: hasFeatures ? null : "上位企業の記事の傾向に目立った差が無いため省略しています。",
    },
  ]
  return generateSections(plan, buildProposalFacts(d), PROPOSAL_SYSTEM_PROMPT)
}
