// 置き場所: src/app/api/quests/route.ts
// クエストの一覧。?scope=mine（自分の担当・既定）/ all（全員）、?view=open（対応待ち・既定）/ done（直近7日の完了）
// 同じ応募の初回電話とかけ直しは、1件（item）にまとめて返す。
// クエストは社内の全員が見られる（代理店ユーザーは不可）

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { isAdmin, isAgencyUser } from "@/lib/permissions"
import { wallClockToInstant } from "@/lib/businessCalendar"
import { LOCK_MS, RESULT_LABELS, syncFirstCallQuests } from "@/lib/quests/firstCall"

const questSelect = {
  id: true, type: true, status: true, attempt: true, dueAt: true, applicationId: true,
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
} as const

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

  const mineWhere = scope === "mine" ? { assignees: { some: { id: me } } } : {}
  const weekAgo = new Date(now.getTime() - 7 * 86400000)

  // 一覧の主役になるクエスト
  const main = await prisma.quest.findMany({
    where: view === "open"
      ? { status: "open", ...mineWhere }
      : { status: "done", doneAt: { gte: weekAgo }, ...mineWhere },
    orderBy: view === "open" ? { dueAt: "asc" } : { doneAt: "desc" },
    take: 300,
    select: questSelect,
  })

  // 同じ応募のほかのクエスト（初回とかけ直しをまとめるため）
  const appIds = Array.from(new Set(main.map(q => q.applicationId).filter((v): v is string => !!v)))
  const siblings = appIds.length > 0
    ? await prisma.quest.findMany({ where: { applicationId: { in: appIds } }, select: questSelect })
    : []

  type Q = (typeof main)[number]
  const groups = new Map<string, Q[]>()
  for (const q of [...main, ...siblings]) {
    const key = q.applicationId ?? "quest:" + q.id
    const list = groups.get(key) ?? []
    if (!list.some(x => x.id === q.id)) list.push(q)
    groups.set(key, list)
  }

  const adminUser = isAdmin(session)
  const seen = new Set<string>()
  const items = []
  for (const q of main) {
    const key = q.applicationId ?? "quest:" + q.id
    if (seen.has(key)) continue
    seen.add(key)
    const all = (groups.get(key) ?? [q]).sort((a, b) => a.attempt - b.attempt)
    const current = all.find(x => x.status === "open") ?? null
    // 完了の一覧では、まだ対応待ちが残っている応募は出さない（対応待ちの一覧に出る）
    if (view === "done" && current) continue
    const latest = current ?? all[all.length - 1]

    const lockActive = !!current?.lockedBy && !!current.lockedAt && now.getTime() - current.lockedAt.getTime() < LOCK_MS
    const ownerId = latest.company?.userId

    items.push({
      key,
      company: latest.company ? { id: latest.company.id, name: latest.company.name } : null,
      application: latest.application
        ? {
            ...latest.application,
            // 応募日時は「日本時間の見た目」で保存しているので、実際の時刻に直して返す
            appliedAt: wallClockToInstant(latest.application.appliedAt).toISOString(),
          }
        : null,
      // 担当営業を先頭に並べる
      assignees: [...latest.assignees]
        .sort((a, b) => (a.id === ownerId ? -1 : b.id === ownerId ? 1 : 0))
        .map(a => ({ ...a, role: a.id === ownerId ? "担当" : "補佐" })),
      current: current
        ? {
            id: current.id,
            attempt: current.attempt,
            dueAt: current.dueAt.toISOString(),
            lockedBy: lockActive ? current.lockedBy : null,
            lockedAt: lockActive && current.lockedAt ? current.lockedAt.toISOString() : null,
            canAct: adminUser || current.assignees.some(a => a.id === me),
          }
        : null,
      // 終わった回の記録（1回目 不在 → 2回目 …）
      history: all.filter(x => x.status === "done").map(x => ({
        attempt: x.attempt,
        result: x.result,
        resultLabel: x.result ? RESULT_LABELS[x.result] ?? x.result : null,
        resultNote: x.resultNote,
        doneAt: x.doneAt ? x.doneAt.toISOString() : null,
        doneBy: x.doneBy,
      })),
    })
  }

  // 自分の今週の完了件数（月曜はじまり・日本時間）
  const jstNow = new Date(now.getTime() + 9 * 3600000)
  const dow = (jstNow.getUTCDay() + 6) % 7
  const weekStart = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate() - dow) - 9 * 3600000)
  const myDoneThisWeek = await prisma.quest.count({ where: { status: "done", doneById: me, doneAt: { gte: weekStart } } })

  return NextResponse.json({ me, now: now.toISOString(), myDoneThisWeek, items })
}
