// 置き場所: src/lib/segments.ts
// 年代別・二種免許の有無別の、応募数と入社数（入社率の分析用）
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export const SEGMENT_AGE_LABELS = ["〜20代", "30代", "40代", "50代", "60代", "70代〜", "年齢不明"]
export const SEGMENT_LICENSE_LABELS = ["二種あり", "二種なし", "二種 未記入"]

export type Segment = { label: string; total: number; hired: number }
export type SegmentSet = { age: Segment[]; license: Segment[]; total: number; hired: number }

type Row = Record<string, number>

/**
 * from / where（ApplicationRecord を a として参照する SQL）で絞った応募を、年代・二種ごとに集計する。
 */
export async function segmentCounts(from: Prisma.Sql, where: Prisma.Sql): Promise<SegmentSet> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE a."status" = '入社')::int AS hired,
      COUNT(*) FILTER (WHERE a."age" < 30)::int AS t0, COUNT(*) FILTER (WHERE a."age" < 30 AND a."status" = '入社')::int AS h0,
      COUNT(*) FILTER (WHERE a."age" BETWEEN 30 AND 39)::int AS t1, COUNT(*) FILTER (WHERE a."age" BETWEEN 30 AND 39 AND a."status" = '入社')::int AS h1,
      COUNT(*) FILTER (WHERE a."age" BETWEEN 40 AND 49)::int AS t2, COUNT(*) FILTER (WHERE a."age" BETWEEN 40 AND 49 AND a."status" = '入社')::int AS h2,
      COUNT(*) FILTER (WHERE a."age" BETWEEN 50 AND 59)::int AS t3, COUNT(*) FILTER (WHERE a."age" BETWEEN 50 AND 59 AND a."status" = '入社')::int AS h3,
      COUNT(*) FILTER (WHERE a."age" BETWEEN 60 AND 69)::int AS t4, COUNT(*) FILTER (WHERE a."age" BETWEEN 60 AND 69 AND a."status" = '入社')::int AS h4,
      COUNT(*) FILTER (WHERE a."age" >= 70)::int AS t5, COUNT(*) FILTER (WHERE a."age" >= 70 AND a."status" = '入社')::int AS h5,
      COUNT(*) FILTER (WHERE a."age" IS NULL)::int AS t6, COUNT(*) FILTER (WHERE a."age" IS NULL AND a."status" = '入社')::int AS h6,
      COUNT(*) FILTER (WHERE a."hasLicense2" = true)::int AS l0, COUNT(*) FILTER (WHERE a."hasLicense2" = true AND a."status" = '入社')::int AS lh0,
      COUNT(*) FILTER (WHERE a."hasLicense2" = false)::int AS l1, COUNT(*) FILTER (WHERE a."hasLicense2" = false AND a."status" = '入社')::int AS lh1,
      COUNT(*) FILTER (WHERE a."hasLicense2" IS NULL)::int AS l2, COUNT(*) FILTER (WHERE a."hasLicense2" IS NULL AND a."status" = '入社')::int AS lh2
    ${from}
    WHERE ${where}
  `
  const r = rows[0] ?? {}
  const n = (k: string) => Number(r[k] ?? 0)
  return {
    total: n("total"),
    hired: n("hired"),
    age: SEGMENT_AGE_LABELS.map((label, i) => ({ label, total: n("t" + i), hired: n("h" + i) })),
    license: SEGMENT_LICENSE_LABELS.map((label, i) => ({ label, total: n("l" + i), hired: n("lh" + i) })),
  }
}
