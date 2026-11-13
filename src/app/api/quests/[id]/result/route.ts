// 置き場所: src/app/api/quests/[id]/result/route.ts
// 初回電話の結果を入れる。本文: { result: "connected" など, note: "一言" }

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { isAdmin, isAgencyUser } from "@/lib/permissions"
import { isFirstCallResult, recordFirstCallResult } from "@/lib/quests/firstCall"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (isAgencyUser(session)) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { id } = await params
  const body = await req.json().catch(() => null) as { result?: unknown; note?: unknown } | null
  if (!body || !isFirstCallResult(body.result)) {
    return NextResponse.json({ error: "結果の選び方が正しくありません" }, { status: 400 })
  }
  const note = typeof body.note === "string" ? body.note : ""

  const res = await recordFirstCallResult(id, { id: session.user.id, isAdmin: isAdmin(session) }, body.result, note)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
  return NextResponse.json({ ok: true, nextQuestId: res.nextQuestId })
}
