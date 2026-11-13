// 置き場所: src/app/api/quests/route.ts
// クエストの一覧。?scope=mine（自分の担当・既定）/ all（全員）、?view=open（対応待ち・既定）/ done（直近7日の完了）
// クエストは社内の全員が見られる（代理店ユーザーは不可）

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { isAdmin, isAgencyUser } from "@/lib/permissions"
import { wallClockToInstant } from "@/lib/businessCalendar"
import { LOCK_MS, RESULT_LABELS, syncFirstCallQuests } from "@/lib/quests/firstCall"

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (isAgencyUser(session)) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const url = new URL(req.url)
  const scope = url.searchParams.get("scope") === "all" ? "all" : "mine"
  const view = url.searchParams.get("view") === "done" ? "done" : "open"
  const me = session.user.id
  const now = new Date()

  // 取りこぼした応募があればここでもクエストを作る（何回呼んでも同じ結果）
  try {
    await syncFirstCallQuests(now)
  } catch (e) {
    console.error("[quests] クエストの作成に失敗しました", e)
  }

  const weekAgo = new Date(now.getTime() - 7 * 86400000)
  const quests = await prisma.quest.findMany({
    where: {
      ...(view === "open" ? { status: "open" } : { status: "done", doneAt: { gte: weekAgo } }),
      ...(scope === "mine" ? { assignees: { some: { id: me } } } : {}),
    },
    orderBy: view === "open" ? { dueAt: "asc" } : { doneAt: "desc" },
    take: 300,
    select: {
      id: true, type: true, status: true, attempt: true, dueAt: true,
      lockedAt: true, result: true, resultNote: true, doneAt: true,
      company: { select: { id: true, name: true, userId: true } },
      application: {
        select: {
          externalId: true, appliedAt: true, entryType: true, inflow: true, status: true,
          age: true, gender: true, hasLicense2: true, applicantPref: true,
        },
      },
      assignees: { select: { id: true, name: true } },
      lockedBy: { select: { id: true, name: true } },
      doneBy: { select: { id: true, name: true } },
    },
  })

  // 自分の今週の完了件数（月曜はじまり・日本時間）
  const jstNow = new Date(now.getTime() + 9 * 3600000)
  const dow = (jstNow.getUTCDay() + 6) % 7
  const weekStart = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate() - dow) - 9 * 3600000)
  const myDoneThisWeek = await prisma.quest.count({ where: { status: "done", doneById: me, doneAt: { gte: weekStart } } })

  const adminUser = isAdmin(session)
  const rows = quests.map(q => {
    const lockActive = !!q.lockedBy && !!q.lockedAt && now.getTime() - q.lockedAt.getTime() < LOCK_MS
    return {
      id: q.id,
      type: q.type,
      status: q.status,
      attempt: q.attempt,
      dueAt: q.dueAt.toISOString(),
      company: q.company ? { id: q.company.id, name: q.company.name } : null,
      application: q.application
        ? {
            ...q.application,
            // 応募日時は「日本時間の見た目」で保存しているので、実際の時刻に直して返す
            appliedAt: wallClockToInstant(q.application.appliedAt).toISOString(),
          }
        : null,
      // 担当営業を先頭に並べる
      assignees: [...q.assignees].sort((a, b) => (a.id === q.company?.userId ? -1 : b.id === q.company?.userId ? 1 : 0))
        .map(a => ({ ...a, role: a.id === q.company?.userId ? "担当" : "補佐" })),
      lockedBy: lockActive ? q.lockedBy : null,
      lockedAt: lockActive && q.lockedAt ? q.lockedAt.toISOString() : null,
      result: q.result,
      resultLabel: q.result ? RESULT_LABELS[q.result] ?? q.result : null,
      resultNote: q.resultNote,
      doneAt: q.doneAt ? q.doneAt.toISOString() : null,
      doneBy: q.doneBy,
      canAct: adminUser || q.assignees.some(a => a.id === me),
    }
  })

  return NextResponse.json({ me, now: now.toISOString(), myDoneThisWeek, quests: rows })
}
