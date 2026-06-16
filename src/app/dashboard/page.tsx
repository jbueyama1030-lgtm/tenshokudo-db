import Sidebar from "@/components/Sidebar"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

function fmt(n: number) {
  return n.toLocaleString("ja-JP")
}

function daysUntil(date: string | Date) {
  const diff = Math.ceil((new Date(date).getTime() - new Date().getTime()) / 86400000)
  return diff
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const now = new Date()
  const thisYear = now.getFullYear()
  const thisMonth = now.getMonth() + 1
  const lastMonth = thisMonth === 1 ? 12 : thisMonth - 1
  const lastMonthYear = thisMonth === 1 ? thisYear - 1 : thisYear

  const thisMonthStart = new Date(thisYear, thisMonth - 1, 1)
  const thisMonthEnd = new Date(thisYear, thisMonth, 0, 23, 59, 59)
  const thisYearStart = new Date(thisYear, 0, 1)

  const userId = session.user.id
  const userRole = session.user.role

  // 自分の担当企業
  const myCompanies = await prisma.company.findMany({
    where: { userId, status: "contracted" },
    select: { id: true, monthlyFee: true, discountRate: true, options: true, contractStart: true, contractRenewal: true, name: true, nextActionDate: true, nextAction: true },
  })

  // 自分の今月売上
  const myThisMonthRevenue = myCompanies.reduce((sum, c) => {
    const base = c.monthlyFee ?? 0
    const discount = base * ((c.discountRate ?? 0) / 100)
    return sum + base - discount
  }, 0)

  // 自分の新規獲得（今月）
  const myNewThisMonth = myCompanies.filter(c =>
    c.contractStart && new Date(c.contractStart) >= thisMonthStart && new Date(c.contractStart) <= thisMonthEnd
  ).length

  // 自分の新規獲得（今年）
  const myNewThisYear = myCompanies.filter(c =>
    c.contractStart && new Date(c.contractStart) >= thisYearStart
  ).length

  // 全体の契約中企業
  const allContracted = await prisma.company.findMany({
    where: { status: "contracted" },
    select: { id: true, monthlyFee: true, discountRate: true, contractStart: true, contractRenewal: true, name: true, nextActionDate: true, userId: true, user: { select: { name: true } } },
  })

  // 全体今月売上
  const allThisMonthRevenue = allContracted.reduce((sum, c) => {
    const base = c.monthlyFee ?? 0
    const discount = base * ((c.discountRate ?? 0) / 100)
    return sum + base - discount
  }, 0)

  // 全体前月売上
  const allLastMonthRevenue = allContracted.reduce((sum, c) => {
    const base = c.monthlyFee ?? 0
    const discount = base * ((c.discountRate ?? 0) / 100)
    return sum + base - discount
  }, 0)

  // 全体新規（今月）
  const allNewThisMonth = allContracted.filter(c =>
    c.contractStart && new Date(c.contractStart) >= thisMonthStart && new Date(c.contractStart) <= thisMonthEnd
  ).length

  // 総企業数
  const totalCompanies = await prisma.company.count()
  const totalContracted = allContracted.length
  const totalApproaching = await prisma.company.count({ where: { status: "approaching" } })

  // 契約更新アラート（60日以内）
  const alertDate = new Date()
  alertDate.setDate(alertDate.getDate() + 60)
  const renewalAlerts = allContracted
    .filter(c => c.contractRenewal && new Date(c.contractRenewal) <= alertDate)
    .sort((a, b) => new Date(a.contractRenewal!).getTime() - new Date(b.contractRenewal!).getTime())
    .slice(0, 10)

  // 次回アクション期限切れ
  const actionAlerts = await prisma.company.findMany({
    where: {
      nextActionDate: { lte: new Date() },
      status: { not: "delisted" },
      ...(userRole === "sales" ? { userId } : {}),
    },
    include: { user: { select: { name: true } } },
    orderBy: { nextActionDate: "asc" },
    take: 10,
  })

  // 直近1ヶ月の応募数ゼロアラート（契約中企業）
  const lastMonthRecords = await prisma.monthlyRecord.findMany({
    where: { year: lastMonthYear, month: lastMonth },
    select: { companyId: true, applyCount: true },
  })
  const lastMonthRecordMap: Record<string, number> = {}
  lastMonthRecords.forEach(r => { lastMonthRecordMap[r.companyId] = r.applyCount })

  const zeroApplyAlerts = allContracted
    .filter(c => {
      const count = lastMonthRecordMap[c.id]
      return count === undefined || count === 0
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ja"))
    .slice(0, 15)

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={session.user?.name ?? ""} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-xs text-gray-400 mb-1">営業状況</div>
              <h1 className="text-xl font-bold text-gray-800">ダッシュボード</h1>
            </div>
            <div className="text-sm text-gray-400">{thisYear}年{thisMonth}月{now.getDate()}日</div>
          </div>

          {/* 自分の数字 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <div className="text-xs text-gray-400 mb-3">自分の数字（{session.user?.name}）</div>
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-xs text-blue-500 mb-1">今月売上</div>
                <div className="text-2xl font-bold text-blue-700">¥{fmt(myThisMonthRevenue)}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-xs text-gray-400 mb-1">担当企業数</div>
                <div className="text-2xl font-bold text-gray-700">{myCompanies.length}<span className="text-sm font-normal ml-1">社</span></div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-xs text-green-500 mb-1">今月新規獲得</div>
                <div className="text-2xl font-bold text-green-700">{myNewThisMonth}<span className="text-sm font-normal ml-1">件</span></div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="text-xs text-purple-500 mb-1">今年新規獲得</div>
                <div className="text-2xl font-bold text-purple-700">{myNewThisYear}<span className="text-sm font-normal ml-1">件</span></div>
              </div>
            </div>
          </div>

          {/* 全体の数字 */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="text-xs text-blue-500 mb-1">全体今月売上</div>
              <div className="text-2xl font-bold text-gray-900">¥{fmt(allThisMonthRevenue)}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="text-xs text-gray-400 mb-1">全体前月売上</div>
              <div className="text-2xl font-bold text-gray-900">¥{fmt(allLastMonthRevenue)}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="text-xs text-green-500 mb-1">全体今月新規</div>
              <div className="text-2xl font-bold text-gray-900">{allNewThisMonth}<span className="text-sm font-normal ml-1">件</span></div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="text-xs text-gray-400 mb-1">総企業数</div>
              <div className="text-2xl font-bold text-gray-900">{totalCompanies}<span className="text-sm font-normal ml-1">社</span></div>
              <div className="text-xs text-gray-400 mt-1">契約中 {totalContracted} / アプローチ中 {totalApproaching}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* 契約更新アラート */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">🔔 契約更新アラート（60日以内）</h2>
              {renewalAlerts.length === 0 ? (
                <p className="text-sm text-gray-400">該当企業なし</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100">
                    <tr>
                      <th className="text-left pb-2 text-xs font-medium text-gray-400">会社名</th>
                      <th className="text-left pb-2 text-xs font-medium text-gray-400">担当</th>
                      <th className="text-right pb-2 text-xs font-medium text-gray-400">更新日</th>
                      <th className="text-right pb-2 text-xs font-medium text-gray-400">残り</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {renewalAlerts.map(c => {
                      const days = daysUntil(c.contractRenewal!)
                      return (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="py-2">
                            <a href={"/companies/" + c.id} className="text-blue-600 hover:underline text-xs font-medium">{c.name}</a>
                          </td>
                          <td className="py-2 text-xs text-gray-500">{c.user.name}</td>
                          <td className="py-2 text-right text-xs text-gray-500">{new Date(c.contractRenewal!).toLocaleDateString("ja-JP")}</td>
                          <td className="py-2 text-right">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${days < 0 ? "bg-red-100 text-red-700" : days <= 14 ? "bg-red-100 text-red-700" : days <= 30 ? "bg-orange-100 text-orange-700" : "bg-yellow-100 text-yellow-700"}`}>
                              {days < 0 ? `${Math.abs(days)}日経過` : `あと${days}日`}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* 次回アクション期限切れ */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">⚡ アクション期限切れ</h2>
              {actionAlerts.length === 0 ? (
                <p className="text-sm text-gray-400">期限切れのアクションなし</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100">
                    <tr>
                      <th className="text-left pb-2 text-xs font-medium text-gray-400">会社名</th>
                      <th className="text-left pb-2 text-xs font-medium text-gray-400">担当</th>
                      <th className="text-left pb-2 text-xs font-medium text-gray-400">アクション</th>
                      <th className="text-right pb-2 text-xs font-medium text-gray-400">期限</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {actionAlerts.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="py-2">
                          <a href={"/companies/" + c.id} className="text-blue-600 hover:underline text-xs font-medium">{c.name}</a>
                        </td>
                        <td className="py-2 text-xs text-gray-500">{c.user.name}</td>
                        <td className="py-2 text-xs text-gray-600">{c.nextAction ?? "-"}</td>
                        <td className="py-2 text-right">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                            {c.nextActionDate ? new Date(c.nextActionDate).toLocaleDateString("ja-JP") : "-"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* 応募数ゼロアラート */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              ⚠️ 応募数ゼロ企業（{lastMonthYear}年{lastMonth}月）
              <span className="ml-2 text-xs font-normal text-gray-400">{zeroApplyAlerts.length}社</span>
            </h2>
            {zeroApplyAlerts.length === 0 ? (
              <p className="text-sm text-gray-400">該当企業なし</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100">
                  <tr>
                    <th className="text-left pb-2 text-xs font-medium text-gray-400">会社名</th>
                    <th className="text-left pb-2 text-xs font-medium text-gray-400">担当</th>
                    <th className="text-right pb-2 text-xs font-medium text-gray-400">先月応募数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {zeroApplyAlerts.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="py-2">
                        <a href={"/companies/" + c.id} className="text-blue-600 hover:underline text-xs font-medium">{c.name}</a>
                      </td>
                      <td className="py-2 text-xs text-gray-500">{c.user.name}</td>
                      <td className="py-2 text-right">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                          {lastMonthRecordMap[c.id] !== undefined ? lastMonthRecordMap[c.id] + "件" : "データなし"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}