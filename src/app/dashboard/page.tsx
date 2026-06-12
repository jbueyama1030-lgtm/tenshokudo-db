import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { PrismaClient } from "@prisma/client"
import Sidebar from "@/components/Sidebar"

const prisma = new PrismaClient()

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const [total, contracted, approaching, delisted] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { status: "contracted" } }),
    prisma.company.count({ where: { status: "approaching" } }),
    prisma.company.count({ where: { status: "delisted" } }),
  ])

  return (
    <div className="flex h-screen bg-gray-50">
      {/* サイドバー */}
    <Sidebar userName={session.user?.name ?? ""} />

      {/* メインコンテンツ */}
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6">
          <h1 className="text-xl font-bold text-gray-800 mb-6">ダッシュボード</h1>

          {/* KPIカード */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="text-xs text-gray-400 mb-1">総企業数</div>
              <div className="text-3xl font-bold text-gray-900">{total}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="text-xs text-gray-400 mb-1">✅ 契約中</div>
              <div className="text-3xl font-bold text-green-600">{contracted}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="text-xs text-gray-400 mb-1">📋 アプローチ中</div>
              <div className="text-3xl font-bold text-blue-600">{approaching}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="text-xs text-gray-400 mb-1">📉 掲載落ち</div>
              <div className="text-3xl font-bold text-gray-400">{delisted}</div>
            </div>
          </div>

          {/* 企業一覧へのリンク */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">企業一覧</h2>
              <a href="/companies" className="text-xs text-blue-600 hover:text-blue-700">すべて見る →</a>
            </div>
            <p className="text-sm text-gray-400">企業一覧ページで詳細を確認できます</p>
          </div>
        </div>
      </main>
    </div>
  )
}