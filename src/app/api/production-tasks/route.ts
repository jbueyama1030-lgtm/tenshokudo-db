// 置き場所: src/app/api/production-tasks/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notifyChatwork, APP_URL, buildMentions, getProductionMembers } from "@/lib/chatwork"
import { canViewProduction, canCreateTask } from "@/lib/permissions"
import { CATEGORY_LABELS, CATEGORY_OPTIONS, PRIORITY_LABELS, TYPE_LABELS } from "@/lib/production"

const TASK_INCLUDE = {
  company: { select: { id: true, name: true, companyId: true } },
  assignee: { select: { id: true, name: true, chatworkAccountId: true } },
  subAssignees: { select: { id: true, name: true, chatworkAccountId: true } },
  requester: { select: { id: true, name: true, chatworkAccountId: true } },
  lastUpdatedBy: { select: { id: true, name: true } },
} as const

// GET: 案件一覧（?companyId=xxx で特定企業に絞り込み可能）
export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!canViewProduction(session)) {
    return NextResponse.json({ error: "制作案件の閲覧権限がありません" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get("companyId")

  const tasks = await prisma.productionTask.findMany({
    where: companyId ? { companyId } : {},
    include: TASK_INCLUDE,
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(tasks)
}

// POST: 新規案件を起票
// - 記事制作（category=article）は企業が必須。それ以外（社内タスク）は企業なしでも可
export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!canCreateTask(session)) {
    return NextResponse.json({ error: "制作依頼を起票する権限がありません" }, { status: 403 })
  }

  const body = await req.json()
  const category = CATEGORY_OPTIONS.some(o => o.value === body.category) ? body.category : "article"

  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "案件名は必須です" }, { status: 400 })
  }
  if (category === "article" && !body.companyId) {
    return NextResponse.json({ error: "記事制作は企業の選択が必須です" }, { status: 400 })
  }

  const subAssigneeIds: string[] = Array.isArray(body.subAssigneeIds) ? body.subAssigneeIds.filter(Boolean) : []

  const task = await prisma.productionTask.create({
    data: {
      companyId: body.companyId || null,
      category,
      name: String(body.name).trim(),
      type: category === "article" ? body.type || "new" : "other",
      priority: body.priority || "medium",
      status: "not_started",
      memo: body.memo || null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      requesterId: session.user.id,
      assigneeId: body.assigneeId || null,
      subAssignees: subAssigneeIds.length > 0 ? { connect: subAssigneeIds.map(id => ({ id })) } : undefined,
      lastUpdatedById: session.user.id,
      statusChangedAt: new Date(),
    },
    include: TASK_INCLUDE,
  })

  // ChatWork通知
  // - 記事制作: 制作メンバー全員にメンション（担当を取ってもらう）
  // - 社内タスク: 担当者（メイン・サブ）にメンション。起票者本人は除く
  const actorId = session.user.id
  const mentionTargets =
    category === "article" && !task.assignee
      ? await getProductionMembers()
      : [task.assignee, ...task.subAssignees].filter(u => u && u.id !== actorId)
  const mentions = buildMentions(mentionTargets)

  const assigneeNames = [task.assignee?.name, ...task.subAssignees.map(u => u.name)].filter(Boolean).join("・")
  const msg =
    mentions +
    "[info][title]📥 新しい" + (category === "article" ? "制作依頼" : "タスク") + "が来ました[/title]\n" +
    "案件: " + task.name + "\n" +
    "分類: " + (CATEGORY_LABELS[task.category] ?? task.category) +
    (category === "article" ? " / 種別: " + (TYPE_LABELS[task.type] ?? task.type) : "") +
    " / 優先度: " + (PRIORITY_LABELS[task.priority]?.label ?? task.priority) + "\n" +
    (task.company ? "企業: " + task.company.name + "\n" : "") +
    "担当: " + (assigneeNames || "未割当") + "\n" +
    "起票: " + (task.requester?.name ?? "-") + "\n" +
    "納期: " + (task.dueDate ? new Date(task.dueDate).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }) : "未設定") + "\n" +
    (task.memo ? "\n依頼内容:\n" + task.memo + "\n" : "") +
    "\n" + APP_URL + "/production/" + task.id +
    "[/info]"
  await notifyChatwork(msg)

  return NextResponse.json(task)
}
