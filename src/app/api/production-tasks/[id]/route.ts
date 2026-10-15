// 置き場所: src/app/api/production-tasks/[id]/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notifyChatwork, APP_URL, buildMentions } from "@/lib/chatwork"
import { canViewProduction, isAdmin, isProduction, isSales } from "@/lib/permissions"
import { CATEGORY_OPTIONS, STATUS_LABELS, ALL_STATUSES } from "@/lib/production"

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
      subAssignees: { select: { id: true, name: true } },
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

  const existing = await prisma.productionTask.findUnique({
    where: { id },
    include: { subAssignees: { select: { id: true } } },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const admin = isAdmin(session)
  const production = isProduction(session)
  const sales = isSales(session)
  const me = session.user.id
  const isRequester = existing.requesterId === me
  const isAssignee = existing.assigneeId === me || existing.subAssignees.some(u => u.id === me)

  // 編集できるのは 管理者 / 制作 / 起票者本人 / 担当者
  const canEdit = admin || production || (sales && isRequester) || isRequester || isAssignee
  if (!canEdit) {
    return NextResponse.json({ error: "この案件を編集する権限がありません" }, { status: 403 })
  }

  // 完了にできる人: 記事制作は依頼営業と管理者。社内タスクは起票者・担当者・管理者
  if (body.status === "completed" && !admin) {
    const ok = existing.category === "article" ? isRequester : isRequester || isAssignee
    if (!ok) {
      return NextResponse.json(
        { error: existing.category === "article" ? "案件を完了にできるのは依頼営業と管理者のみです" : "完了にできるのは起票者・担当者・管理者のみです" },
        { status: 403 },
      )
    }
  }

  if ((body.assigneeId !== undefined || body.subAssigneeIds !== undefined) && !admin && !production && !isRequester) {
    return NextResponse.json({ error: "担当を変更できるのは制作担当者・起票者・管理者のみです" }, { status: 403 })
  }

  if (body.status !== undefined && !ALL_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "不正なステータスです" }, { status: 400 })
  }

  const nextCategory =
    body.category !== undefined && CATEGORY_OPTIONS.some(o => o.value === body.category) ? body.category : existing.category
  const nextCompanyId = body.companyId !== undefined ? body.companyId || null : existing.companyId
  if (nextCategory === "article" && !nextCompanyId) {
    return NextResponse.json({ error: "記事制作は企業の選択が必須です" }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = String(body.name).trim() || existing.name
  if (body.category !== undefined) data.category = nextCategory
  if (body.companyId !== undefined) data.companyId = nextCompanyId
  if (body.type !== undefined) data.type = nextCategory === "article" ? body.type : "other"
  if (body.priority !== undefined) data.priority = body.priority
  if (body.status !== undefined) data.status = body.status
  if (body.memo !== undefined) data.memo = body.memo || null
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
  if (body.publishedAt !== undefined) data.publishedAt = body.publishedAt ? new Date(body.publishedAt) : null
  if (body.stoppedAt !== undefined) data.stoppedAt = body.stoppedAt ? new Date(body.stoppedAt) : null
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId || null
  if (Array.isArray(body.subAssigneeIds)) {
    data.subAssignees = { set: body.subAssigneeIds.filter(Boolean).map((x: string) => ({ id: x })) }
  }

  const statusChanged = body.status !== undefined && body.status !== existing.status
  if (statusChanged) {
    data.statusChangedAt = new Date()
    // 公開にしたのに公開日が空なら今日を入れる（記事改善レポートの前後比較に使う）
    if (body.status === "published" && !existing.publishedAt && body.publishedAt === undefined) {
      data.publishedAt = new Date()
    }
  }

  data.lastUpdatedById = me

  const task = await prisma.productionTask.update({
    where: { id },
    data,
    include: {
      company: { select: { id: true, name: true, companyId: true } },
      assignee: { select: { id: true, name: true, chatworkAccountId: true } },
      subAssignees: { select: { id: true, name: true, chatworkAccountId: true } },
      requester: { select: { id: true, name: true, chatworkAccountId: true } },
      lastUpdatedBy: { select: { id: true, name: true } },
    },
  })

  if (statusChanged) {
    const from = STATUS_LABELS[existing.status]?.label ?? existing.status
    const to = STATUS_LABELS[body.status]?.label ?? body.status
    await prisma.taskComment.create({
      data: { taskId: id, userId: me, body: "ステータスを「" + from + "」から「" + to + "」に変更しました", isSystem: true },
    })
  }

  const newAssigneeId: string | null = body.assigneeId !== undefined ? body.assigneeId || null : existing.assigneeId
  const assigneeChanged = body.assigneeId !== undefined && newAssigneeId !== existing.assigneeId
  if (assigneeChanged) {
    const msg = task.assignee ? "担当を " + task.assignee.name + " に設定しました" : "担当を未割当に戻しました"
    await prisma.taskComment.create({ data: { taskId: id, userId: me, body: msg, isSystem: true } })
  }
  if (Array.isArray(body.subAssigneeIds)) {
    const before = existing.subAssignees.map(u => u.id).sort().join(",")
    const after = task.subAssignees.map(u => u.id).sort().join(",")
    if (before !== after) {
      const names = task.subAssignees.map(u => u.name).join("・")
      await prisma.taskComment.create({
        data: { taskId: id, userId: me, body: names ? "サブ担当を " + names + " にしました" : "サブ担当を外しました", isSystem: true },
      })
    }
  }

  const link = APP_URL + "/production/" + task.id
  const assigneeNames = [task.assignee?.name, ...task.subAssignees.map(u => u.name)].filter(Boolean).join("・")
  const commonInfo =
    "案件: " + task.name + "\n" +
    (task.company ? "企業: " + task.company.name + "\n" : "") +
    "担当: " + (assigneeNames || "未割当") + "\n" +
    "起票: " + (task.requester?.name ?? "-") + "\n"

  // 担当が決まった → 起票者と、他の人に割り当てられた担当者に通知（操作した本人は除く）
  if (assigneeChanged && task.assignee) {
    const targets = [
      task.requester && task.requester.id !== me ? task.requester : null,
      task.assignee.id !== me ? task.assignee : null,
    ]
    await notifyChatwork(
      buildMentions(targets) +
      "[info][title]👤 担当が決まりました[/title]\n" + commonInfo +
      "設定者: " + (task.lastUpdatedBy?.name ?? "-") + "\n\n" + link + "[/info]",
    )
  }

  if (statusChanged) {
    if (body.status === "sales_review") {
      await notifyChatwork(
        buildMentions([task.requester]) +
        "[info][title]🎨 営業確認をお願いします[/title]\n" + commonInfo +
        "\n制作物の確認をお願いします。\n" + link + "[/info]",
      )
    } else if (body.status === "submitted") {
      // 社内タスクの提出 → 起票者に確認依頼（本人が起票者なら送らない）
      const targets = [task.requester && task.requester.id !== me ? task.requester : null]
      await notifyChatwork(
        buildMentions(targets) +
        "[info][title]📤 提出されました[/title]\n" + commonInfo +
        "\n内容の確認をお願いします。\n" + link + "[/info]",
      )
    } else if (body.status === "completed") {
      const targets = [task.assignee, ...task.subAssignees].filter(u => u && u.id !== me)
      await notifyChatwork(
        buildMentions(targets) +
        "[info][title]✅ 完了しました[/title]\n" + commonInfo +
        "完了者: " + (task.lastUpdatedBy?.name ?? "-") + "\n\n" + link + "[/info]",
      )
    } else if (body.status === "client_review") {
      await notifyChatwork(
        "[info][title]🏢 企業確認フェーズに進みました[/title]\n" + commonInfo +
        "\n営業が企業へ確認中です。\n" + link + "[/info]",
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
