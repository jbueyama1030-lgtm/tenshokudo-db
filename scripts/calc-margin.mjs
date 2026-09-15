import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const TAX_RATE = 0.1
const OPTION_RATE = 0.30
const TIERS = [
  { min: 4000000, rate: 0.45 },
  { min: 3000000, rate: 0.40 },
  { min: 2000000, rate: 0.35 },
  { min: 0,       rate: 0.30 },
]

const toExcl = (v) => Math.round(v / (1 + TAX_RATE))
const yen = (v) => v.toLocaleString("ja-JP")

function breakdown(p) {
  const annualBase = (p.monthlyFee ?? 0) * 12
  const discountAmt = Math.round(annualBase * ((p.discountRate ?? 0) / 100))
  const listing = annualBase - discountAmt
  let option = 0
  if (Array.isArray(p.options)) {
    for (const o of p.options) {
      const amt = Number(o?.amount)
      if (Number.isFinite(amt)) option += amt
    }
  }
  return { listing, option }
}

async function main() {
  const [agencyName, yearStr, monthStr] = process.argv.slice(2)
  if (!agencyName || !yearStr || !monthStr) {
    console.log("使い方: node scripts/calc-margin.mjs NK 2025 5")
    process.exit(1)
  }
  const year = Number(yearStr)
  const month = Number(monthStr)

  const agency = await prisma.agency.findUnique({ where: { name: agencyName } })
  if (!agency) { console.error("代理店が見つかりません: " + agencyName); process.exit(1) }

  const from = new Date(Date.UTC(year, month - 1, 1))
  const to = new Date(Date.UTC(year, month, 1))

  // その月に成立（＝掲載開始）した契約期間だけを集める
  const periods = await prisma.contractPeriod.findMany({
    where: {
      contractStart: { gte: from, lt: to },
      company: { agencyId: agency.id },
    },
    include: { company: { select: { name: true, companyId: true } } },
    orderBy: { contractStart: "asc" },
  })

  console.log("=== " + agencyName + " / " + year + "年" + month + "月 新規契約 ===\n")

  if (periods.length === 0) {
    console.log("該当なし")
    return
  }

  const rows = periods.map(p => {
    const b = breakdown(p)
    return {
      name: p.company?.name ?? "-",
      companyId: p.company?.companyId ?? "-",
      start: p.contractStart,
      plan: p.planName ?? "-",
      monthlyFee: p.monthlyFee ?? 0,
      listing: toExcl(b.listing),
      option: toExcl(b.option),
    }
  })

  const total = rows.reduce((s, r) => s + r.listing + r.option, 0)
  const rate = TIERS.find(t => total >= t.min).rate

  for (const r of rows) {
    const m = Math.round(r.listing * rate + r.option * OPTION_RATE)
    console.log(
      "  " + String(r.companyId).padStart(5) + " " + r.name +
      "\n        開始 " + r.start.toISOString().slice(0, 10) +
      " / プラン " + r.plan +
      " / 月額(税込) " + yen(r.monthlyFee) +
      "\n        年額(税抜) 掲載 " + yen(r.listing) + " + オプション " + yen(r.option) +
      " → 手数料 " + yen(m)
    )
  }

  const marginTotal = rows.reduce(
    (s, r) => s + Math.round(r.listing * rate + r.option * OPTION_RATE), 0
  )

  console.log("\n--- 集計 ---")
  console.log("新規契約数        : " + rows.length + "件")
  console.log("月間新規受注(税抜): " + yen(total))
  console.log("適用ラダー        : " + (rate * 100) + "%")
  console.log("支払手数料合計    : " + yen(marginTotal))
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())