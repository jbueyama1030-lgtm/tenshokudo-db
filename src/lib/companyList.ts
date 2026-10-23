// 置き場所: src/lib/companyList.ts
// 企業一覧（営業のやることリスト）の集計。画面とCSV書き出しで共用する。
import { prisma } from "@/lib/prisma"
import { extractPref } from "@/lib/area"
import { companyScopeFilter } from "@/lib/permissions"
import { addMonths, currentYmJst, ymKey } from "@/lib/funnelAnalysis"

// ===== しきい値 =====
/** 契約更新が何日以内なら知らせるか（赤／黄） */
const RENEWAL_RED_DAYS = 30
const RENEWAL_YELLOW_DAYS = 60
/** 契約中で、最後の応募から何日たったら「応募が止まっている」とするか */
const NO_APPLY_DAYS = 30
/** 求人ページの更新から何日たったら「記事が古い」とするか */
const STALE_ARTICLE_DAYS = 180
/** 次回アクションが何日以内なら「もうすぐ」とするか */
const ACTION_SOON_DAYS = 3
/** 何日以内の応募の「企業未開封」を数えるか */
const UNOPENED_DAYS = 30

export type FocusKey =
  | "unopened"
  | "action_overdue"
  | "renewal"
  | "no_apply"
  | "unassigned"
  | "stale_article"
  | "action_soon"
  | "missing_info"

export type Flag = { key: FocusKey; label: string; level: "red" | "yellow" | "gray"; score: number }

export const FOCUS_OPTIONS: { key: FocusKey | "attention"; label: string }[] = [
  { key: "attention", label: "要対応すべて" },
  { key: "unopened", label: "応募が未開封" },
  { key: "action_overdue", label: "次回アクション超過" },
  { key: "renewal", label: "更新が近い" },
  { key: "no_apply", label: "応募が止まっている" },
  { key: "stale_article", label: "記事が古い" },
  { key: "unassigned", label: "担当未定" },
]

export type CompanyRow = {
  id: string
  companyId: string | null
  name: string
  status: string
  prefecture: string
  address: string | null
  phone: string | null
  userId: string
  userName: string
  temperature: string | null
  hasReferralContract: boolean
  workplaceCertLevel: number
  apply3m: number
  hire3m: number
  /** 直近30日の応募のうち、企業がまだ開封していない件数 */
  unopened: number
  lastAppliedAt: string | null
  nextAction: string | null
  nextActionDate: string | null
  renewalDate: string | null
  flags: Flag[]
  score: number
  updatedAt: string
}

export type CompanyListParams = {
  /** "all" か ユーザーID */
  user: string
  status: string
  q: string
  /** FocusKey か "attention"（赤・黄の札があるもの）か "" */
  focus: string
  /** 人材紹介（advisor）向けの追加条件。prisma の where にそのまま混ぜる */
  extraWhere?: Record<string, unknown>
  /** 指定すると、この企業IDだけに絞る（CSVの選択出力用） */
  ids?: string[]
}

const DAY = 86400000
function startOfTodayJst(): number {
  const now = Date.now() + 9 * 3600000
  return Math.floor(now / DAY) * DAY - 9 * 3600000
}
function md(d: Date): string {
  const j = new Date(d.getTime() + 9 * 3600000)
  return `${j.getUTCMonth() + 1}/${j.getUTCDate()}`
}

type SessionLike = Parameters<typeof companyScopeFilter>[0]

