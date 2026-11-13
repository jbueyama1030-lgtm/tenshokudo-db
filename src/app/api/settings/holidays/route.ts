// 置き場所: src/app/api/settings/holidays/route.ts
// 会社独自の休み（役員のみ）。POST: { date: "2026-12-30", name: "年末年始" } / DELETE: ?date=2026-12-30

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { isAdmin, isAgencyUser } from "@/lib/permissions"

async function guard() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (isAgencyUser(session) || !isAdmin(session)) {
    return NextResponse.json({ error: "設定を変えられるのは役員だけです" }, { status: 403 })
  }
  return null
}

function validDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split("-").map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

export async function POST(req: Request) {
  const denied = await guard()
  if (denied) return denied

  const body = await req.json().catch(() => null) as { date?: unknown; name?: unknown } | null
  if (!body || !validDate(body.date)) return NextResponse.json({ error: "日付が正しくありません" }, { status: 400 })
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 50) : "会社の休み"

  const h = await prisma.businessHoliday.upsert({
    where: { date: body.date },
    update: { name },
    create: { date: body.date, name },
  })
  return NextResponse.json({ date: h.date, name: h.name })
}

export async function DELETE(req: Request) {
  const denied = await guard()
  if (denied) return denied

  const date = new URL(req.url).searchParams.get("date")
  if (!validDate(date)) return NextResponse.json({ error: "日付が正しくありません" }, { status: 400 })
  await prisma.businessHoliday.deleteMany({ where: { date } })
  return NextResponse.json({ ok: true })
}
