import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { canImportData } from "@/lib/permissions"
import { decodeCsv, importArticles } from "@/lib/importArticles"

/**
 * 記事CSVの取り込み。
 * body: CSVファイルのバイナリそのもの（文字コードはサーバー側で判定）
 * query: force=1 で件数ガードを無視する
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canImportData(session)) {
    return NextResponse.json({ error: "取り込みの権限がありません" }, { status: 403 })
  }

  const force = new URL(req.url).searchParams.get("force") === "1"

  try {
    const buf = await req.arrayBuffer()
    if (buf.byteLength === 0) {
      return NextResponse.json({ error: "ファイルが空です" }, { status: 400 })
    }
    const text = decodeCsv(buf)
    const result = await importArticles(text, { force })
    return NextResponse.json(result, { status: result.ok ? 200 : 409 })
  } catch (e) {
    console.error("[import/articles] failed", e)
    return NextResponse.json({ error: "取り込みに失敗しました" }, { status: 500 })
  }
}