// 置き場所: scripts/export-assignees.mjs
// 企業ごとの営業担当者を CSV に書き出す（DBは読むだけ）
// 実行: node scripts/export-assignees.mjs
import { PrismaClient } from "@prisma/client"
import { writeFileSync } from "fs"

const prisma = new PrismaClient()

const STATUS_LABEL = {
  contracted: "契約中",
  referral_only: "人材紹介のみ",
  approaching: "アプローチ中",
  delisted: "掲載落ち",
}

const rows = await prisma.company.findMany({
  select: {
    companyId: true,
    name: true,
    status: true,
    user: { select: { name: true } },
    agency: { select: { name: true } },
  },
  orderBy: [{ user: { name: "asc" } }, { status: "asc" }, { name: "asc" }],
})

// カンマ・改行・ダブルクォートを含む値は "" で囲む
const esc = v => {
  const s = v == null ? "" : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const lines = [["担当者", "所属", "企業ID", "企業名", "ステータス"].join(",")]
for (const r of rows) {
  lines.push(
    [r.user?.name, r.agency?.name ?? "自社", r.companyId, r.name, STATUS_LABEL[r.status] ?? r.status]
      .map(esc)
      .join(","),
  )
}

const file = `company-assignees-${new Date().toISOString().slice(0, 10)}.csv`
// 先頭のBOMで、Excel で開いても文字化けしない
writeFileSync(file, "\uFEFF" + lines.join("\r\n"), "utf8")
console.log(`${rows.length}件を書き出しました: ${file}`)

await prisma.$disconnect()