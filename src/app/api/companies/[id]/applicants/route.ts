// 置き場所: src/app/api/companies/[id]/applicants/route.ts
import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { isInAgencyScope } from "@/lib/permissions"
import { addMonths, currentYmJst, ymKey } from "@/lib/funnelAnalysis"
import { extractPref, PREFECTURES, UNKNOWN_PREF } from "@/lib/area"
import { segmentCounts } from "@/lib/segments"

const AGE_BANDS = [
  { key: "~29", label: "〜20代", min: 0, max: 29 },
  { key: "30s", label: "30代", min: 30, max: 39 },
  { key: "40s", label: "40代", min: 40, max: 49 },
  { key: "50s", label: "50代", min: 50, max: 59 },
  { key: "60s", label: "60代", min: 60, max: 69 },
  { key: "70+", label: "70代〜", min: 70, max: 200 },
]

/**
 * 企業の応募者の属性（年代・性別・二種・企業開封・都道府県）の集計。
 * query: months=12（直近何か月か。今月を含む。最大36）
 * 個人は特定しない。集計値だけを返す。
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const company = await prisma.company.findUnique({ where: { id }, select: { id: true, agencyId: true, address: true } })
  if (!company || !isInAgencyScope(session, company.agencyId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const months = Math.min(36, Math.max(1, Number(new URL(req.url).searchParams.get("months")) || 12))
  const fromKey = ymKey(addMonths(currentYmJst(), -(months - 1)))

  const records = await prisma.$queryRaw<{
    age: number | null; gender: string | null; hasLicense2: boolean | null
    companyOpened: boolean | null; applicantPref: string | null; status: string
  }[]>`
    SELECT "age", "gender", "hasLicense2", "companyOpened", "applicantPref", "status"
    FROM "ApplicationRecord"
    WHERE "companyRef" = ${company.id}
      AND ("year" * 100 + "month") >= ${fromKey}
  `

  const total = records.length
  const ages = AGE_BANDS.map(b => {
    const inBand = records.filter(r => r.age != null && r.age >= b.min && r.age <= b.max)
    return { key: b.key, label: b.label, count: inBand.length, hired: inBand.filter(r => r.status === "入社").length }
  })
  const withAge = records.filter(r => r.age != null).length

  const male = records.filter(r => r.gender === "男性").length
  const female = records.filter(r => r.gender === "女性").length
  const licYes = records.filter(r => r.hasLicense2 === true).length
  const licNo = records.filter(r => r.hasLicense2 === false).length
  const opened = records.filter(r => r.companyOpened === true).length
  const unopened = records.filter(r => r.companyOpened === false).length

  const prefCount = new Map<string, number>()
  for (const r of records) if (r.applicantPref) prefCount.set(r.applicantPref, (prefCount.get(r.applicantPref) ?? 0) + 1)
  const prefs = [...prefCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([pref, count]) => ({ pref, count }))
  const withPref = [...prefCount.values()].reduce((s, v) => s + v, 0)

  // 年代別・二種別の入社率（御社）と、同じ都道府県の他社合計（エリア平均）
  const fromSql = Prisma.sql`FROM "ApplicationRecord" a LEFT JOIN "Company" c ON c."id" = a."companyRef"`
  const periodSql = Prisma.sql`(a."year" * 100 + a."month") >= ${fromKey}`
  const pref = extractPref(company.address)
  const prefRegex = "(" + PREFECTURES.join("|") + ")"
  const [segTarget, segArea] = await Promise.all([
    segmentCounts(fromSql, Prisma.sql`a."companyRef" = ${company.id} AND ${periodSql}`),
    pref === UNKNOWN_PREF
      ? Promise.resolve(null)
      : segmentCounts(fromSql, Prisma.sql`substring(c."address" from ${prefRegex}) = ${pref} AND a."companyRef" <> ${company.id} AND ${periodSql}`),
  ])

  return NextResponse.json({
    segments: { target: segTarget, area: segArea, areaLabel: pref === UNKNOWN_PREF ? null : pref + "平均" },
    months,
    total,
    ages, withAge,
    gender: { male, female, unknown: total - male - female },
    license2: { yes: licYes, no: licNo, unknown: total - licYes - licNo },
    opened: { opened, unopened, unknown: total - opened - unopened },
    prefs, withPref,
  })
}
