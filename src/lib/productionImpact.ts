// 置き場所: src/lib/productionImpact.ts
import { prisma } from "@/lib/prisma"
import { addMonths, currentYmJst, ymKey, type YearMonth } from "@/lib/funnelAnalysis"

/** 比べる期間（公開月の前後それぞれ何ヶ月か。公開月そのものは含めない） */
export const IMPACT_WINDOW_MONTHS = 3
/** 何件の制作タスクまで見るか（新しい順） */
const MAX_TASKS = 3

export type ImpactWindow = {
  from: YearMonth
  to: YearMonth
  months: number
  apply: number
  hired: number
}

export type ProductionImpactRow = {
  taskName: string
  taskType: string
  publishedAt: string
  before: ImpactWindow
  /** 公開後に完了した月が1つも無ければ null */
  after: ImpactWindow | null
  /** 公開後の期間が IMPACT_WINDOW_MONTHS に満たない（途中経過） */
  afterPartial: boolean
}

function toYmJst(d: Date): YearMonth {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1 }
}

async function countWindow(companyDbId: string, from: YearMonth, to: YearMonth): Promise<ImpactWindow> {
  const rows = await prisma.$queryRaw<{ apply: number; hired: number }[]>`
    SELECT COUNT(*)::int AS apply,
           COUNT(*) FILTER (WHERE "status" = '入社')::int AS hired
    FROM "ApplicationRecord"
    WHERE "companyRef" = ${companyDbId}
      AND ("year" * 100 + "month") BETWEEN ${ymKey(from)} AND ${ymKey(to)}
  `
  const months = (to.year - from.year) * 12 + (to.month - from.month) + 1
  return { from, to, months, apply: Number(rows[0]?.apply ?? 0), hired: Number(rows[0]?.hired ?? 0) }
}

/**
 * 公開済みの制作タスク（記事の新規・修正・リニューアル）について、
 * 公開月の前後 IMPACT_WINDOW_MONTHS ヶ月の応募数・入社数を比べる。
 * 公開後は「先月まで」の完了月だけを使う（集計途中の今月は含めない）。
 *
 * 注意: 季節要因や広告の出稿量でも応募は動くので、記事改修の効果とは断定できない。
 */
export async function analyzeProductionImpact(companyDbId: string): Promise<ProductionImpactRow[]> {
  const tasks = await prisma.productionTask.findMany({
    where: { companyId: companyDbId, publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    take: MAX_TASKS,
    select: { name: true, type: true, publishedAt: true },
  })

  const lastComplete = addMonths(currentYmJst(), -1)
  const out: ProductionImpactRow[] = []

  for (const t of tasks) {
    const pub = toYmJst(t.publishedAt!)
    const before = await countWindow(companyDbId, addMonths(pub, -IMPACT_WINDOW_MONTHS), addMonths(pub, -1))

    const afterFrom = addMonths(pub, 1)
    const afterIdealTo = addMonths(pub, IMPACT_WINDOW_MONTHS)
    const afterTo = ymKey(afterIdealTo) <= ymKey(lastComplete) ? afterIdealTo : lastComplete
    const after = ymKey(afterTo) >= ymKey(afterFrom) ? await countWindow(companyDbId, afterFrom, afterTo) : null

    out.push({
      taskName: t.name,
      taskType: t.type,
      publishedAt: t.publishedAt!.toISOString(),
      before,
      after,
      afterPartial: after != null && after.months < IMPACT_WINDOW_MONTHS,
    })
  }
  return out
}
