import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

const VALID_ROLES = ["sales", "production", "marketer", "advisor", "admin"]

function sanitizeRoles(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const filtered = input.filter(r => typeof r === "string" && VALID_ROLES.includes(r))
  return Array.from(new Set(filtered))
}

// roles の代表値を role に入れる（既存コードとの互換のため）
// admin を含むなら admin、次に production、それ以外は先頭 or sales
function primaryRole(roles: string[]): string {
  if (roles.includes("admin")) return "admin"
  if (roles.includes("production")) return "production"
  if (roles.includes("sales")) return "sales"
  return roles[0] ?? "sales"
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const users = await prisma.user.findMany({
    select: {
      id: true, name: true, email: true,
      role: true, roles: true, isActive: true,
      chatworkAccountId: true, createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json(users)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { name, email, password, chatworkAccountId } = body

  if (!name || !email || !password) {
    return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 })
  }

  const roles = sanitizeRoles(body.roles)
  if (roles.length === 0) {
    return NextResponse.json({ error: "ロールを1つ以上選択してください" }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: "このメールアドレスは既に登録されています" }, { status: 400 })
  }

  const hashedPassword = await bcrypt.hash(password, 12)

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: primaryRole(roles),
      roles,
      isActive: true,
      chatworkAccountId: chatworkAccountId || null,
    },
    select: {
      id: true, name: true, email: true,
      role: true, roles: true, isActive: true,
      chatworkAccountId: true, createdAt: true,
    },
  })

  return NextResponse.json(user)
}

// PATCH: 既存ユーザーの更新（ChatWorkID / ロール / 有効無効）
export async function PATCH(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { id } = body

  if (!id) {
    return NextResponse.json({ error: "ユーザーIDが必要です" }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) {
    return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 })
  }

  const data: Record<string, unknown> = {}
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key)

  // ChatWorkアカウントID
  if (has("chatworkAccountId")) {
    data.chatworkAccountId = body.chatworkAccountId || null
  }

  // ロール変更
  if (has("roles")) {
    // ガード：自分自身のロールは変更できない
    if (id === session.user.id) {
      return NextResponse.json({ error: "自分自身のロールは変更できません" }, { status: 400 })
    }
    const roles = sanitizeRoles(body.roles)
    if (roles.length === 0) {
      return NextResponse.json({ error: "ロールを1つ以上選択してください" }, { status: 400 })
    }
    // ガード：最後の有効な管理者から admin を外せない
    if (target.roles.includes("admin") && !roles.includes("admin")) {
      const adminCount = await prisma.user.count({
        where: { isActive: true, roles: { has: "admin" } },
      })
      if (adminCount <= 1) {
        return NextResponse.json({ error: "管理者が0人になるため変更できません" }, { status: 400 })
      }
    }
    data.roles = roles
    data.role = primaryRole(roles)
  }

  // 有効/無効の切替
  if (has("isActive")) {
    // ガード：自分自身は無効化できない
    if (id === session.user.id && body.isActive === false) {
      return NextResponse.json({ error: "自分自身を無効化することはできません" }, { status: 400 })
    }
    // ガード：最後の有効な管理者は無効化できない
    if (body.isActive === false && target.roles.includes("admin")) {
      const adminCount = await prisma.user.count({
        where: { isActive: true, roles: { has: "admin" } },
      })
      if (adminCount <= 1) {
        return NextResponse.json({ error: "管理者が0人になるため無効化できません" }, { status: 400 })
      }
    }
    data.isActive = Boolean(body.isActive)
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true, name: true, email: true,
      role: true, roles: true, isActive: true,
      chatworkAccountId: true, createdAt: true,
    },
  })

  return NextResponse.json(user)
}