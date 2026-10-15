// 置き場所: src/app/api/production-tasks/[id]/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notifyChatwork, APP_URL, buildMentions } from "@/lib/chatwork"
import { canViewProduction, isAdmin, isProduction, isSales } from "@/lib/permissions"

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

  if (!canViewProduction(session)) {
    return NextResponse.json({ error: "制作案件の閲覧権限がありません" }, { status: 403 })
  }

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

  const admin = isAdmin(session)
  const production = isProduction(session)
  const sales = isSales(session)
  const isRequester = existing.requesterId === session.user.id

  // 編集できるのは 管理者 / 制作 / 依頼営業本人
  const canEdit = admin || production || (sales && isRequester)
  if (!canEdit) {
    return NextResponse.json({ error: "この案件を編集する権限がありません" }, { status: 403 })
  }

  if (body.status === "completed" && !admin && !isRequester) {
    return NextResponse.json({ error: "案件を完了にできるのは依頼営業と管理者のみです" }, { status: 403 })
  }

  if (body.assigneeId !== undefined && !admin && !production) {
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

  const newAssigneeId: string | null = body.assigneeId !== undefined ? (body.assigneeId || null) : existing.assigneeId
  const assigneeChanged = body.assigneeId !== undefined && newAssigneeId !== existing.assigneeId
  if (assigneeChanged) {
    const msg = task.assignee
      ? "制作担当を " + task.assignee.name + " に設定しました"
      : "制作担当を未割当に戻しました"
    await prisma.taskComment.create({
      data: {
        taskId: id,
        userId: session.user.id,
        body: msg,
        isSystem: true,
      },
    })
  }

  const link = APP_URL + "/production/" + task.id
  const commonInfo =
    "案件: " + task.name + "\n" +
    "企業: " + (task.company?.name ?? "-") + "\n" +
    "制作担当: " + (task.assignee?.name ?? "未割当") + "\n" +
    "依頼営業: " + (task.requester?.name ?? "-") + "\n"

  // ChatWork通知: 制作担当が決まった（未割当→担当あり、または担当の変更）
  // ・依頼営業 → 「担当が決まりました」
  // ・新しい担当者 → 他の人に割り当てられた場合のみ（自分で自分を設定したときは送らない）
  // ・操作した本人にはメンションしない
  if (assigneeChanged && task.assignee) {
    const actorId = session.user.id
    const targets = [
      task.requester && task.requester.id !== actorId ? task.requester : null,
      task.assignee.id !== actorId ? task.assignee : null,
    ]
    const mentions = buildMentions(targets)
    await notifyChatwork(
      mentions +
      "[info][title]👤 制作担当が決まりました[/title]\n" +
      commonInfo +
      "設定者: " + (task.lastUpdatedBy?.name ?? "-") + "\n" +
      "\n" + link +
      "[/info]"
    )
  }

  // ChatWork通知（ステータス変更のうち要アクションのときだけ）
  if (statusChanged) {
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

  const admin = isAdmin(session)
  const isRequester = existing.requesterId === session.user.id
  if (!admin && !isRequester) {
    return NextResponse.json({ error: "この案件を削除する権限がありません" }, { status: 403 })
  }

  await prisma.productionTask.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
