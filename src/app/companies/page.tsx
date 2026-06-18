import Sidebar from "@/components/Sidebar"
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

const TEMP_LABELS: Record<string, { label: string; cls: string }> = {
  hot: { label: "🔥 ホット", cls: "bg-red-100 text-red-800" },
  warm: { label: "☀️ ウォーム", cls: "bg-yellow-100 text-yellow-800" },
  cold: { label: "❄️ コールド", cls: "bg-blue-100 text-blue-800" },
}

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ user?: string; status?: string; q?: string; temp?: string }> }) {
  const session = await auth()
  if (!session) redirect("/login")

  const params = await searchParams

  // デフォルト（パラメータ無し）は自分。user=all のときは全員
  const selectedUser = params.user === undefined ? session.user.id : params.user
  const selectedStatus = params.status ?? "all"
  const searchQuery = params.q ?? ""
  const selectedTemp = params.temp ?? "all"

  const users = await prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })

  const companies = await prisma.company.findMany({
    where: {
      ...(selectedUser !== "all" ? { userId: selectedUser } : {}),
      ...(selectedStatus !== "all" ? { status: selectedStatus } : {}),
      ...(selectedTemp !== "all" ? { temperature: selectedTemp } : {}),
      ...(searchQuery ? {
        OR: [
          { name: { contains: searchQuery, mode: "insensitive" } },
          { companyId: { contains: searchQuery, mode: "insensitive" } },
          { address: { contains: searchQuery, mode: "insensitive" } },
        ]
      } : {}),
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

  const tempTabs = [
    { key: "all", label: "すべて" },
    { key: "hot", label: "🔥 ホット" },
    { key: "warm", label: "☀️ ウォーム" },
    { key: "cold", label: "❄️ コールド" },
  ]

  const buildUrl = (overrides: Record<string, string>) => {
    const p = new URLSearchParams()
    p.set("user", selectedUser)
    if (selectedStatus !== "all") p.set("status", selectedStatus)
    if (searchQuery) p.set("q", searchQuery)
    if (selectedTemp !== "all") p.set("temp", selectedTemp)
    Object.entries(overrides).forEach(([k, v]) => {
      if (k !== "user" && (v === "all" || v === "")) p.delete(k)
      else p.set(k, v)
    })
    const str = p.toString()
    return "/companies" + (str ? "?" + str : "")
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={session.user?.name ?? ""} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold text-gray-800">企業一覧</h1>
            <a href="/companies/new" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">＋ 企業追加</a>
          </div>

          {/* 検索バー */}
          <form method="GET" action="/companies" className="mb-4">
            {selectedUser !== "all" && <input type="hidden" name="user" value={selectedUser} />}
            {selectedStatus !== "all" && <input type="hidden" name="status" value={selectedStatus} />}
            {selectedTemp !== "all" && <input type="hidden" name="temp" value={selectedTemp} />}
            <div className="flex gap-2">
              <input
                type="text"
                name="q"
                defaultValue={searchQuery}
                placeholder="会社名・企業ID・住所で検索..."
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">🔍 検索</button>
              {searchQuery && (
                <a href={buildUrl({ q: "" })} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">✕ クリア</a>
              )}
            </div>
          </form>

          {/* 担当者タブ */}
          <div className="flex gap-1 mb-3 border-b border-gray-200 overflow-x-auto">
            <a href={buildUrl({ user: "all" })} className={"px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap " + (selectedUser === "all" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700")}>全員</a>
            {users.map((user) => (
              <a key={user.id} href={buildUrl({ user: user.id })} className={"px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap " + (selectedUser === user.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700")}>{user.name}</a>
            ))}
          </div>

          {/* ステータス・温度感フィルター */}
          <div className="flex items-center gap-4 mb-5">
            <div className="flex gap-2 flex-wrap">
              {statusTabs.map((tab) => (
                <a key={tab.key} href={buildUrl({ status: tab.key })} className={"px-3 py-1.5 rounded-full text-xs font-medium transition-colors " + (selectedStatus === tab.key ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-blue-400")}>{tab.label}</a>
              ))}
            </div>
            <div className="w-px h-5 bg-gray-200" />
            <div className="flex gap-2 flex-wrap">
              {tempTabs.map((tab) => (
                <a key={tab.key} href={buildUrl({ temp: tab.key })} className={"px-3 py-1.5 rounded-full text-xs font-medium transition-colors " + (selectedTemp === tab.key ? "bg-gray-700 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-gray-400")}>{tab.label}</a>
              ))}
            </div>
          </div>

          {/* 件数表示 */}
          <div className="text-xs text-gray-400 mb-3">
            {companies.length}件表示
            {searchQuery && <span className="ml-2 text-blue-600">「{searchQuery}」の検索結果</span>}
          </div>

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
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">温度感</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">担当者</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">応募数</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">入社数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {companies.map((company) => (
                    <tr key={company.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-500">{company.companyId ?? "-"}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        <a href={"/companies/" + company.id} className="hover:text-blue-600 hover:underline">{company.name}</a>
                      </td>
                      <td className="px-4 py-3">
                        <span className={"text-xs px-2 py-1 rounded-full font-medium " + (STATUS_COLORS[company.status] ?? "bg-gray-100 text-gray-600")}>{STATUS_LABELS[company.status] ?? company.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        {company.temperature
                          ? <span className={"text-xs px-2 py-1 rounded-full font-medium " + (TEMP_LABELS[company.temperature]?.cls ?? "")}>{TEMP_LABELS[company.temperature]?.label}</span>
                          : <span className="text-xs text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{company.user.name}</td>
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