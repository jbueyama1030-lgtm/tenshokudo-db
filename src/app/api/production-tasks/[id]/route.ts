import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import { notifyChatwork, APP_URL, buildMentions } from "@/lib/chatwork"

const prisma = new PrismaClient()

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

  const canEdit = isAdmin || isProduction || (isSales && isRequester)
  if (!canEdit) {
    return NextResponse.json({ error: "この案件を編集する権限がありません" }, { status: 403 })
  }

  if (body.status === "completed" && !isAdmin && !isRequester) {
    return NextResponse.json({ error: "案件を完了にできるのは依頼営業と管理者のみです" }, { status: 403 })
  }

  if (body.assigneeId !== undefined && !isAdmin && !isProduction) {
    return NextResponse.json({ error: "制作担当を変更できるのは制作担当者と管理者のみです" }, { status: 403 })
  }

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

  data.lastUpdatedById = session.user.id

  const task = await prisma.productionTask.update({
    where: { id },
    data,
    include: {
      company: { select: { id: true, name: true, companyId: true } },
      assignee: { select: { id: true, name: true, chatworkAccountId: true } },
      requester: { select: { id: true, name: true, chatworkAccountId: true } },
      lastUpdatedBy: { select: { id: true, name: true } },
    },
  })

  const statusChanged = body.status !== undefined && body.status !== existing.status
  if (statusChanged) {
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

  // ChatWork通知（要アクションのときだけ）
  if (statusChanged) {
    const link = APP_URL + "/production/" + task.id
    const commonInfo =
      "案件: " + task.name + "\n" +
      "企業: " + (task.company?.name ?? "-") + "\n" +
      "制作担当: " + (task.assignee?.name ?? "未割当") + "\n" +
      "依頼営業: " + (task.requester?.name ?? "-") + "\n"

    if (body.status === "sales_review") {
      // 営業確認中 → 依頼営業にメンション
      const mentions = buildMentions([task.requester])
      await notifyChatwork(
        mentions +
        "[info][title]🎨 営業確認をお願いします[/title]\n" +
        commonInfo +
        "\n制作物の確認をお願いします。\n" +
        link +
        "[/info]"
      )
    } else if (body.status === "completed") {
      // 完了 → 制作担当にメンション
      const mentions = buildMentions([task.assignee])
      await notifyChatwork(
        mentions +
        "[info][title]✅ 案件が完了しました[/title]\n" +
        commonInfo +
        "完了者: " + (task.lastUpdatedBy?.name ?? "-") + "\n" +
        "\n" + link +
        "[/info]"
      )
    } else if (body.status === "client_review") {
      // 企業確認中 → メンションなし（営業自身が変更したはずなので）
      await notifyChatwork(
        "[info][title]🏢 企業確認フェーズに進みました[/title]\n" +
        commonInfo +
        "\n営業が企業へ確認中です。\n" +
        link +
        "[/info]"
      )
    }
  }

  return NextResponse.json(task)
}

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