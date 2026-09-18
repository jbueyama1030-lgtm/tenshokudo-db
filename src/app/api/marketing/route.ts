import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import { canViewMarketing } from "@/lib/permissions"

const prisma = new PrismaClient()

// ファネル判定（確定した分類）
const NO_CONTACT = ["未対応", "連絡取れず"]
const INTERVIEW_SET = ["面接設定済み", "面接完了", "内定通知済み", "入社", "面接・内定後辞退"]
const INTERVIEW_DONE = ["面接完了", "内定通知済み", "入社", "面接・内定後辞退"]
const HIRED = ["入社"]

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
]

function extractPref(address: string | null): string {
  if (!address) return "不明"
  for (const pref of PREFECTURES) {
    if (address.includes(pref)) return pref
  }
  return "不明"
}

type Funnel = {
  apply: number
  contact: number
  interviewSet: number
  interviewDone: number
  hired: number
}

function emptyFunnel(): Funnel {
  return { apply: 0, contact: 0, interviewSet: 0, interviewDone: 0, hired: 0 }
}

function addToFunnel(f: Funnel, status: string) {
  f.apply++
  if (!NO_CONTACT.includes(status)) f.contact++
  if (INTERVIEW_SET.includes(status)) f.interviewSet++
  if (INTERVIEW_DONE.includes(status)) f.interviewDone++
  if (HIRED.includes(status)) f.hired++
}

type GroupBy = "inflow" | "area" | "entryType"

