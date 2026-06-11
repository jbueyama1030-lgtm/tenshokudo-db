import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const STATUS_LABELS: Record<string, string> = {
  contracted: "✅ 契約中",
  approaching: "📋 アプローチ中",
  delisted: "📉 掲載落ち",
}

const STATUS_COLORS: Record<string, string> = {
  contracted: "bg-green-100 text-green-800",
  approaching: "bg-blue-100 text-blue-800",
  delisted: "bg-gray-100 text-gray-600",
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; status?: string }>
}) {
  const session = await auth()
  if (!session) redirect("/login")

  const params = await searchParams
  const selectedUser = params.user ?? "all"
  const selectedStatus = params.status ?? "all"

  const users = await prisma.user.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  const companies = await prisma.company.findMany({
    where: {
      ...(selectedUser !== "all" ? { userId: selectedUser } : {}),
      ...(selectedStatus !== "all" ? { status: selectedStatus } : {}),
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  })

  const statusTabs = [
    { key: "all", label: "すべて" },
    { key: "contracted", label: "✅ 契約中" },
    { key: "approaching", label: "📋 アプローチ中" },
    { key: "delisted", label: "📉 掲載落ち" },
  ]

  return (
    <div className="flex h-screen bg-gray-50">
      {/* サイドバー */}
      <aside className="w-48 min-w-48 bg-[#0C1A2E] flex flex-col">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="text-sm font-semibold text-white">🚕 転職道</div>
          <div className="text-xs text-white/30 mt-0.5">営業DB</div>
        </div>
        <nav className="flex-1 py-4">
          <div className="px-5 pb-2 text-[10px] text-white/25 uppercase tracking-widest">メニュー</div>
          <a href="/dashboard" className="flex items-center gap-2.5 px-5 py-2 text-sm text-white/45 hover:text-white/75 hover:bg-white/5 border-l-2 border-transparent">
            📊 ダッシュボード
          </a>
          <a href="/companies" className="flex items-center gap-2.5 px-5 py-2 text-sm text-white border-l-2 border-[#378ADD] bg-[#378ADD]/10">
            🏢 企業一覧
          </a>
          <a href="/companies/new" className="flex items-center gap-2.5 px-5 py-2 text-sm text-white/45 hover:text-white/75 hover:bg-white/5 border-l-2 border-transparent">
            ➕ 企業追加
          </a>
        </nav>
        <div className="px-5 py-4 border-t border-white/10 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-[#185FA5] flex items-center justify-center text-xs text-white font-medium">
            {session.user?.name?.charAt(0)}
          </div>
          <div>
            <div className="text-xs text-white font-medium">{session.user?.name}</div>
            <a href="/api/auth/signout" className="text-[10px] text-white/30 hover:text-white/60">ログアウト</a>
          </div>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold text-gray-800">企業一覧</h1>
            <a href="/companies/new" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
              ＋ 企業追加
            </a>
          </div>

          {/* 担当者タブ */}
          <div className="flex gap-1 mb-4 border-b border-gray-200">
            
              href={`/companies?status=${selectedStatus}`}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                selectedUser === "all"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              全員
            </a>
            {users.map((user) => (
              
                key={user.id}
                href={`/companies?user=${user.id}&status=${selectedStatus}`}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  selectedUser === user.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {user.name}
              </a>
            ))}
          </div>

          {/* ステータスサブタブ */}
          <div className="flex gap-2 mb-5">
            {statusTabs.map((tab) => (
              
                key={tab.key}
                href={`/companies?${selectedUser !== "all" ? `user=${selectedUser}&` : ""}status=${tab.key}`}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  selectedStatus === tab.key
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-600 border border-gray-200 hover:border-blue-400"
                }`}
              >
                {tab.label}
              </a>
            ))}
          </div>

          {/* 企業テーブル */}
          {companies.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-400 text-lg mb-2">企業データがありません</p>
              <p className="text-gray-400 text-sm">条件を変更するか「企業追加」から登録してください</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">企業ID</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">会社名</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">ステータス</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">担当者</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">採用ペルソナ</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">応募数</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">入社数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {companies.map((company) => (
                    <tr key={company.id} className="hover:bg-gray-50 cursor-pointer">
                      <td className="px-4 py-3 text-sm text-gray-500">{company.companyId ?? "-"}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{company.name}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[company.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {STATUS_LABELS[company.status] ?? company.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{company.user.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{company.persona.join(", ") || "-"}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{company.applyCount}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{company.hireCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}