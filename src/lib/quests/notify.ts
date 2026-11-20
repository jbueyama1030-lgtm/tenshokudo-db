// 置き場所: src/lib/quests/notify.ts
// クエストのチャットワーク通知。
//
// ・新しいクエスト: 営業時間内ならすぐ、夜間・休日に出た分は次の営業日の 9:00 以降の最初の実行でまとめて送る
// ・期日超過: 期日を過ぎたクエストを、次の営業時間（ふつうは翌営業日の 9:00）に本人へ1回だけリマインドする
// ・メッセージには企業名・期日・リンクだけを書き、応募者の情報（年齢・性別など）は書かない
// ・送り先は QUEST_CHATWORK_ROOM_ID のルーム（未設定なら CHATWORK_ROOM_ID）

import { prisma } from "@/lib/prisma"
import { APP_URL, buildMentions, notifyChatwork } from "@/lib/chatwork"
import { loadCompanyHolidays, makeCalendar } from "@/lib/businessCalendar"
import { FIRST_CALL } from "@/lib/quests/firstCall"

const fmtDue = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
})

function roomId(): string | undefined {
  return process.env.QUEST_CHATWORK_ROOM_ID || undefined
}

type QuestForNotify = {
  id: string
  attempt: number
  dueAt: Date
  company: { name: string } | null
  assignees: { id: string; name: string; chatworkAccountId: string | null }[]
}

const questSelect = {
  id: true, attempt: true, dueAt: true,
  company: { select: { name: true } },
  assignees: { select: { id: true, name: true, chatworkAccountId: true } },
} as const

/** 担当の組み合わせごとにまとめる（同じ人たちへの通知は1通にする） */
function groupByAssignees(quests: QuestForNotify[]): QuestForNotify[][] {
  const map = new Map<string, QuestForNotify[]>()
  for (const q of quests) {
    const key = q.assignees.map(a => a.id).sort().join(",")
    const list = map.get(key) ?? []
    list.push(q)
    map.set(key, list)
  }
  return Array.from(map.values())
}

function line(q: QuestForNotify): string {
  const kind = q.attempt >= 2 ? "かけ直し" : "初回電話"
  return "・" + (q.company?.name ?? "（企業なし）") + "（" + kind + "／期日 " + fmtDue.format(q.dueAt) + "）"
}

/** 新しいクエストを知らせる。営業時間外は何もしない（次の営業時間に送る） */
export async function notifyNewQuests(now = new Date()): Promise<number> {
  const cal = makeCalendar(await loadCompanyHolidays())
  if (!cal.isOpenNow(now)) return 0

  const quests = await prisma.quest.findMany({
    where: { type: FIRST_CALL, status: "open", notifiedAt: null },
    orderBy: { dueAt: "asc" },
    take: 200,
    select: questSelect,
  })
  if (quests.length === 0) return 0

  let sent = 0
  for (const group of groupByAssignees(quests)) {
    const message =
      buildMentions(group[0].assignees) +
      "[info][title]応募者への初回電話（" + group.length + "件）[/title]" +
      group.map(line).join("\n") +
      "\n\n電話番号は転職道の管理画面で確認してください。結果はクエスト画面で記録をお願いします。\n" +
      APP_URL + "/quests[/info]"
    const res = await notifyChatwork(message, roomId())
    // 送れなかったときは印を付けず、次の実行でもう一度送る
    if (res === "failed") continue
    await prisma.quest.updateMany({ where: { id: { in: group.map(q => q.id) } }, data: { notifiedAt: now } })
    sent += group.length
  }
  if (sent > 0) console.log("[quests] 新しいクエストを " + sent + " 件通知しました")
  return sent
}

/** 期日を過ぎたクエストを本人にリマインドする（1件につき1回だけ）。営業時間外は何もしない */
export async function remindOverdueQuests(now = new Date()): Promise<number> {
  const cal = makeCalendar(await loadCompanyHolidays())
  if (!cal.isOpenNow(now)) return 0

  const quests = await prisma.quest.findMany({
    where: { type: FIRST_CALL, status: "open", dueAt: { lt: now }, remindedAt: null },
    orderBy: { dueAt: "asc" },
    take: 200,
    select: questSelect,
  })
  if (quests.length === 0) return 0

  let sent = 0
  for (const group of groupByAssignees(quests)) {
    const message =
      buildMentions(group[0].assignees) +
      "[info][title]期日を過ぎた初回電話があります（" + group.length + "件）[/title]" +
      group.map(line).join("\n") +
      "\n\n対応したら、クエスト画面で結果を記録してください。\n" +
      APP_URL + "/quests[/info]"
    const res = await notifyChatwork(message, roomId())
    if (res === "failed") continue
    await prisma.quest.updateMany({ where: { id: { in: group.map(q => q.id) } }, data: { remindedAt: now } })
    sent += group.length
  }
  if (sent > 0) console.log("[quests] 期日超過のクエストを " + sent + " 件リマインドしました")
  return sent
}
