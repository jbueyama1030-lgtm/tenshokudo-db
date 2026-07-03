import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// GET: 案件一覧（?companyId=xxx で特定企業に絞り込み可能）
export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get("companyId")

  const tasks = await prisma.productionTask.findMany({
    where: companyId ? { companyId } : {},
    include: {
      company: { select: { id: true, name: true, companyId: true } },
      assignee: { select: { id: true, name: true } },
      requester: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(tasks)
}

// POST: 新規案件を起票
export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  // 必須：companyId と name
  if (!body.companyId || !body.name) {
    return NextResponse.json({ error: "企業と案件名は必須です" }, { status: 400 })
  }

  const task = await prisma.productionTask.create({
    data: {
      companyId: body.companyId,
      name: body.name,
      type: body.type || "new",
      priority: body.priority || "medium",
      status: body.status || "not_started",
      memo: body.memo || null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      // 起票者＝ログイン中の営業。制作担当は起票時は未割当（null）
      requesterId: session.user.id,
      assigneeId: null,
    },
    include: {
      company: { select: { id: true, name: true, companyId: true } },
      assignee: { select: { id: true, name: true } },
      requester: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(task)
}