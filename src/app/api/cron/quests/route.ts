// 置き場所: src/app/api/cron/quests/route.ts
// クエストの定期処理（cron-job.org から15分ごとに呼ぶ）。
// 1. まだクエストが無い新しい応募にクエストを作る
// 2. 新しいクエストをチャットワークで知らせる（営業時間内だけ。夜間・休日の分は翌営業日の 9:00 以降にまとめて）
// 3. 期日を過ぎたクエストをリマインドする（営業時間内だけ、1件につき1回）
// 認証: Authorization: Bearer <CRON_SECRET>

import { NextResponse } from "next/server"
import { syncFirstCallQuests } from "@/lib/quests/firstCall"
import { notifyNewQuests, remindOverdueQuests } from "@/lib/quests/notify"

export const maxDuration = 60

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "CRON_SECRET が未設定です" }, { status: 500 })
  if ((req.headers.get("authorization") ?? "") !== "Bearer " + secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const { created } = await syncFirstCallQuests(now)
  const notified = await notifyNewQuests(now)
  const reminded = await remindOverdueQuests(now)

  if (created + notified + reminded > 0) {
    console.log("[cron/quests] 作成 " + created + " / 通知 " + notified + " / リマインド " + reminded)
  }
  return NextResponse.json({ ok: true, created, notified, reminded })
}
