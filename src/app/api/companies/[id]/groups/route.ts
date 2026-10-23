// 置き場所: src/app/api/companies/[id]/groups/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { canViewGroups } from "@/lib/groups"

/** 企業の法人グループ・タグと、選べるグループ・タグの一覧（社内のみ） */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canViewGroups(session)) return NextResponse.json({ error: "閲覧権限がありません" }, { status: 403 })

  const { id } = await params
  const [company, all] = await Promise.all([
    prisma.company.findUnique({
      where: { id },
      select: {
        corporateGroup: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true, color: true } },
      },
    }),
    prisma.companyGroup.findMany({ orderBy: [{ kind: "asc" }, { name: "asc" }], select: { id: true, name: true, kind: true, color: true } }),
  ])
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ corporate: company.corporateGroup, tags: company.tags, all })
}
