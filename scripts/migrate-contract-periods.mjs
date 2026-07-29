// 既存 Company の契約・売上情報を ContractPeriod として1本作る移行スクリプト。
// 対象: status が contracted / referral_only かつ contractStart あり の企業のみ。
// 冪等性: 既に ContractPeriod を持つ Company はスキップする（2回流しても重複しない）。
//
// 実行: node scripts/migrate-contract-periods.mjs
//   確認のみ（書き込まない）: node scripts/migrate-contract-periods.mjs --dry

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes("--dry")

const TARGET_STATUSES = ["contracted", "referral_only"]

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN（書き込みません）===" : "=== 本番実行 ===")

  const companies = await prisma.company.findMany({
    include: { contractPeriods: { select: { id: true } } },
  })

  let created = 0
  let skippedNoStart = 0
  let skippedStatus = 0
  let skippedExisting = 0

  for (const c of companies) {
    // 既に契約期間を持つ企業はスキップ（冪等性）
    if (c.contractPeriods.length > 0) {
      skippedExisting++
      continue
    }
    // 対象ステータス以外はスキップ
    if (!TARGET_STATUSES.includes(c.status)) {
      skippedStatus++
      continue
    }
    // 開始日なしはスキップ（後で手入力）
    if (!c.contractStart) {
      skippedNoStart++
      continue
    }

    if (!DRY_RUN) {
      await prisma.contractPeriod.create({
        data: {
          companyId: c.id,
          externalId: c.companyId ?? null,
          status: c.status,
          contractStart: c.contractStart,
          contractRenewal: c.contractRenewal ?? null,
          contractEnd: null,
          planName: c.planName ?? null,
          monthlyFee: c.monthlyFee ?? null,
          discountRate: c.discountRate ?? null,
          discountNote: c.discountNote ?? null,
          options: c.options ?? undefined,
          contractNote: c.contractNote ?? null,
        },
      })
    }
    created++
  }

  console.log("---- 結果 ----")
  console.log("総企業数:", companies.length)
  console.log("作成した契約期間:", created)
  console.log("スキップ（既に期間あり）:", skippedExisting)
  console.log("スキップ（対象外ステータス）:", skippedStatus)
  console.log("スキップ（開始日なし）:", skippedNoStart)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())