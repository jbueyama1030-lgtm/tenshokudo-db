import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { importApplicationsCsv, decodeCsv } from "@/lib/importApplications"
import { syncFirstCallQuests } from "@/lib/quests/firstCall"

export const maxDuration = 300

/** 前回取り込んだCSVの更新日時（Last-Modified）を覚えておくキー */
const LAST_MODIFIED_KEY = "entryCsv.lastModified"

/**
 * 応募明細の自動取り込み（cronから叩く）。
 *
 * 認証: Authorization: Bearer <CRON_SECRET>
 * 取得元: ENTRY_CSV_URL（Basic認証は ENTRY_CSV_USER / ENTRY_CSV_PASS）
 *
 * 転職道側で、営業時間中（8〜21時）は1時間ごと、ほかに深夜1回CSVが生成される（固定ファイル名・上書き）。
 * こちらは生成の少し後（毎時10分など）に実行する。
 * CSVが前回から更新されていなければ（Last-Modified が同じなら）取り込みを省く。
 * 強制的に取り込みたいときは ?force=1 を付ける。
 *
 * 新しい応募の大半は応募通知API（/api/webhooks/applications）で先に届く。
 * この取り込みは、通知の取りこぼしを埋めることと、その後の進捗（ステータス）を反映するためのもの。
 */
export async function POST(req: Request) {
  // --- 認証 ---
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET が未設定です" }, { status: 500 })
  }
  const authHeader = req.headers.get("authorization") ?? ""
  if (authHeader !== "Bearer " + secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = process.env.ENTRY_CSV_URL
  if (!url) {
    return NextResponse.json({ error: "ENTRY_CSV_URL が未設定です" }, { status: 500 })
  }

  const force = new URL(req.url).searchParams.get("force") === "1"
  const startedAt = Date.now()

  // --- CSV取得 ---
  let csvText: string
  let lastModified: string | null = null
  try {
    const headers: Record<string, string> = {
      // プログラムからのアクセスがUser-Agentで弾かれることがあるため明示する
      "User-Agent": "Mozilla/5.0 (compatible; TenshokudoDB/1.0)",
      "Accept": "text/csv,application/octet-stream,*/*",
    }
    const user = process.env.ENTRY_CSV_USER
    const pass = process.env.ENTRY_CSV_PASS
    if (user && pass) {
      headers["Authorization"] = "Basic " + Buffer.from(user + ":" + pass).toString("base64")
    }

    const res = await fetch(url, { headers, cache: "no-store" })
    if (!res.ok) {
      return NextResponse.json(
        { error: "CSVの取得に失敗しました（HTTP " + res.status + "）" },
        { status: 502 }
      )
    }

    // 前回と同じファイルなら取り込まない
    lastModified = res.headers.get("last-modified")
    if (!force && lastModified) {
      const prev = await prisma.syncState.findUnique({ where: { key: LAST_MODIFIED_KEY } })
      if (prev?.value === lastModified) {
        await res.body?.cancel()
        return NextResponse.json({ ok: true, skipped: "CSVは前回から更新されていません", lastModified })
      }
    }

    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0) {
      return NextResponse.json({ error: "取得したCSVが空です" }, { status: 502 })
    }
    csvText = decodeCsv(buf)
  } catch (e) {
    return NextResponse.json(
      { error: "CSVの取得中にエラーが発生しました: " + String(e) },
      { status: 502 }
    )
  }

  // --- 取り込み ---
  const result = await importApplicationsCsv(prisma, csvText)
  const elapsed = Math.round((Date.now() - startedAt) / 1000)

  if (result.aborted) {
    console.error("[cron] 応募明細の取り込みを中断: " + result.aborted)
    return NextResponse.json({ ok: false, elapsed, ...result }, { status: 400 })
  }

  // 取り込めたときだけ更新日時を覚える（失敗したら次回もう一度取り込む）
  if (lastModified) {
    await prisma.syncState.upsert({
      where: { key: LAST_MODIFIED_KEY },
      update: { value: lastModified },
      create: { key: LAST_MODIFIED_KEY, value: lastModified },
    })
  }

  console.log(
    "[cron] 応募明細の取り込み完了: 追加 " + result.created +
    " / 更新 " + result.updated +
    " / 削除 " + result.deleted +
    " / スキップ " + result.skip +
    " / 未マッチ " + result.unmatched +
    " / " + elapsed + "秒"
  )

  // 通知が届かずCSVで初めて入った応募にも、初回電話のクエストを出す
  try {
    await syncFirstCallQuests()
  } catch (e) {
    console.error("[cron] クエストの作成に失敗しました", e)
  }

  return NextResponse.json({ ok: true, elapsed, lastModified, ...result })
}
