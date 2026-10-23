// 置き場所: src/app/api/groups/import/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { isAdmin, isAgencyUser } from "@/lib/permissions"

/** "株式会社〇〇(本社営業所)" → "〇〇" のように、グループ名の候補を作る */
function baseName(name: string): string {
  return name
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/株式会社|有限会社|合同会社|\s/g, "")
    .trim()
}

/**
 * 転職道の記事CSV（記事インポート）の「企業グループID」から法人グループを自動作成する。
 * - ID が 0 や空のものは対象外
 * - DB の企業に紐づいている記事が2社以上あるIDだけ作る
 * - すでに作成済みのID（sourceGroupId）は作らず、まだ法人グループが無い企業だけ追加する
 * - グループ名は仮の名前（あとで画面から付け直す）
 * 管理者のみ。
 */
export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (isAgencyUser(session) || !isAdmin(session)) {
    return NextResponse.json({ error: "管理者のみ実行できます" }, { status: 403 })
  }

  const articles = await prisma.jobArticle.findMany({
    where: { companyRef: { not: null } },
    select: { companyRef: true, name: true, data: true },
  })

  const byGroup = new Map<string, { companyId: string; name: string }[]>()
  for (const a of articles) {
    const gid = String(((a.data ?? {}) as Record<string, string>)["企業グループID"] ?? "").trim()
    if (!gid || gid === "0") continue
    const list = byGroup.get(gid) ?? []
    list.push({ companyId: a.companyRef!, name: a.name })
    byGroup.set(gid, list)
  }

  let created = 0
  let assigned = 0
  for (const [gid, list] of byGroup) {
    if (list.length < 2) continue
    let group = await prisma.companyGroup.findUnique({ where: { sourceGroupId: gid } })
    if (!group) {
      group = await prisma.companyGroup.create({
        data: {
          name: baseName(list[0].name) + "グループ（仮）",
          kind: "corporate",
          sourceGroupId: gid,
          note: "転職道の企業グループID " + gid + " から自動作成。名前を確認して付け直してください。",
        },
      })
      created++
    }
    const res = await prisma.company.updateMany({
      where: { id: { in: list.map(x => x.companyId) }, corporateGroupId: null },
      data: { corporateGroupId: group.id },
    })
    assigned += res.count
  }

  return NextResponse.json({ created, assigned })
}
