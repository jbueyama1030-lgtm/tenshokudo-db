// ChatWork通知の共通関数
// 環境変数 CHATWORK_API_TOKEN / CHATWORK_ROOM_ID が未設定なら何もしない
// ChatWork通知（環境変数の再読み込みのため再ビルド）

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