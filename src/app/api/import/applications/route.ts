import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import { canImportData } from "@/lib/permissions"
import { importApplicationsCsv } from "@/lib/importApplications"

const prisma = new PrismaClient()

// 大きなCSVを受け取るため実行時間を延ばす（Vercel/Railway共通のヒント）
export const maxDuration = 300

// body: { csv: string, skipGuard?: boolean }
export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!canImportData(session)) {
    return NextResponse.json({ error: "データ取り込みの権限がありません" }, { status: 403 })
  }

  const body = await req.json()
  const csv: string = body.csv ?? ""
  if (!csv.trim()) {
    return NextResponse.json({ error: "CSVが空です" }, { status: 400 })
  }

  const result = await importApplicationsCsv(prisma, csv, {
    skipGuard: body.skipGuard === true,
  })

  if (result.aborted) {
    return NextResponse.json({ error: result.aborted, result }, { status: 400 })
  }

  return NextResponse.json(result)
}