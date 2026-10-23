// 置き場所: src/app/api/groups/[id]/members/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { canEditGroups } from "@/lib/groups"

/**
 * 所属企業の追加・削除  body: { add?: string[], remove?: string[] }（Company.id）
 * 法人グループは1社1つなので、追加すると元の法人グループからは外れる。
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canEditGroups(session)) return NextResponse.json({ error: "編集する権限がありません" }, { status: 403 })

  const { id } = await params
  const group = await prisma.companyGroup.findUnique({ where: { id }, select: { kind: true } })
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json().catch(() => null)
  const add: string[] = Array.isArray(body?.add) ? body.add.filter(Boolean) : []
  const remove: string[] = Array.isArray(body?.remove) ? body.remove.filter(Boolean) : []

  if (group.kind === "tag") {
    await prisma.companyGroup.update({
      where: { id },
      data: {
        taggedCompanies: {
          ...(add.length > 0 ? { connect: add.map(x => ({ id: x })) } : {}),
          ...(remove.length > 0 ? { disconnect: remove.map(x => ({ id: x })) } : {}),
        },
      },
    })
  } else {
    if (add.length > 0) await prisma.company.updateMany({ where: { id: { in: add } }, data: { corporateGroupId: id } })
    if (remove.length > 0) await prisma.company.updateMany({ where: { id: { in: remove }, corporateGroupId: id }, data: { corporateGroupId: null } })
  }
  return NextResponse.json({ success: true })
}
