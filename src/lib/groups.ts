// 置き場所: src/lib/groups.ts
// 企業のグループ・タグ（社内向け）の共通処理
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { addMonths, currentYmJst, ymKey } from "@/lib/funnelAnalysis"
import { isAdmin, isAgencyUser, isMarketer, isProduction, isSales } from "@/lib/permissions"

type SessionLike = Parameters<typeof isAgencyUser>[0]

/** タグの色 */
export const TAG_COLORS: Record<string, { label: string; cls: string }> = {
  red: { label: "赤", cls: "bg-red-100 text-red-700" },
  amber: { label: "黄", cls: "bg-amber-100 text-amber-800" },
  green: { label: "緑", cls: "bg-green-100 text-green-700" },
  blue: { label: "青", cls: "bg-blue-100 text-blue-700" },
  purple: { label: "紫", cls: "bg-purple-100 text-purple-700" },
  gray: { label: "灰", cls: "bg-gray-100 text-gray-600" },
}

/** グループ・タグを見られるか（社内のみ） */
export function canViewGroups(session: SessionLike): boolean {
  if (isAgencyUser(session)) return false
  return isAdmin(session) || isSales(session) || isMarketer(session) || isProduction(session)
}

/** グループ・タグを作成・編集できるか */
export function canEditGroups(session: SessionLike): boolean {
  if (isAgencyUser(session)) return false
  return isAdmin(session) || isSales(session) || isMarketer(session)
}

export type MemberStats = {
  companyRef: string
  apply: number
  hired: number
  withAge: number
  avgAge: number | null
  unopened: number
}

/** 企業ごとの直近 months か月の応募・入社・平均年齢・未開封 */
export async function memberStats(companyIds: string[], months: number): Promise<Map<string, MemberStats>> {
  const out = new Map<string, MemberStats>()
  if (companyIds.length === 0) return out
  const fromKey = ymKey(addMonths(currentYmJst(), -(months - 1)))
  const rows = await prisma.$queryRaw<MemberStats[]>`
    SELECT "companyRef",
           COUNT(*)::int AS apply,
           COUNT(*) FILTER (WHERE "status" = '入社')::int AS hired,
           COUNT("age")::int AS "withAge",
           AVG("age")::float AS "avgAge",
           COUNT(*) FILTER (WHERE "companyOpened" = false)::int AS unopened
    FROM "ApplicationRecord"
    WHERE "companyRef" IN (${Prisma.join(companyIds)})
      AND ("year" * 100 + "month") >= ${fromKey}
    GROUP BY "companyRef"
  `
  for (const r of rows) {
    out.set(r.companyRef, {
      companyRef: r.companyRef,
      apply: Number(r.apply),
      hired: Number(r.hired),
      withAge: Number(r.withAge),
      avgAge: r.avgAge != null ? Number(r.avgAge) : null,
      unopened: Number(r.unopened),
    })
  }
  return out
}

/** グループに所属する企業ID（法人グループはメンバー、タグは付いている企業） */
export async function groupMemberIds(groupId: string): Promise<string[]> {
  const g = await prisma.companyGroup.findUnique({
    where: { id: groupId },
    select: { kind: true, members: { select: { id: true } }, taggedCompanies: { select: { id: true } } },
  })
  if (!g) return []
  return (g.kind === "tag" ? g.taggedCompanies : g.members).map(c => c.id)
}
