// 置き場所: src/app/api/groups/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { canEditGroups, canViewGroups, TAG_COLORS } from "@/lib/groups"

/** グループ・タグの一覧（所属企業の数つき） */
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canViewGroups(session)) return NextResponse.json({ error: "閲覧権限がありません" }, { status: 403 })

  const groups = await prisma.companyGroup.findMany({
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, kind: true, color: true, note: true, sourceGroupId: true,
      _count: { select: { members: true, taggedCompanies: true } },
    },
  })
  return NextResponse.json(
    groups.map(g => ({
      id: g.id, name: g.name, kind: g.kind, color: g.color, note: g.note, sourceGroupId: g.sourceGroupId,
      memberCount: g.kind === "tag" ? g._count.taggedCompanies : g._count.members,
    })),
  )
}

/** グループ・タグを作成  body: { name, kind: "corporate" | "tag", color?, note? } */
export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canEditGroups(session)) return NextResponse.json({ error: "作成する権限がありません" }, { status: 403 })

  const body = await req.json().catch(() => null)
  const name = String(body?.name ?? "").trim()
  if (!name) return NextResponse.json({ error: "名前を入力してください" }, { status: 400 })
  const kind = body?.kind === "tag" ? "tag" : "corporate"
  const color = kind === "tag" && body?.color && TAG_COLORS[body.color] ? body.color : kind === "tag" ? "gray" : null

  const g = await prisma.companyGroup.create({ data: { name, kind, color, note: body?.note || null } })
  return NextResponse.json(g)
}
