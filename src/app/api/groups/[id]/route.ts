// 置き場所: src/app/api/groups/[id]/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { buildCompanyList } from "@/lib/companyList"
import { canEditGroups, canViewGroups, groupMemberIds, memberStats, TAG_COLORS } from "@/lib/groups"

/**
 * グループ詳細：グループ情報、所属企業ごとの数字（営業所どうしの比較）、グループ全体の合計。
 * query: months=12（応募・入社を数える期間。直近Nか月。最大36）
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canViewGroups(session)) return NextResponse.json({ error: "閲覧権限がありません" }, { status: 403 })

  const { id } = await params
  const group = await prisma.companyGroup.findUnique({ where: { id } })
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const months = Math.min(36, Math.max(1, Number(new URL(req.url).searchParams.get("months")) || 12))
  const ids = await groupMemberIds(id)
  const rows = ids.length > 0
    ? await buildCompanyList(session, { user: "all", status: "all", q: "", focus: "", ids, withGroups: true })
    : []
  const stats = await memberStats(ids, months)

  const members = rows.map(r => {
    const s = stats.get(r.id)
    return {
      ...r,
      applyN: s?.apply ?? 0,
      hiredN: s?.hired ?? 0,
      withAge: s?.withAge ?? 0,
      avgAge: s?.avgAge ?? null,
      unopenedN: s?.unopened ?? 0,
    }
  })

  const totalApply = members.reduce((a, m) => a + m.applyN, 0)
  const totalHired = members.reduce((a, m) => a + m.hiredN, 0)
  const ageWeighted = members.reduce((a, m) => a + (m.avgAge ?? 0) * m.withAge, 0)
  const ageCount = members.reduce((a, m) => a + m.withAge, 0)

  return NextResponse.json({
    group,
    months,
    totals: {
      members: members.length,
      contracted: members.filter(m => m.status === "contracted").length,
      apply: totalApply,
      hired: totalHired,
      hireRate: totalApply > 0 ? totalHired / totalApply : null,
      avgAge: ageCount > 0 ? ageWeighted / ageCount : null,
      unopened: members.reduce((a, m) => a + m.unopenedN, 0),
      attention: members.filter(m => m.flags.some(f => f.level !== "gray")).length,
    },
    members,
  })
}

/** 名前・色・メモを変更  body: { name?, color?, note? } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canEditGroups(session)) return NextResponse.json({ error: "編集する権限がありません" }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const data: Record<string, unknown> = {}
  if (body?.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: "名前を入力してください" }, { status: 400 })
    data.name = name
  }
  if (body?.color !== undefined) data.color = TAG_COLORS[body.color] ? body.color : null
  if (body?.note !== undefined) data.note = body.note || null

  const g = await prisma.companyGroup.update({ where: { id }, data })
  return NextResponse.json(g)
}

/** グループ・タグを削除（企業は削除されず、所属が外れるだけ） */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canEditGroups(session)) return NextResponse.json({ error: "削除する権限がありません" }, { status: 403 })

  const { id } = await params
  await prisma.$transaction([
    prisma.company.updateMany({ where: { corporateGroupId: id }, data: { corporateGroupId: null } }),
    prisma.companyGroup.update({ where: { id }, data: { taggedCompanies: { set: [] } } }),
    prisma.companyGroup.delete({ where: { id } }),
  ])
  return NextResponse.json({ success: true })
}