/**
 * マーケティング分析（統合版）。
 *
 * 絞り込み: year, month, area, entryType, inflow
 * 集計軸  : groupBy = inflow | area | entryType
 *
 * 【UU（実人数）】
 * 電話番号ハッシュの distinct 件数。同一人物の複数応募を名寄せする。
 * 電話番号が無い応募は UU に数えられないため、応募数より必ず少なくなる。
 *
 * 【広告費の扱い】
 * 広告費は「流入元 × 月」の単位でしか持っていない。
 * そのため絞り込みをかけた場合や、エリア・種別で集計する場合は、
 * その区分に落ちた応募数の比率で按分した概算値になる。
 * 按分が発生したかは costIsEstimated で返す。
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!canViewMarketing(session)) {
    return NextResponse.json({ error: "マーケティング分析の閲覧権限がありません" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const yearParam = searchParams.get("year")
  const monthParam = searchParams.get("month")
  const areaFilter = searchParams.get("area") ?? ""
  const entryTypeFilter = searchParams.get("entryType") ?? ""
  const inflowFilter = searchParams.get("inflow") ?? ""
  const groupByParam = searchParams.get("groupBy") ?? "inflow"
  const groupBy: GroupBy =
    groupByParam === "area" || groupByParam === "entryType" ? groupByParam : "inflow"

  // 選択可能な年月
  const allMonths = await prisma.applicationRecord.findMany({
    select: { year: true, month: true },
    distinct: ["year", "month"],
    orderBy: [{ year: "desc" }, { month: "desc" }],
  })
  const availableMonths = allMonths.map(m => ({ year: m.year, month: m.month }))

  let targetYear: number | null = null
  let targetMonth: number | null = null
  if (yearParam && monthParam) {
    targetYear = Number(yearParam)
    targetMonth = Number(monthParam)
  } else if (availableMonths.length > 0) {
    targetYear = availableMonths[0].year
    targetMonth = availableMonths[0].month
  }

  const emptyResponse = {
    availableMonths,
    target: null,
    groupBy,
    filters: { area: areaFilter, entryType: entryTypeFilter, inflow: inflowFilter },
    options: { areas: [], entryTypes: [], inflows: [] },
    overall: emptyFunnel(),
    overallUu: 0,
    rows: [],
    overallAdCost: 0,
    directAdCost: 0,
    overheadAdCost: 0,
    overheadItems: [],
    costIsEstimated: false,
  }

  if (targetYear == null || targetMonth == null) {
    return NextResponse.json(emptyResponse)
  }

  // --- その月の応募明細をすべて取得（絞り込みはメモリ上で行う） ---
  const records = await prisma.applicationRecord.findMany({
    where: { year: targetYear, month: targetMonth },
    select: {
      status: true,
      inflow: true,
      entryType: true,
      phoneHash: true,
      company: { select: { address: true } },
    },
  })

  // 絞り込み選択肢は「絞り込み前」の全体から作る
  const areaSet = new Set<string>()
  const entryTypeSet = new Set<string>()
  const inflowSet = new Set<string>()
  for (const r of records) {
    areaSet.add(extractPref(r.company?.address ?? null))
    if (r.entryType) entryTypeSet.add(r.entryType)
    inflowSet.add(r.inflow)
  }
  const options = {
    areas: Array.from(areaSet).sort(),
    entryTypes: Array.from(entryTypeSet).sort(),
    inflows: Array.from(inflowSet).sort(),
  }

  // --- 広告費（その月の明細すべて） ---
  const adCosts = await prisma.adCost.findMany({
    where: { year: targetYear, month: targetMonth },
  })

  // 成果報酬型の金額算出に使うため、絞り込み前の流入別応募数を先に数える
  const applyByInflowAll: Record<string, number> = {}
  for (const r of records) {
    applyByInflowAll[r.inflow] = (applyByInflowAll[r.inflow] ?? 0) + 1
  }

  const amountOf = (a: typeof adCosts[number]): number => {
    if (a.costType === "operation") return a.totalCost ?? 0
    if (a.costType === "performance" && a.unitPrice != null) {
      const cnt = a.inflow ? (applyByInflowAll[a.inflow] ?? 0) : 0
      return a.unitPrice * cnt
    }
    return 0
  }

  // 流入元ごとの direct 費用と、overhead の合計
  const directCostByInflow: Record<string, number> = {}
  let overheadAdCost = 0
  const overheadItems: { name: string; amount: number }[] = []

  for (const a of adCosts) {
    const amount = amountOf(a)
    if (a.category === "overhead" || !a.inflow) {
      overheadAdCost += amount
      overheadItems.push({ name: a.name, amount })
    } else {
      directCostByInflow[a.inflow] = (directCostByInflow[a.inflow] ?? 0) + amount
    }
  }
  overheadItems.sort((a, b) => b.amount - a.amount)

  // --- 絞り込みを適用 ---
  const filtered = records.filter(r => {
    if (areaFilter && extractPref(r.company?.address ?? null) !== areaFilter) return false
    if (entryTypeFilter && (r.entryType ?? "") !== entryTypeFilter) return false
    if (inflowFilter && r.inflow !== inflowFilter) return false
    return true
  })

  // --- 集計 ---
  const overall = emptyFunnel()
  const overallUuSet = new Set<string>()
  const groupMap: Record<string, Funnel> = {}
  const uuByGroup: Record<string, Set<string>> = {}
  // 按分のため「グループ × 流入元」の応募数も数える
  const applyByGroupInflow: Record<string, Record<string, number>> = {}

  const keyOf = (r: typeof records[number]): string => {
    if (groupBy === "area") return extractPref(r.company?.address ?? null)
    if (groupBy === "entryType") return r.entryType ?? "(不明)"
    return r.inflow
  }

  for (const r of filtered) {
    addToFunnel(overall, r.status)
    if (r.phoneHash) overallUuSet.add(r.phoneHash)

    const key = keyOf(r)
    if (!groupMap[key]) groupMap[key] = emptyFunnel()
    addToFunnel(groupMap[key], r.status)

    if (!uuByGroup[key]) uuByGroup[key] = new Set<string>()
    if (r.phoneHash) uuByGroup[key].add(r.phoneHash)

    if (!applyByGroupInflow[key]) applyByGroupInflow[key] = {}
    applyByGroupInflow[key][r.inflow] = (applyByGroupInflow[key][r.inflow] ?? 0) + 1
  }

  // 按分が発生するか：流入元で集計 かつ 絞り込み無し のときだけ実額
  const isExact = groupBy === "inflow" && !areaFilter && !entryTypeFilter
  const costIsEstimated = !isExact

  // --- 行を組み立てる ---
  const rows = Object.entries(groupMap)
    .map(([key, f]) => {
      let adCost: number | null = null

      if (isExact) {
        // 流入元そのものなので実額
        adCost = key in directCostByInflow ? directCostByInflow[key] : null
      } else {
        // このグループに落ちた応募の比率で、各流入元の費用を按分する
        let sum = 0
        let hasAny = false
        const byInflow = applyByGroupInflow[key] ?? {}
        for (const [inf, cnt] of Object.entries(byInflow)) {
          const cost = directCostByInflow[inf]
          if (cost == null) continue
          const total = applyByInflowAll[inf] ?? 0
          if (total === 0) continue
          sum += cost * (cnt / total)
          hasAny = true
        }
        adCost = hasAny ? Math.round(sum) : null
      }

      const uu = uuByGroup[key]?.size ?? 0

      return {
        key,
        ...f,
        uu,
        // 延べ応募がUUの何倍か（同じ人が繰り返し応募している度合い）
        uuRatio: uu > 0 ? Number((f.apply / uu).toFixed(2)) : null,
        adCost,
        cpaApply: adCost != null && f.apply > 0 ? Math.round(adCost / f.apply) : null,
        cpaUu: adCost != null && uu > 0 ? Math.round(adCost / uu) : null,
        cpaHire: adCost != null && f.hired > 0 ? Math.round(adCost / f.hired) : null,
        contactRate: f.apply > 0 ? Number(((f.contact / f.apply) * 100).toFixed(1)) : 0,
        hireRate: f.apply > 0 ? Number(((f.hired / f.apply) * 100).toFixed(2)) : 0,
      }
    })
    .sort((a, b) => b.apply - a.apply)

  const directAdCost = rows.reduce((s, r) => s + (r.adCost ?? 0), 0)

  // 全体の広告費：絞り込み無しなら総額、絞り込み有りなら按分後の direct のみ
  const hasFilter = !!(areaFilter || entryTypeFilter || inflowFilter)
  const overallAdCost = hasFilter ? directAdCost : directAdCost + overheadAdCost

  return NextResponse.json({
    availableMonths,
    target: { year: targetYear, month: targetMonth },
    groupBy,
    filters: { area: areaFilter, entryType: entryTypeFilter, inflow: inflowFilter },
    options,
    overall,
    overallUu: overallUuSet.size,
    rows,
    overallAdCost,
    directAdCost,
    overheadAdCost: hasFilter ? 0 : overheadAdCost,
    overheadItems: hasFilter ? [] : overheadItems,
    costIsEstimated,
  })
}