// 置き場所: src/app/api/webhooks/applications/route.ts
// 応募通知API。転職道のシステムから、新しい応募1件につき1回呼ばれる。
// 応答: 200 受け取った（重複も200）/ 400 内容に不備 / 401 トークン違い / 503 未設定 / 500 こちらの不具合（先方が再送する）

import { NextResponse } from "next/server"
import {
  MAX_BODY_BYTES, checkWebhookToken, parseWebhookBody, saveWebhookApplication,
} from "@/lib/applicationWebhook"
import { syncFirstCallQuests } from "@/lib/quests/firstCall"

export async function POST(req: Request) {
  const auth = checkWebhookToken(req.headers.get("authorization"))
  if (auth === "not_configured") {
    console.error("[webhook/applications] APPLICATION_WEBHOOK_TOKENS が未設定です")
    return NextResponse.json({ ok: false, error: "受け付けの準備ができていません" }, { status: 503 })
  }
  if (auth === "unauthorized") {
    return NextResponse.json({ ok: false, error: "認証に失敗しました（トークンを確認してください）" }, { status: 401 })
  }

  const text = await req.text()
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "本文が大きすぎます" }, { status: 400 })
  }

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ ok: false, error: "本文がJSONとして読めません" }, { status: 400 })
  }

  const parsed = parseWebhookBody(body)
  if (!parsed.ok) {
    console.warn("[webhook/applications] 400: " + parsed.error)
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 })
  }
  if (parsed.ignoredKeys.length > 0) {
    // 値は記録しない（個人情報が含まれている可能性があるため）。キー名だけ残す
    console.warn("[webhook/applications] 受け取らない項目を破棄しました: " + parsed.ignoredKeys.join(", "))
  }

  try {
    const result = await saveWebhookApplication(parsed.payload)
    console.log("[webhook/applications] " + result + " applicationId=" + parsed.payload.applicationId + " companyId=" + parsed.payload.companyId)

    // 初回電話のクエストを作る。失敗しても応募の受け取りは成功として返す（あとで画面を開いたときや次の取り込みで作り直される）
    if (result === "created") {
      try {
        await syncFirstCallQuests()
      } catch (e) {
        console.error("[webhook/applications] クエストの作成に失敗しました", e)
      }
    }
    return NextResponse.json({ ok: true, result })
  } catch (e) {
    console.error("[webhook/applications] 保存に失敗しました", e)
    return NextResponse.json({ ok: false, error: "一時的に受け付けできません。再送してください" }, { status: 500 })
  }
}
