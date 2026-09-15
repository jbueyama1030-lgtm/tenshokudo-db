import { NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import { importApplicationsCsv, decodeCsv } from "@/lib/importApplications"

const prisma = new PrismaClient()

export const maxDuration = 300

/**
 * 応募明細の自動取り込み（cronから叩く）。
 *
 * 認証: Authorization: Bearer <CRON_SECRET>
 * 取得元: ENTRY_CSV_URL（Basic認証は ENTRY_CSV_USER / ENTRY_CSV_PASS）
 *
 * 転職道側で毎日深夜0〜1時にCSVが生成される（固定ファイル名・上書き）。
 * こちらはその後（朝3〜4時想定）に実行する。
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

  const startedAt = Date.now()

  // --- CSV取得 ---
  let csvText: string
  try {
    const headers: Record<string, string> = {}
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

  console.log(
    "[cron] 応募明細の取り込み完了: 成功 " + result.success +
    " / 削除 " + result.deleted +
    " / スキップ " + result.skip +
    " / 未マッチ " + result.unmatched +
    " / " + elapsed + "秒"
  )

  return NextResponse.json({ ok: true, elapsed, ...result })
}