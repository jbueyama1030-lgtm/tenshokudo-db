import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// GET: 案件1件を取得（紐付く企業の営業データも含めて返す）
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const task = await prisma.productionTask.findUnique({
    where: { id },
    include: {
      company: {
        include: {
          user: { select: { id: true, name: true } },
          monthlyRecords: { orderBy: [{ year: "asc" }, { month: "asc" }] },
        },
      },
      assignee: { select: { id: true, name: true } },
      requester: { select: { id: true, name: true } },
    },
  })

  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(task)
}

// PATCH: 案件を更新（担当割り当て・ステータス・メモ・納期など）
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const existing = await prisma.productionTask.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // 更新するフィールドだけを組み立てる（送られてきたものだけ反映）
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = body.name
  if (body.type !== undefined) data.type = body.type
  if (body.priority !== undefined) data.priority = body.priority
  if (body.status !== undefined) data.status = body.status
  if (body.memo !== undefined) data.memo = body.memo || null
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
  if (body.publishedAt !== undefined) data.publishedAt = body.publishedAt ? new Date(body.publishedAt) : null
  if (body.stoppedAt !== undefined) data.stoppedAt = body.stoppedAt ? new Date(body.stoppedAt) : null
  // assigneeId: 明示的にnullを送れば未割当に戻せる
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId || null

  const task = await prisma.productionTask.update({
    where: { id },
    data,
    include: {
      company: { select: { id: true, name: true, companyId: true } },
      assignee: { select: { id: true, name: true } },
      requester: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(task)
}

// DELETE: 案件を削除
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const existing = await prisma.productionTask.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.productionTask.delete({ where: { id } })
  return NextResponse.json({ success: true })
}