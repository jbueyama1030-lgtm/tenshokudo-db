import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// ステータスの日本語ラベル（システムコメント生成用）
const STATUS_LABELS: Record<string, string> = {
  not_started: "未着手",
  in_progress: "着手",
  sales_review: "営業確認中",
  client_review: "企業確認中",
  published: "公開",
  completed: "完了",
  paused: "一時停止中",
  stopped: "停止処理済み",
}

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
      lastUpdatedBy: { select: { id: true, name: true } },
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

  const role = session.user.role
  const isAdmin = role !== "sales" && role !== "production"
  const isProduction = role === "production"
  const isSales = role === "sales"
  const isRequester = existing.requesterId === session.user.id

  // 編集権限：制作・adminは全案件、営業は自分が起票した案件のみ
  const canEdit = isAdmin || isProduction || (isSales && isRequester)
  if (!canEdit) {
    return NextResponse.json({ error: "この案件を編集する権限がありません" }, { status: 403 })
  }

  // 「完了」にできるのは依頼営業とadminのみ（制作は不可）
  if (body.status === "completed" && !isAdmin && !isRequester) {
    return NextResponse.json({ error: "案件を完了にできるのは依頼営業と管理者のみです" }, { status: 403 })
  }
  // 制作担当の割り当ては制作ロールとadminのみ（営業は不可）
  if (body.assigneeId !== undefined && !isAdmin && !isProduction) {
    return NextResponse.json({ error: "制作担当を変更できるのは制作担当者と管理者のみです" }, { status: 403 })
  }

  // 更新するフィールドだけを組み立てる
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = body.name
  if (body.type !== undefined) data.type = body.type
  if (body.priority !== undefined) data.priority = body.priority
  if (body.status !== undefined) data.status = body.status
  if (body.memo !== undefined) data.memo = body.memo || null
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
  if (body.publishedAt !== undefined) data.publishedAt = body.publishedAt ? new Date(body.publishedAt) : null
  if (body.stoppedAt !== undefined) data.stoppedAt = body.stoppedAt ? new Date(body.stoppedAt) : null
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId || null

  // 最終更新者を記録
  data.lastUpdatedById = session.user.id

  const task = await prisma.productionTask.update({
    where: { id },
    data,
    include: {
      company: { select: { id: true, name: true, companyId: true } },
      assignee: { select: { id: true, name: true } },
      requester: { select: { id: true, name: true } },
      lastUpdatedBy: { select: { id: true, name: true } },
    },
  })

  // ステータスが変わったら、自動でシステムコメントを残す
  if (body.status !== undefined && body.status !== existing.status) {
    const from = STATUS_LABELS[existing.status] ?? existing.status
    const to = STATUS_LABELS[body.status] ?? body.status
    await prisma.taskComment.create({
      data: {
        taskId: id,
        userId: session.user.id,
        body: "ステータスを「" + from + "」から「" + to + "」に変更しました",
        isSystem: true,
      },
    })
  }

  // 担当が変わったら、それも自動記録
  if (body.assigneeId !== undefined && (body.assigneeId || null) !== existing.assigneeId) {
    let msg = ""
    if (body.assigneeId) {
      const newAssignee = await prisma.user.findUnique({ where: { id: body.assigneeId }, select: { name: true } })
      msg = "制作担当を " + (newAssignee?.name ?? "不明") + " に設定しました"
    } else {
      msg = "制作担当を未割当に戻しました"
    }
    await prisma.taskComment.create({
      data: {
        taskId: id,
        userId: session.user.id,
        body: msg,
        isSystem: true,
      },
    })
  }

  return NextResponse.json(task)
}

// DELETE: 案件を削除（adminと依頼営業のみ。制作は不可）
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const existing = await prisma.productionTask.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const role = session.user.role
  const isAdmin = role !== "sales" && role !== "production"
  const isRequester = existing.requesterId === session.user.id
  if (!isAdmin && !isRequester) {
    return NextResponse.json({ error: "この案件を削除する権限がありません" }, { status: 403 })
  }

  await prisma.productionTask.delete({ where: { id } })
  return NextResponse.json({ success: true })
}