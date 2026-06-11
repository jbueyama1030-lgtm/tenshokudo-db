import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companies = await prisma.company.findMany({
    include: { user: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  })

  return NextResponse.json(companies)
}