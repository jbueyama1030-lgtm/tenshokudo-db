// 置き場所: src/app/api/marketing/applicants/route.ts
import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { canViewMarketing } from "@/lib/permissions"
import { PREFECTURES } from "@/lib/area"
import { addMonths, currentYmJst, ymKey } from "@/lib/funnelAnalysis"

/**
 * 転職道全体の応募者の属性（年代構成・平均年齢・女性比率・二種有り比率・未開封率）。
 *
 * query:
 *   view      = trend（期間ごとの推移・既定） | compare（流入元・エリアごとの比較）
 *   unit      = month | quarter（trend のとき。既定 quarter）
 *   groupBy   = inflow | pref（compare のとき。既定 inflow）
 *   months    = compare の集計期間（今月を含む直近Nか月。既定12、最大60）
 *   excludeTel= 1 で TEL応募を除く
 *   inflow    = 流入元で絞り込み
 *   pref      = 都道府県で絞り込み
 *   prefMode  = company（応募先企業の所在地・既定） | applicant（応募者の居住地）
 * 個人は特定しない集計値のみ返す。
 */

// 企業の住所から都道府県を取り出す（SQL側）
const PREF_REGEX = "(" + PREFECTURES.join("|") + ")"
const companyPrefSql = Prisma.sql`substring(c."address" from ${PREF_REGEX})`

// 集計列（推移・比較で共通）
const AGG = Prisma.sql`
  COUNT(*)::int AS total, COUNT(a."age")::int AS "withAge",
  AVG(a."age")::float AS "avgAge",
  percentile_cont(0.5) WITHIN GROUP (ORDER BY a."age")::float AS "medianAge",
  COUNT(*) FILTER (WHERE a."age" < 30)::int AS a20,
  COUNT(*) FILTER (WHERE a."age" BETWEEN 30 AND 39)::int AS a30,
  COUNT(*) FILTER (WHERE a."age" BETWEEN 40 AND 49)::int AS a40,
  COUNT(*) FILTER (WHERE a."age" BETWEEN 50 AND 59)::int AS a50,
  COUNT(*) FILTER (WHERE a."age" BETWEEN 60 AND 69)::int AS a60,
  COUNT(*) FILTER (WHERE a."age" >= 70)::int AS a70,
  COUNT(*) FILTER (WHERE a."gender" = '女性')::int AS female, COUNT(a."gender")::int AS "withGender",
  COUNT(*) FILTER (WHERE a."hasLicense2" = true)::int AS lic, COUNT(a."hasLicense2")::int AS "withLic",
  COUNT(*) FILTER (WHERE a."companyOpened" = false)::int AS unopened, COUNT(a."companyOpened")::int AS "withOpened",
  COUNT(*) FILTER (WHERE a."status" = '入社')::int AS hired`

type AggRow = {
  total: number; withAge: number; avgAge: number | null; medianAge: number | null
  a20: number; a30: number; a40: number; a50: number; a60: number; a70: number
  female: number; withGender: number; lic: number; withLic: number; unopened: number; withOpened: number; hired: number
}

function shape(r: AggRow) {
  return {
    total: Number(r.total),
    withAge: Number(r.withAge),
    avgAge: r.avgAge != null ? Number(r.avgAge) : null,
    medianAge: r.medianAge != null ? Number(r.medianAge) : null,
    bands: [r.a20, r.a30, r.a40, r.a50, r.a60, r.a70].map(Number),
    female: Number(r.female), withGender: Number(r.withGender),
    lic: Number(r.lic), withLic: Number(r.withLic),
    unopened: Number(r.unopened), withOpened: Number(r.withOpened),
    hired: Number(r.hired),
  }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canViewMarketing(session)) {
    return NextResponse.json({ error: "マーケティング分析の閲覧権限がありません" }, { status: 403 })
  }

  const sp = new URL(req.url).searchParams
  const view = sp.get("view") === "compare" ? "compare" : "trend"
  const unit = sp.get("unit") === "month" ? "month" : "quarter"
  const groupBy = sp.get("groupBy") === "pref" ? "pref" : "inflow"
  const months = Math.min(60, Math.max(1, Number(sp.get("months")) || 12))
  const excludeTel = sp.get("excludeTel") === "1"
  const inflow = sp.get("inflow") ?? ""
  const pref = sp.get("pref") ?? ""
  const prefMode = sp.get("prefMode") === "applicant" ? "applicant" : "company"
  const prefSql = prefMode === "applicant" ? Prisma.sql`a."applicantPref"` : companyPrefSql

  // 絞り込み条件
  const conds: Prisma.Sql[] = [Prisma.sql`TRUE`]
  if (excludeTel) conds.push(Prisma.sql`a."entryType" IS DISTINCT FROM 'TEL応募'`)
  if (inflow) conds.push(Prisma.sql`a."inflow" = ${inflow}`)
  if (pref) conds.push(Prisma.sql`${prefSql} = ${pref}`)
  if (view === "compare") {
    const fromKey = ymKey(addMonths(currentYmJst(), -(months - 1)))
    conds.push(Prisma.sql`(a."year" * 100 + a."month") >= ${fromKey}`)
  }
  const where = Prisma.join(conds, " AND ")
  const from = Prisma.sql`FROM "ApplicationRecord" a LEFT JOIN "Company" c ON c."id" = a."companyRef"`

  // 絞り込みの選択肢（流入元・都道府県）
  const [inflowRows, prefRows] = await Promise.all([
    prisma.$queryRaw<{ inflow: string; n: number }[]>`
      SELECT a."inflow" AS inflow, COUNT(*)::int AS n FROM "ApplicationRecord" a GROUP BY a."inflow" ORDER BY n DESC`,
    prisma.$queryRaw<{ pref: string | null; n: number }[]>`
      SELECT ${prefSql} AS pref, COUNT(*)::int AS n ${from} GROUP BY 1 ORDER BY n DESC`,
  ])
  const options = {
    inflows: inflowRows.map(r => r.inflow),
    prefs: prefRows.filter(r => r.pref).map(r => r.pref as string),
  }

  if (view === "trend") {
    const rows = unit === "month"
      ? await prisma.$queryRaw<(AggRow & { year: number; period: number })[]>`
          SELECT a."year" AS year, a."month" AS period, ${AGG} ${from} WHERE ${where}
          GROUP BY 1, 2 ORDER BY 1, 2`
      : await prisma.$queryRaw<(AggRow & { year: number; period: number })[]>`
          SELECT a."year" AS year, (((a."month" - 1) / 3) + 1)::int AS period, ${AGG} ${from} WHERE ${where}
          GROUP BY 1, 2 ORDER BY 1, 2`
    return NextResponse.json({
      view, unit, options,
      periods: rows.map(r => ({
        label: unit === "month" ? `${r.year}/${String(r.period).padStart(2, "0")}` : `${r.year} Q${r.period}`,
        ...shape(r),
      })),
    })
  }

  // 比較（流入元ごと／都道府県ごと）
  const keySql = groupBy === "inflow" ? Prisma.sql`a."inflow"` : prefSql
  const rows = await prisma.$queryRaw<(AggRow & { key: string | null })[]>`
    SELECT ${keySql} AS key, ${AGG} ${from} WHERE ${where}
    GROUP BY 1 ORDER BY total DESC`
  return NextResponse.json({
    view, groupBy, months, prefMode, options,
    groups: rows.map(r => ({ key: r.key ?? (groupBy === "pref" ? "不明" : "未設定"), ...shape(r) })),
  })
}
