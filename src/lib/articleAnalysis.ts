// 置き場所: src/lib/articleAnalysis.ts
import { prisma } from "@/lib/prisma"
import { FEATURE_COLUMNS } from "@/lib/importArticles"
import { ymKey, type Period } from "@/lib/funnelAnalysis"

// =====================================================================
// 設定
// =====================================================================

/** 入社率で順位を付ける対象にする最低応募数（少なすぎる企業は率がぶれるので除外） */
export const MIN_APPLY_FOR_RANKING = 10
/** 比較グループに必要な最低社数。エリアで足りなければ全国に広げる */
export const MIN_PEERS = 15
/** 上位企業 = 入社率の上位この割合 */
export const TOP_SHARE = 1 / 3

// =====================================================================
// 型
// =====================================================================

export type FeatureRow = {
  feature: string
  /** 自社の記事で打ち出しているか */
  own: boolean
  /** 上位企業のうち打ち出している割合（0〜1） */
  topRate: number
  /** 比較グループ全体のうち打ち出している割合（0〜1） */
  allRate: number
  /** topRate − allRate（上位企業ほど打ち出している度合い） */
  gap: number
}

export type ArticleComparison =
  | {
      available: true
      /** 比較グループの説明（例: 東京都の掲載企業） */
      scopeLabel: string
      /** 比較グループの社数（応募が一定数以上ある掲載企業） */
      peerCount: number
      /** うち上位企業の社数 */
      topCount: number
      ownTitle: string | null
      ownFeatures: string[]
      /** 求人ページの更新日時（ISO） */
      pageUpdatedAt: string | null
      /** gap の大きい順 */
      rows: FeatureRow[]
    }
  | { available: false; reason: string }

// =====================================================================
// 本体
// =====================================================================

/**
 * 自社の記事の特徴フラグを、比較グループ（同エリアの掲載企業）の
 * 「入社率上位企業」「全体」の打ち出し率と比べる。
 *
 * 注意: これは相関であって因果ではない。
 * 「上位企業は○○を打ち出している割合が高い」までしか言えない。
 */
export async function analyzeArticleComparison(
  companyDbId: string,
  period: Period,
): Promise<ArticleComparison> {
  const own = await prisma.jobArticle.findUnique({
    where: { companyRef: companyDbId },
    select: { prefecture: true, features: true, title: true, pageUpdatedAt: true, isListed: true },
  })
  if (!own) {
    return { available: false, reason: "転職道の記事データが未取り込みか、企業IDが紐づいていないため省略" }
  }

  // ---- 比較対象（掲載中・企業に紐づいている記事） ----
  const peers = await prisma.jobArticle.findMany({
    where: { isListed: true, companyRef: { not: null, notIn: [companyDbId] } },
    select: { companyRef: true, prefecture: true, features: true },
  })

  // ---- 期間内の成績（応募数・入社数） ----
  const perf = await prisma.$queryRaw<{ companyRef: string; apply: number; hired: number }[]>`
    SELECT "companyRef",
           COUNT(*)::int AS apply,
           COUNT(*) FILTER (WHERE "status" = '入社')::int AS hired
    FROM "ApplicationRecord"
    WHERE "companyRef" IS NOT NULL
      AND ("year" * 100 + "month") BETWEEN ${ymKey(period.from)} AND ${ymKey(period.to)}
    GROUP BY "companyRef"
  `
  const perfById = new Map(perf.map(p => [p.companyRef, { apply: Number(p.apply), hired: Number(p.hired) }]))

  const eligible = peers
    .map(p => ({ ...p, ...(perfById.get(p.companyRef!) ?? { apply: 0, hired: 0 }) }))
    .filter(p => p.apply >= MIN_APPLY_FOR_RANKING)

  // エリアで足りなければ全国
  let group = own.prefecture ? eligible.filter(p => p.prefecture === own.prefecture) : []
  let scopeLabel = `${own.prefecture}の掲載企業`
  if (group.length < MIN_PEERS) {
    group = eligible
    scopeLabel = "全国の掲載企業"
  }
  if (group.length < MIN_PEERS) {
    return {
      available: false,
      reason: `比較できる掲載企業が${group.length}社のため省略（${MIN_PEERS}社以上で表示）`,
    }
  }

  // ---- 入社率で順位付け（同率なら入社数が多い方を上に） ----
  const ranked = [...group].sort((a, b) => {
    const ra = a.hired / a.apply
    const rb = b.hired / b.apply
    if (rb !== ra) return rb - ra
    return b.hired - a.hired
  })
  const topCount = Math.ceil(ranked.length * TOP_SHARE)
  const top = ranked.slice(0, topCount)

  const share = (list: { features: string[] }[], f: string) =>
    list.filter(x => x.features.includes(f)).length / list.length

  const rows: FeatureRow[] = FEATURE_COLUMNS.map(f => {
    const topRate = share(top, f)
    const allRate = share(group, f)
    return { feature: f, own: own.features.includes(f), topRate, allRate, gap: topRate - allRate }
  }).sort((a, b) => b.gap - a.gap)

  return {
    available: true,
    scopeLabel,
    peerCount: group.length,
    topCount,
    ownTitle: own.title,
    ownFeatures: own.features,
    pageUpdatedAt: own.pageUpdatedAt ? own.pageUpdatedAt.toISOString() : null,
    rows,
  }
}