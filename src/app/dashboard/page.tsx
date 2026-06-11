import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function DashboardPage() {
  const session = await auth()
  
  if (!session) {
    redirect("/login")
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">転職道 営業DB</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{session.user?.name}</span>
            
              href="/api/auth/signout"
              className="text-sm text-red-600 hover:text-red-700"
            >
              ログアウト
            </a>
          </div>
        </div>
      </header>

      <main className="p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">ダッシュボード</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">総企業数</p>
            <p className="text-3xl font-bold text-gray-900">-</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">契約中</p>
            <p className="text-3xl font-bold text-green-600">-</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">アプローチ中</p>
            <p className="text-3xl font-bold text-blue-600">-</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">企業一覧</h3>
          <p className="text-gray-500">企業データがまだありません</p>
        </div>
      </main>
    </div>
  )
}