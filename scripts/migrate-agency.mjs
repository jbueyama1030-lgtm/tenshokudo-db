import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// 代理店ユーザーID → 代理店名
const AGENCY_USERS = [
  { name: "NK", userId: "cmqaluxmc00t2pi0plhlo9avm" },
  { name: "TM", userId: "cmqeje8mp0000p10pbu78cayq" },
  { name: "HA", userId: "cmqga9pzj0000mu0pslkcr51j" },
]

const DRY_RUN = !process.argv.includes("--apply")

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN（変更しません） ===" : "=== APPLY（本番反映） ===")

  for (const a of AGENCY_USERS) {
    // 対象件数を先に数える
    const count = await prisma.company.count({ where: { userId: a.userId } })
    console.log(`\n[${a.name}] 対象企業: ${count}件`)

    if (DRY_RUN) continue

    // 代理店を作成（既にあれば取得）
    const agency = await prisma.agency.upsert({
      where: { name: a.name },
      update: {},
      create: { name: a.name },
    })
    console.log(`  Agency作成/取得: ${agency.id}`)

    // 所属ユーザーに agencyId を付与
    await prisma.user.update({
      where: { id: a.userId },
      data: { agencyId: agency.id },
    })
    console.log(`  Userに agencyId を付与`)

    // 担当企業に agencyId を付与
    const res = await prisma.company.updateMany({
      where: { userId: a.userId },
      data: { agencyId: agency.id },
    })
    console.log(`  Company更新: ${res.count}件`)
  }

  // 検証
  console.log("\n=== 検証 ===")
  const total = await prisma.company.count()
  const withAgency = await prisma.company.count({ where: { agencyId: { not: null } } })
  console.log(`全企業: ${total}件 / 代理店紐付け: ${withAgency}件 / 直販: ${total - withAgency}件`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())