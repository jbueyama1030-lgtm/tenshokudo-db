// ChatWork通知の共通関数
// 環境変数 CHATWORK_API_TOKEN / CHATWORK_ROOM_ID が未設定なら何もしない

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// メンション対象の型（chatworkAccountId が無い人は無視される）
export type MentionUser = {
  name: string
  chatworkAccountId: string | null
} | null | undefined

// [To:xxx]名前さん の並びを作る
export function buildMentions(users: MentionUser[]): string {
  const seen = new Set<string>()
  const lines: string[] = []

  for (const u of users) {
    if (!u || !u.chatworkAccountId) continue
    if (seen.has(u.chatworkAccountId)) continue
    seen.add(u.chatworkAccountId)
    lines.push("[To:" + u.chatworkAccountId + "]" + u.name + "さん")
  }

  return lines.length > 0 ? lines.join("\n") + "\n" : ""
}

// role が production のユーザー全員を取得（起票時のメンション用）
export async function getProductionMembers(): Promise<MentionUser[]> {
  const members = await prisma.user.findMany({
    where: { role: "production" },
    select: { name: true, chatworkAccountId: true },
  })
  return members
}

export async function notifyChatwork(message: string): Promise<void> {
  const token = process.env.CHATWORK_API_TOKEN
  const roomId = process.env.CHATWORK_ROOM_ID

  if (!token || !roomId) {
    console.log("[chatwork] 環境変数が未設定のため通知をスキップしました")
    return
  }

  try {
    const res = await fetch("https://api.chatwork.com/v2/rooms/" + roomId + "/messages", {
      method: "POST",
      headers: {
        "X-ChatWorkToken": token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ body: message }).toString(),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error("[chatwork] 通知に失敗しました:", res.status, text)
    }
  } catch (e) {
    console.error("[chatwork] 通知でエラーが発生しました:", e)
  }
}

// 本番URL（通知メッセージ内のリンク用）
export const APP_URL = "https://tenshokudo-db-production.up.railway.app"