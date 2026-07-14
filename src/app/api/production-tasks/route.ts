import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import { notifyChatwork, APP_URL, buildMentions, getProductionMembers } from "@/lib/chatwork"

const prisma = new PrismaClient()

const TYPE_LABELS: Record<string, string> = { new: "新規", revise: "修正", renewal: "リニューアル" }
const PRIORITY_LABELS: Record<string, string> = { high: "高", medium: "中", low: "低" }

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
      lastUpdatedBy: { select: { id: true, name: true } },
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
      requesterId: session.user.id,
      assigneeId: null,
      lastUpdatedById: session.user.id,
    },
    include: {
      company: { select: { id: true, name: true, companyId: true } },
      assignee: { select: { id: true, name: true } },
      requester: { select: { id: true, name: true } },
      lastUpdatedBy: { select: { id: true, name: true } },
    },
  })

  // ChatWork通知（制作メンバー全員をメンション）
  const productionMembers = await getProductionMembers()
  const mentions = buildMentions(productionMembers)

  const msg =
    mentions +
    "[info][title]📥 新しい制作依頼が来ました[/title]\n" +
    "案件: " + task.name + "\n" +
    "企業: " + (task.company?.name ?? "-") + "\n" +
    "種別: " + (TYPE_LABELS[task.type] ?? task.type) + " / 優先度: " + (PRIORITY_LABELS[task.priority] ?? task.priority) + "\n" +
    "依頼営業: " + (task.requester?.name ?? "-") + "\n" +
    "納期: " + (task.dueDate ? new Date(task.dueDate).toLocaleDateString("ja-JP") : "未設定") + "\n" +
    (task.memo ? "\n依頼内容:\n" + task.memo + "\n" : "") +
    "\n" + APP_URL + "/production/" + task.id +
    "[/info]"
  await notifyChatwork(msg)

  return NextResponse.json(task)
}