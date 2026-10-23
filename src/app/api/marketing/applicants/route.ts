// 置き場所: src/app/api/marketing/applicants/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { canViewMarketing } from "@/lib/permissions"

/**
 * 転職道全体の応募者の属性の推移（年代構成・平均年齢・女性比率・二種有り比率）。
 * query:
 *   unit = month | quarter（既定: quarter）
 *   excludeTel = 1 で TEL応募を除く（TEL応募は年齢が入っていないことが多く、構成が偏るため）
 * 個人は特定しない集計値のみ。
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canViewMarketing(session)) {
    return NextResponse.json({ error: "マーケティング分析の閲覧権限がありません" }, { status: 403 })
  }

  const sp = new URL(req.url).searchParams
  const unit = sp.get("unit") === "month" ? "month" : "quarter"
  const excludeTel = sp.get("excludeTel") === "1"

  type Row = {
    year: number; period: number; total: number; withAge: number; avgAge: number | null; medianAge: number | null
    a20: number; a30: number; a40: number; a50: number; a60: number; a70: number
    female: number; withGender: number; lic: number; withLic: number; unopened: number; withOpened: number
  }

  const rows = unit === "month"
    ? await prisma.$queryRaw<Row[]>`
        SELECT "year", "month" AS period,
          COUNT(*)::int AS total, COUNT("age")::int AS "withAge",
          AVG("age")::float AS "avgAge",
          percentile_cont(0.5) WITHIN GROUP (ORDER BY "age")::float AS "medianAge",
          COUNT(*) FILTER (WHERE "age" < 30)::int AS a20,
          COUNT(*) FILTER (WHERE "age" BETWEEN 30 AND 39)::int AS a30,
          COUNT(*) FILTER (WHERE "age" BETWEEN 40 AND 49)::int AS a40,
          COUNT(*) FILTER (WHERE "age" BETWEEN 50 AND 59)::int AS a50,
          COUNT(*) FILTER (WHERE "age" BETWEEN 60 AND 69)::int AS a60,
          COUNT(*) FILTER (WHERE "age" >= 70)::int AS a70,
          COUNT(*) FILTER (WHERE "gender" = '女性')::int AS female, COUNT("gender")::int AS "withGender",
          COUNT(*) FILTER (WHERE "hasLicense2" = true)::int AS lic, COUNT("hasLicense2")::int AS "withLic",
          COUNT(*) FILTER (WHERE "companyOpened" = false)::int AS unopened, COUNT("companyOpened")::int AS "withOpened"
        FROM "ApplicationRecord"
        WHERE (${excludeTel}::boolean = false OR "entryType" IS DISTINCT FROM 'TEL応募')
        GROUP BY "year", "month" ORDER BY "year", "month"`
    : await prisma.$queryRaw<Row[]>`
        SELECT "year", ((("month" - 1) / 3) + 1)::int AS period,
          COUNT(*)::int AS total, COUNT("age")::int AS "withAge",
          AVG("age")::float AS "avgAge",
          percentile_cont(0.5) WITHIN GROUP (ORDER BY "age")::float AS "medianAge",
          COUNT(*) FILTER (WHERE "age" < 30)::int AS a20,
          COUNT(*) FILTER (WHERE "age" BETWEEN 30 AND 39)::int AS a30,
          COUNT(*) FILTER (WHERE "age" BETWEEN 40 AND 49)::int AS a40,
          COUNT(*) FILTER (WHERE "age" BETWEEN 50 AND 59)::int AS a50,
          COUNT(*) FILTER (WHERE "age" BETWEEN 60 AND 69)::int AS a60,
          COUNT(*) FILTER (WHERE "age" >= 70)::int AS a70,
          COUNT(*) FILTER (WHERE "gender" = '女性')::int AS female, COUNT("gender")::int AS "withGender",
          COUNT(*) FILTER (WHERE "hasLicense2" = true)::int AS lic, COUNT("hasLicense2")::int AS "withLic",
          COUNT(*) FILTER (WHERE "companyOpened" = false)::int AS unopened, COUNT("companyOpened")::int AS "withOpened"
        FROM "ApplicationRecord"
        WHERE (${excludeTel}::boolean = false OR "entryType" IS DISTINCT FROM 'TEL応募')
        GROUP BY 1, 2 ORDER BY 1, 2`

  return NextResponse.json({
    unit,
    excludeTel,
    periods: rows.map(r => ({
      label: unit === "month" ? `${r.year}/${String(r.period).padStart(2, "0")}` : `${r.year} Q${r.period}`,
      total: Number(r.total),
      withAge: Number(r.withAge),
      avgAge: r.avgAge != null ? Number(r.avgAge) : null,
      medianAge: r.medianAge != null ? Number(r.medianAge) : null,
      bands: [r.a20, r.a30, r.a40, r.a50, r.a60, r.a70].map(Number),
      female: Number(r.female), withGender: Number(r.withGender),
      lic: Number(r.lic), withLic: Number(r.withLic),
      unopened: Number(r.unopened), withOpened: Number(r.withOpened),
    })),
  })
}
