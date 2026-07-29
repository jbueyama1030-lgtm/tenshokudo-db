import { PrismaClient } from "@prisma/client"

// 掲載契約の期間から Company.status を再計算して更新する。
// ルール:
//  - 掲載契約のアクティブ期間がある → "contracted"
//  - 掲載契約の期間が過去にあったが全て終了 → "delisted"
//  - 掲載契約の期間が1本もない → status を変更しない
//    （referral_only / approaching など、掲載契約に依存しないステータスを維持するため）
//
// アクティブ判定: contractStart <= 今日 かつ (contractEnd が null または contractEnd >= 今日)

export async function recalcCompanyStatus(prisma: PrismaClient, companyId: string): Promise<string | null> {
  const periods = await prisma.contractPeriod.findMany({
    where: { companyId },
    select: { contractStart: true, contractEnd: true },
  })

  // 掲載契約が1本もない企業は自動更新しない
  if (periods.length === 0) return null

  const now = new Date()

  const hasActive = periods.some(p => {
    if (!p.contractStart) return false
    if (p.contractStart > now) return false
    if (p.contractEnd && p.contractEnd < now) return false
    return true
  })

  const newStatus = hasActive ? "contracted" : "delisted"

  await prisma.company.update({
    where: { id: companyId },
    data: { status: newStatus },
  })

  return newStatus
}