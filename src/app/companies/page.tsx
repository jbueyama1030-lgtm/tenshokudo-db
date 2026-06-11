import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const STATUS_TABS = [
  { key: "all", label: "すべて" },
  { key: "contracted", label: "✅ 契約中" },
  { key: "approaching", label: "📋 アプローチ中" },
  { key: "delisted", label: "📉 掲載落ち" },
]

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

export default async function CompaniesPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const companies = await prisma.company.findMany({
    include: { user: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">転職道 営業DB</h1>
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">ダッシュボード</a>
            <span className="text-sm text-gray-600">{session.user?.name}</span>
            <a href="/api/auth/signout" className="text-sm text-red-600 hover:text-red-700">ログアウト</a>
          </div>
        </div>
      </header>

      <main className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">企業一覧</h2>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            ＋ 企業追加
          </button>
        </div>

        {companies.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <p className="text-gray-400 text-lg mb-2">企業データがまだありません</p>
            <p className="text-gray-400 text-sm">「企業追加」ボタンから登録してください</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
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
                  <tr key={company.id} className="hover:bg-gray-50">
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
      </main>
    </div>
  )
}