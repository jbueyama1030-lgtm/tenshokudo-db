// 置き場所: src/app/api/production-tasks/[id]/comments/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notifyChatwork, APP_URL, buildMentions } from "@/lib/chatwork"
import { canViewProduction } from "@/lib/permissions"

// GET: 案件のコメント一覧（古い順＝タイムライン）
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!canViewProduction(session)) {
    return NextResponse.json({ error: "制作案件の閲覧権限がありません" }, { status: 403 })
  }

  const { id } = await params

  const comments = await prisma.taskComment.findMany({
    where: { taskId: id },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json(comments)
}

// POST: コメントを投稿（人が書いたコメント）
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!canViewProduction(session)) {
    return NextResponse.json({ error: "制作案件にコメントする権限がありません" }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()

  if (!body.body || !String(body.body).trim()) {
    return NextResponse.json({ error: "コメントを入力してください" }, { status: 400 })
  }

  const task = await prisma.productionTask.findUnique({
    where: { id },
    include: {
      company: { select: { name: true } },
      assignee: { select: { id: true, name: true, chatworkAccountId: true } },
      subAssignees: { select: { id: true, name: true, chatworkAccountId: true } },
      requester: { select: { id: true, name: true, chatworkAccountId: true } },
    },
  })
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const comment = await prisma.taskComment.create({
    data: { taskId: id, userId: session.user.id, body: String(body.body).trim(), isSystem: false },
    include: { user: { select: { id: true, name: true } } },
  })

  // 投稿者以外の関係者（担当・サブ担当・起票者）にメンション
  const targets = [task.assignee, ...task.subAssignees, task.requester].filter(u => u && u.id !== session.user.id)
  const assigneeNames = [task.assignee?.name, ...task.subAssignees.map(u => u.name)].filter(Boolean).join("・")

  await notifyChatwork(
    buildMentions(targets) +
    "[info][title]💬 コメントが投稿されました[/title]\n" +
    "案件: " + task.name + "\n" +
    (task.company ? "企業: " + task.company.name + "\n" : "") +
    "投稿者: " + (comment.user?.name ?? "-") + "\n" +
    "担当: " + (assigneeNames || "未割当") + " / 起票: " + (task.requester?.name ?? "-") + "\n" +
    "\n" + comment.body + "\n" +
    "\n" + APP_URL + "/production/" + task.id +
    "[/info]",
  )

  return NextResponse.json(comment)
}
