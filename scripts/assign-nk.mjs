import { PrismaClient } from "@prisma/client"
import fs from "fs"

const prisma = new PrismaClient()

const CSV_PATH = "scripts/nk-assignees.csv"
const DRY_RUN = !process.argv.includes("--apply")

// 担当者名 → メールアドレス
const ASSIGNEE_EMAIL = {
  "田代": "tashiro@nk-global.jp",
  "植野": "ueno@nk-global.jp",
}

function parseCsv(path) {
  const text = fs.readFileSync(path, "utf8").replace(/^\uFEFF/, "")
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== "")
  const rows = []
  const seen = new Set()
  for (const line of lines) {
    const cols = line.split(",")
    const companyId = (cols[1] ?? "").trim()
    const name = (cols[2] ?? "").trim()
    const assignee = (cols[3] ?? "").trim()
    // ヘッダ行や空行を飛ばす
    if (!/^\d+$/.test(companyId)) continue
    if (!ASSIGNEE_EMAIL[assignee]) continue
    const key = companyId + "|" + name
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ companyId, name, assignee })
  }
  return rows
}

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN（変更しません） ===" : "=== APPLY（本番反映） ===")

  const rows = parseCsv(CSV_PATH)
  console.log("CSV読み込み: " + rows.length + "件\n")

  // 担当者のユーザーIDを引く
  const userIdOf = {}
  for (const [who, email] of Object.entries(ASSIGNEE_EMAIL)) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, agencyId: true } })
    if (!u) { console.error("ユーザーが見つかりません: " + email); process.exit(1) }
    if (!u.agencyId) { console.error("agencyId未設定: " + email); process.exit(1) }
    userIdOf[who] = u.id
    console.log(who + " → " + u.name + " (" + u.id + ")")
  }
  console.log("")

  const notFound = []
  let updated = 0

  for (const r of rows) {
    const company = await prisma.company.findUnique({
      where: { companyId: r.companyId },
      select: { id: true, name: true, agencyId: true, userId: true },
    })

    if (!company) { notFound.push(r); continue }

    // 念のため：NK案件以外は触らない
    if (!company.agencyId) {
      console.log("⚠ 代理店未設定のためスキップ: " + r.companyId + " " + company.name)
      continue
    }

    if (!DRY_RUN) {
      await prisma.company.update({
        where: { id: company.id },
        data: { userId: userIdOf[r.assignee] },
      })
    }
    updated++
  }

  console.log("更新" + (DRY_RUN ? "予定" : "済み") + ": " + updated + "件")

  if (notFound.length > 0) {
    console.log("\n=== DBに見つからなかった企業（" + notFound.length + "件）===")
    for (const r of notFound) console.log("  ID " + r.companyId + " : " + r.name)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())