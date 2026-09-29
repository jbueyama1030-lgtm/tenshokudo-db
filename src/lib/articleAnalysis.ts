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
/** 上位企業と全体の打ち出し率の差がこれ未満の特徴は出さない（傾向として弱いため） */
export const MIN_GAP = 0.05
/** AIに渡す記事本文の1項目あたりの最大文字数 */
const TEXT_MAX_CHARS = 500

// =====================================================================
// 型
// =====================================================================

export type FeatureRow = {
  feature: string
  /** 自社の記事で打ち出しているか */
  own: boolean
  /** 上位企業のうち打ち出している社数 */
  topHas: number
  /** 上位企業のうち打ち出している割合（0〜1） */
  topRate: number
  /** 比較グループ全体のうち打ち出している社数 */
  allHas: number
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
      /** 自社の記事データがあるか（新規提案では false のことがある） */
      hasOwnArticle: boolean
      ownTitle: string | null
      ownFeatures: string[]
      /** 求人ページの更新日時（ISO） */
      pageUpdatedAt: string | null
      /**
       * 差（gap）が MIN_GAP 以上の特徴だけ。
       * 並び順: 御社が打ち出していない特徴 → 打ち出している特徴、それぞれ gap の大きい順
       */
      rows: FeatureRow[]
    }
  | { available: false; reason: string }

// =====================================================================
// 本体
// =====================================================================

/**
 * 自社の記事の特徴フラグを、比較グループ（同エリアの掲載企業）の
 * 「入社率上位企業」「全体」の打ち出し率と比べる（定例報告・記事改善用）。
 * 自社の記事が無ければ unavailable。
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
    select: { prefecture: true, features: true, title: true, pageUpdatedAt: true },
  })
  if (!own) {
    return { available: false, reason: "転職道の記事データが未取り込みか、企業IDが紐づいていないため省略" }
  }
  return analyzeFeatureTrends(
    {
      prefecture: own.prefecture,
      excludeCompanyId: companyDbId,
      ownFeatures: own.features,
      ownTitle: own.title,
      pageUpdatedAt: own.pageUpdatedAt,
    },
    period,
  )
}

/**
 * エリアの掲載企業のうち「入社率上位企業」が打ち出している特徴の傾向。
 * 自社の記事が無い企業（新規提案）でも使えるよう、ownFeatures は null 可。
 */
export async function analyzeFeatureTrends(
  args: {
    prefecture: string | null
    excludeCompanyId: string
    ownFeatures: string[] | null
    ownTitle?: string | null
    pageUpdatedAt?: Date | null
  },
  period: Period,
): Promise<ArticleComparison> {
  const ownFeatures = args.ownFeatures ?? []

  // ---- 比較対象（掲載中・企業に紐づいている記事） ----
  const peers = await prisma.jobArticle.findMany({
    where: { isListed: true, companyRef: { not: null, notIn: [args.excludeCompanyId] } },
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
  let group = args.prefecture ? eligible.filter(p => p.prefecture === args.prefecture) : []
  let scopeLabel = `${args.prefecture}の掲載企業`
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

  const countHas = (list: { features: string[] }[], f: string) =>
    list.filter(x => x.features.includes(f)).length

  const rows: FeatureRow[] = FEATURE_COLUMNS.map(f => {
    const topHas = countHas(top, f)
    const allHas = countHas(group, f)
    const topRate = topHas / top.length
    const allRate = allHas / group.length
    return { feature: f, own: ownFeatures.includes(f), topHas, topRate, allHas, allRate, gap: topRate - allRate }
  })
    .filter(r => r.gap >= MIN_GAP)
    .sort((a, b) => {
      if (a.own !== b.own) return a.own ? 1 : -1
      return b.gap - a.gap
    })

  return {
    available: true,
    scopeLabel,
    peerCount: group.length,
    topCount,
    hasOwnArticle: args.ownFeatures != null,
    ownTitle: args.ownTitle ?? null,
    ownFeatures,
    pageUpdatedAt: args.pageUpdatedAt ? args.pageUpdatedAt.toISOString() : null,
    rows,
  }
}

// =====================================================================
// 記事本文（AIの改善提案用）
// =====================================================================

/** AIに読ませる記事の項目（CSVの列名 → 表示名） */
const TEXT_FIELDS: { column: string; label: string }[] = [
  { column: "タイトル", label: "タイトル" },
  { column: "ピックアップタイトル", label: "ピックアップ見出し" },
  { column: "ピックアップ本文", label: "ピックアップ本文" },
  { column: "アピールポイントタイトル", label: "アピールポイント見出し" },
  { column: "アピールポイント本文", label: "アピールポイント本文" },
  { column: "会社の特徴1タイトル", label: "会社の特徴1 見出し" },
  { column: "会社の特徴1", label: "会社の特徴1 本文" },
  { column: "会社の特徴2タイトル", label: "会社の特徴2 見出し" },
  { column: "会社の特徴2", label: "会社の特徴2 本文" },
  { column: "給与", label: "給与" },
  { column: "待遇", label: "待遇" },
  { column: "休日", label: "休日" },
  { column: "応募資格", label: "応募資格" },
  { column: "求職者へメッセージ", label: "求職者へのメッセージ" },
]

export type ArticleText = { label: string; text: string; truncated: boolean }

/** 自社の記事本文（長い項目は先頭だけ）。記事が無ければ null */
export async function loadArticleTexts(
  companyDbId: string,
  maxChars: number = TEXT_MAX_CHARS,
): Promise<ArticleText[] | null> {
  const article = await prisma.jobArticle.findUnique({
    where: { companyRef: companyDbId },
    select: { data: true },
  })
  if (!article) return null
  const data = (article.data ?? {}) as Record<string, string>
  const out: ArticleText[] = []
  for (const f of TEXT_FIELDS) {
    const raw = (data[f.column] ?? "").replace(/\r/g, "").trim()
    if (!raw) continue
    const truncated = raw.length > maxChars
    out.push({ label: f.label, text: truncated ? raw.slice(0, maxChars) : raw, truncated })
  }
  return out.length > 0 ? out : null
}