export async function buildCompanyList(session: SessionLike, p: CompanyListParams): Promise<CompanyRow[]> {
  const companies = await prisma.company.findMany({
    where: {
      ...companyScopeFilter(session),
      ...(p.user !== "all" ? { userId: p.user } : {}),
      ...(p.status !== "all" ? { status: p.status } : {}),
      ...(p.extraWhere ?? {}),
      ...(p.ids && p.ids.length > 0 ? { id: { in: p.ids } } : {}),
      ...(p.q
        ? {
            OR: [
              { name: { contains: p.q, mode: "insensitive" } },
              { companyId: { contains: p.q, mode: "insensitive" } },
              { address: { contains: p.q, mode: "insensitive" } },
              { phone: { contains: p.q } },
            ],
          }
        : {}),
    },
    select: {
      id: true, companyId: true, name: true, status: true, address: true, phone: true, userId: true,
      temperature: true, hasReferralContract: true, workplaceCertLevel: true,
      nextAction: true, nextActionDate: true, vehicleCount: true, adoptionChallenge: true, updatedAt: true,
      user: { select: { name: true, roles: true, role: true } },
      contractPeriods: { select: { contractStart: true, contractEnd: true, contractRenewal: true } },
      jobArticle: { select: { pageUpdatedAt: true, isListed: true } },
    },
  })

  // 直近3か月（今月＋前2か月）の応募・入社と、最後の応募日
  const fromKey = ymKey(addMonths(currentYmJst(), -2))
  const unopenedSince = new Date(Date.now() - UNOPENED_DAYS * 86400000)
  const stats = await prisma.$queryRaw<{ companyRef: string; apply3m: number; hire3m: number; unopened: number; lastApplied: Date | null }[]>`
    SELECT "companyRef",
           COUNT(*) FILTER (WHERE ("year" * 100 + "month") >= ${fromKey})::int AS apply3m,
           COUNT(*) FILTER (WHERE ("year" * 100 + "month") >= ${fromKey} AND "status" = '入社')::int AS hire3m,
           COUNT(*) FILTER (WHERE "companyOpened" = false AND "appliedAt" >= ${unopenedSince})::int AS unopened,
           MAX("appliedAt") AS "lastApplied"
    FROM "ApplicationRecord"
    WHERE "companyRef" IS NOT NULL
    GROUP BY "companyRef"
  `
  const statById = new Map(stats.map(s => [s.companyRef, s]))

  const today = startOfTodayJst()
  const now = Date.now()

  const rows: CompanyRow[] = companies.map(c => {
    const st = statById.get(c.id)
    const flags: Flag[] = []
    const contracted = c.status === "contracted"

    // 企業が応募を開封していない（直近30日）
    const unopened = st ? Number(st.unopened) : 0
    if (unopened > 0) {
      flags.push({ key: "unopened", label: `未開封の応募 ${unopened}件`, level: "red", score: 85 })
    }

    // 次回アクション
    if (c.nextActionDate) {
      const d = c.nextActionDate.getTime()
      if (d < today) {
        const over = Math.floor((today - d) / DAY)
        flags.push({ key: "action_overdue", label: `次回アクション ${over}日超過`, level: "red", score: 100 })
      } else if (d <= today + ACTION_SOON_DAYS * DAY) {
        flags.push({ key: "action_soon", label: `次回アクション ${md(c.nextActionDate)}`, level: "yellow", score: 40 })
      }
    }

    // 契約の更新（今アクティブな期間の更新日）
    let renewal: Date | null = null
    for (const cp of c.contractPeriods) {
      const active = cp.contractStart && cp.contractStart.getTime() <= now && (!cp.contractEnd || cp.contractEnd.getTime() >= now)
      if (active && cp.contractRenewal && cp.contractRenewal.getTime() >= today) {
        if (!renewal || cp.contractRenewal < renewal) renewal = cp.contractRenewal
      }
    }
    if (contracted && renewal) {
      const left = Math.ceil((renewal.getTime() - today) / DAY)
      if (left <= RENEWAL_RED_DAYS) flags.push({ key: "renewal", label: `更新まで ${left}日`, level: "red", score: 90 })
      else if (left <= RENEWAL_YELLOW_DAYS) flags.push({ key: "renewal", label: `更新まで ${left}日`, level: "yellow", score: 60 })
    }

    // 応募が止まっている（契約中のみ）
    if (contracted) {
      const last = st?.lastApplied ? new Date(st.lastApplied) : null
      if (!last) {
        flags.push({ key: "no_apply", label: "応募の記録なし", level: "yellow", score: 70 })
      } else {
        const days = Math.floor((now - last.getTime()) / DAY)
        if (days >= NO_APPLY_DAYS) flags.push({ key: "no_apply", label: `応募が止まって ${days}日`, level: "red", score: 80 })
      }
    }

    // 担当未定（担当者が営業ロールを持っていない＝管理者などに仮置き）
    const roles = c.user.roles.length > 0 ? c.user.roles : c.user.role ? [c.user.role] : []
    if (!roles.includes("sales")) {
      flags.push({ key: "unassigned", label: "担当未定", level: "yellow", score: 55 })
    }

    // 記事が古い（契約中で掲載中の記事）
    if (contracted && c.jobArticle?.isListed && c.jobArticle.pageUpdatedAt) {
      const days = Math.floor((now - c.jobArticle.pageUpdatedAt.getTime()) / DAY)
      if (days >= STALE_ARTICLE_DAYS) flags.push({ key: "stale_article", label: `記事更新から ${days}日`, level: "yellow", score: 50 })
    }

    // 未入力（レポート・提案に効く項目）
    if (contracted && (c.vehicleCount == null || !c.adoptionChallenge)) {
      flags.push({ key: "missing_info", label: "未入力あり", level: "gray", score: 5 })
    }

    flags.sort((a, b) => b.score - a.score)

    return {
      id: c.id,
      companyId: c.companyId,
      name: c.name,
      status: c.status,
      prefecture: extractPref(c.address),
      address: c.address,
      phone: c.phone,
      userId: c.userId,
      userName: c.user.name,
      temperature: c.temperature,
      hasReferralContract: c.hasReferralContract,
      workplaceCertLevel: c.workplaceCertLevel ?? 0,
      apply3m: st ? Number(st.apply3m) : 0,
      hire3m: st ? Number(st.hire3m) : 0,
      unopened: st ? Number(st.unopened) : 0,
      lastAppliedAt: st?.lastApplied ? new Date(st.lastApplied).toISOString() : null,
      nextAction: c.nextAction,
      nextActionDate: c.nextActionDate ? c.nextActionDate.toISOString() : null,
      renewalDate: renewal ? renewal.toISOString() : null,
      flags,
      score: flags.length > 0 ? flags[0].score : 0,
      updatedAt: c.updatedAt.toISOString(),
    }
  })

  const filtered = !p.focus
    ? rows
    : p.focus === "attention"
      ? rows.filter(r => r.flags.some(f => f.level !== "gray"))
      : rows.filter(r => r.flags.some(f => f.key === p.focus))

  // 急ぐ順 → 次回アクション日が近い順 → 更新日時が新しい順
  return filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const an = a.nextActionDate ?? "9999"
    const bn = b.nextActionDate ?? "9999"
    if (an !== bn) return an.localeCompare(bn)
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}
