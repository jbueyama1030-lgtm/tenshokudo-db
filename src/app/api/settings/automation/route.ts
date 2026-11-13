// 置き場所: src/app/api/settings/automation/route.ts
// 自動化の設定（役員のみ）。GET: 今の設定と会社独自の休み / PATCH: { firstCallEnabled: true/false }

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { isAdmin, isAgencyUser } from "@/lib/permissions"
import { getFirstCallSetting, setFirstCallEnabled, syncFirstCallQuests } from "@/lib/quests/firstCall"

async function guard() {
  const session = await auth()
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (isAgencyUser(session) || !isAdmin(session)) {
    return { error: NextResponse.json({ error: "設定を変えられるのは役員だけです" }, { status: 403 }) }
  }
  return { session }
}

export async function GET() {
  const g = await guard()
  if (g.error) return g.error

  const firstCall = await getFirstCallSetting()
  const holidays = await prisma.businessHoliday.findMany({ orderBy: { date: "asc" } })
  return NextResponse.json({
    firstCall: { enabled: firstCall.enabled, startAt: firstCall.startAt?.toISOString() ?? null },
    holidays: holidays.map(h => ({ date: h.date, name: h.name })),
  })
}

export async function PATCH(req: Request) {
  const g = await guard()
  if (g.error) return g.error

  const body = await req.json().catch(() => null) as { firstCallEnabled?: unknown } | null
  if (!body || typeof body.firstCallEnabled !== "boolean") {
    return NextResponse.json({ error: "内容が正しくありません" }, { status: 400 })
  }
  const s = await setFirstCallEnabled(body.firstCallEnabled)
  if (s.enabled) await syncFirstCallQuests()
  console.log("[settings] 初回電話のクエストを " + (s.enabled ? "オン" : "オフ") + " にしました（" + g.session.user.name + "）")
  return NextResponse.json({ firstCall: { enabled: s.enabled, startAt: s.startAt?.toISOString() ?? null } })
}
