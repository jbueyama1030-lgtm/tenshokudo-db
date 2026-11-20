// 置き場所: src/app/api/companies/[id]/quests/route.ts
// 企業ページに出す「初回電話の記録」。直近の応募30件分を、応募ごとにまとめて返す

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { isAgencyUser, isInAgencyScope } from "@/lib/permissions"
import { wallClockToInstant } from "@/lib/businessCalendar"
import { FIRST_CALL, RESULT_LABELS } from "@/lib/quests/firstCall"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const company = await prisma.company.findUnique({ where: { id }, select: { agencyId: true } })
  if (!company || !isInAgencyScope(session, company.agencyId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  // クエストは社内向け（代理店ユーザーには空で返す）
  if (isAgencyUser(session)) return NextResponse.json({ items: [] })

  const quests = await prisma.quest.findMany({
    where: { companyId: id, type: FIRST_CALL },
    orderBy: [{ createdAt: "desc" }],
    take: 120,
    select: {
      id: true, status: true, attempt: true, dueAt: true, applicationId: true,
      result: true, resultNote: true, doneAt: true,
      doneBy: { select: { name: true } },
      application: { select: { externalId: true, appliedAt: true, entryType: true, inflow: true } },
    },
  })

  // 応募ごとにまとめる
  const groups = new Map<string, typeof quests>()
  for (const q of quests) {
    const key = q.applicationId ?? "quest:" + q.id
    const list = groups.get(key) ?? []
    list.push(q)
    groups.set(key, list)
  }

  const items = Array.from(groups.entries()).slice(0, 30).map(([key, list]) => {
    const sorted = [...list].sort((a, b) => a.attempt - b.attempt)
    const app = sorted[0].application
    const open = sorted.find(q => q.status === "open") ?? null
    return {
      key,
      appliedAt: app ? wallClockToInstant(app.appliedAt).toISOString() : null,
      externalId: app?.externalId ?? null,
      entryType: app?.entryType ?? null,
      inflow: app?.inflow ?? null,
      open: open ? { attempt: open.attempt, dueAt: open.dueAt.toISOString() } : null,
      history: sorted.filter(q => q.status === "done").map(q => ({
        attempt: q.attempt,
        resultLabel: q.result ? RESULT_LABELS[q.result] ?? q.result : null,
        resultNote: q.resultNote,
        doneAt: q.doneAt ? q.doneAt.toISOString() : null,
        doneBy: q.doneBy?.name ?? null,
      })),
    }
  })

  return NextResponse.json({ items })
}
