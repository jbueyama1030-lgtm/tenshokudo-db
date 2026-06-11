import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const hashedPassword = await bcrypt.hash("password123", 12)

  await prisma.user.upsert({
    where: { email: "admin@tenshokudo.com" },
    update: {},
    create: {
      email: "admin@tenshokudo.com",
      password: hashedPassword,
      name: "管理者",
      role: "admin",
    },
  })

  console.log("✅ テストユーザー作成完了")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())