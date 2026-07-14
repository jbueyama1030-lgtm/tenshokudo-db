import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import { notifyChatwork, APP_URL } from "@/lib/chatwork"

const prisma = new PrismaClient()

// GET: 案件のコメント一覧（古い順＝タイムライン）
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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

  const { id } = await params
  const body = await req.json()

  if (!body.body || !body.body.trim()) {
    return NextResponse.json({ error: "コメントを入力してください" }, { status: 400 })
  }

  const task = await prisma.productionTask.findUnique({
    where: { id },
    include: {
      company: { select: { name: true } },
      assignee: { select: { name: true } },
      requester: { select: { name: true } },
    },
  })
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const comment = await prisma.taskComment.create({
    data: {
      taskId: id,
      userId: session.user.id,
      body: body.body.trim(),
      isSystem: false,
    },
    include: { user: { select: { id: true, name: true } } },
  })

  // ChatWork通知（やり取りが発生した＝相手のアクションが必要）
  await notifyChatwork(
    "[info][title]💬 コメントが投稿されました[/title]\n" +
    "案件: " + task.name + "\n" +
    "企業: " + (task.company?.name ?? "-") + "\n" +
    "投稿者: " + (comment.user?.name ?? "-") + "\n" +
    "制作担当: " + (task.assignee?.name ?? "未割当") + " / 依頼営業: " + (task.requester?.name ?? "-") + "\n" +
    "\n" + comment.body + "\n" +
    "\n" + APP_URL + "/production/" + task.id +
    "[/info]"
  )

  return NextResponse.json(comment)
}