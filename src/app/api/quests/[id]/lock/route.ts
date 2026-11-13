// 置き場所: src/app/api/quests/[id]/lock/route.ts
// POST: 「電話する」（自分を対応中にする）/ DELETE: 「やめる」（自分の対応中を外す）

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { isAdmin, isAgencyUser } from "@/lib/permissions"
import { lockQuest, unlockQuest } from "@/lib/quests/firstCall"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (isAgencyUser(session)) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { id } = await params
  const res = await lockQuest(id, { id: session.user.id, isAdmin: isAdmin(session) })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (isAgencyUser(session)) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { id } = await params
  await unlockQuest(id, { id: session.user.id, isAdmin: isAdmin(session) })
  return NextResponse.json({ ok: true })
}
