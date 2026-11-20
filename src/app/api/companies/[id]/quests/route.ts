// 置き場所: src/app/api/companies/[id]/quests/route.ts
// 企業ページ「応募対応」タブ用。指定した月（?month=2026-11、省略時は今月）の応募ごとの初回電話の記録と集計を返す。
// openCount はこの企業の対応待ちの件数（月に関係なく。タブの数字に使う）

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { isAgencyUser, isInAgencyScope } from "@/lib/permissions"
import { jstParts, wallClockToInstant } from "@/lib/businessCalendar"
import { FIRST_CALL, RESULT_LABELS } from "@/lib/quests/firstCall"

function parseMonth(v: string | null): { y: number; m: number } {
  const match = v?.match(/^(\d{4})-(\d{2})$/)
  if (match) {
    const y = Number(match[1]), m = Number(match[2])
    if (m >= 1 && m <= 12) return { y, m }
  }
  const p = jstParts(new Date())
  return { y: p.y, m: p.m }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const company = await prisma.company.findUnique({ where: { id }, select: { agencyId: true } })
  if (!company || !isInAgencyScope(session, company.agencyId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { y, m } = parseMonth(new URL(req.url).searchParams.get("month"))
  const month = y + "-" + String(m).padStart(2, "0")
  const empty = { month, openCount: 0, summary: { total: 0, connected: 0, unreachable: 0, other: 0, open: 0 }, items: [] }
  // クエストは社内向け（代理店ユーザーには空で返す）
  if (isAgencyUser(session)) return NextResponse.json(empty)

  const openCount = await prisma.quest.count({ where: { companyId: id, type: FIRST_CALL, status: "open" } })

  // 応募日時は「日本時間の見た目」をサーバーの時刻設定のまま保存しているので、同じ形で月の範囲を作る
  const from = new Date(y, m - 1, 1)
  const to = new Date(y, m, 1)

  const quests = await prisma.quest.findMany({
    where: { companyId: id, type: FIRST_CALL, application: { appliedAt: { gte: from, lt: to } } },
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

  const summary = { total: 0, connected: 0, unreachable: 0, other: 0, open: 0 }
  const items = Array.from(groups.entries()).map(([key, list]) => {
    const sorted = [...list].sort((a, b) => a.attempt - b.attempt)
    const app = sorted[0].application
    const open = sorted.find(q => q.status === "open") ?? null
    const done = sorted.filter(q => q.status === "done")
    const last = done[done.length - 1] ?? null

    summary.total++
    if (open) summary.open++
    else if (last?.result === "connected") summary.connected++
    else if (last?.result === "unreachable") summary.unreachable++
    else summary.other++

    return {
      key,
      appliedAt: app ? wallClockToInstant(app.appliedAt).toISOString() : null,
      externalId: app?.externalId ?? null,
      entryType: app?.entryType ?? null,
      inflow: app?.inflow ?? null,
      open: open ? { attempt: open.attempt, dueAt: open.dueAt.toISOString() } : null,
      result: open ? null : last?.result ?? null,
      resultLabel: open ? null : last?.result ? RESULT_LABELS[last.result] ?? last.result : null,
      doneBy: open ? null : last?.doneBy?.name ?? null,
      attempts: done.length,
      lastNote: [...done].reverse().find(q => q.resultNote)?.resultNote ?? null,
      history: done.map(q => ({
        attempt: q.attempt,
        resultLabel: q.result ? RESULT_LABELS[q.result] ?? q.result : null,
        resultNote: q.resultNote,
        doneAt: q.doneAt ? q.doneAt.toISOString() : null,
        doneBy: q.doneBy?.name ?? null,
      })),
    }
  })

  // 対応待ちを先頭に、あとは応募の新しい順
  items.sort((a, b) => {
    if (!!a.open !== !!b.open) return a.open ? -1 : 1
    return (b.appliedAt ?? "").localeCompare(a.appliedAt ?? "")
  })

  return NextResponse.json({ month, openCount, summary, items })
}
