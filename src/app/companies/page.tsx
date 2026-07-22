import Sidebar from "@/components/Sidebar"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { PrismaClient } from "@prisma/client"
import { getRoles } from "@/lib/permissions"

const prisma = new PrismaClient()

const STATUS_LABELS: Record<string, string> = {
  contracted: "✅ 契約中",
  referral_only: "🤝 人材紹介のみ",
  approaching: "📋 アプローチ中",
  delisted: "📉 掲載落ち",
}

const STATUS_COLORS: Record<string, string> = {
  contracted: "bg-green-100 text-green-800",
  referral_only: "bg-emerald-100 text-emerald-800",
  approaching: "bg-blue-100 text-blue-800",
  delisted: "bg-gray-100 text-gray-600",
}

const TEMP_LABELS: Record<string, { label: string; cls: string }> = {
  hot: { label: "🔥 ホット", cls: "bg-red-100 text-red-800" },
  warm: { label: "☀️ ウォーム", cls: "bg-yellow-100 text-yellow-800" },
  cold: { label: "❄️ コールド", cls: "bg-blue-100 text-blue-800" },
}

// 紹介条件フィルタ（3択項目）: URLパラメータ名 → Companyのカラム名
const REFERRAL_COND_FILTERS = [
  { param: "foreign", field: "condForeign", label: "外国籍" },
  { param: "female", field: "condFemale", label: "女性" },
  { param: "tattoo", field: "condTattoo", label: "タトゥー" },
  { param: "accident", field: "condAccident", label: "事故・違反" },
  { param: "age64", field: "condAge64", label: "64歳未経験" },
]

// 働きやすい職場認証の表示（0=未取得, 1〜3=★の数）
function certLabel(level: number | null | undefined): string {
  const n = level ?? 0
  if (n <= 0) return "未取得"
  return "★".repeat(n)
}

// 3択フィルタの値を Prisma の in 条件に変換
// "ok" → ["ok"] / "ok_consult" → ["ok", "consult"] / それ以外 → null（絞り込まない）
function condValues(param: string | undefined): string[] | null {
  if (param === "ok") return ["ok"]
  if (param === "ok_consult") return ["ok", "consult"]
  return null
}

type SearchParams = {
  user?: string
  status?: string
  q?: string
  temp?: string
  referral?: string
  dorm?: string
  foreign?: string
  female?: string
  tattoo?: string
  accident?: string
  age64?: string
}

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth()
  if (!session) redirect("/login")

  const params = await searchParams

  const roles = getRoles(session)
  const isAdvisorOnly = roles.includes("advisor") && !roles.includes("sales") && !roles.includes("admin")

  // advisor専用モードでは担当者で絞らない（初期表示=全企業）
  const selectedUser = isAdvisorOnly
    ? "all"
    : (params.user === undefined ? session.user.id : params.user)
  const selectedStatus = params.status ?? "all"
  const searchQuery = params.q ?? ""
  const selectedTemp = params.temp ?? "all"

  // 紹介条件フィルタの選択状態
  const selectedReferral = params.referral === "1"
  const selectedDorm = params.dorm === "1"
  const condParams: Record<string, string> = {
    foreign: params.foreign ?? "",
    female: params.female ?? "",
    tattoo: params.tattoo ?? "",
    accident: params.accident ?? "",
    age64: params.age64 ?? "",
  }

  // 担当者タブ用ユーザー: roles に sales または admin を持つ人だけ。
  // advisor（キャリアアドバイザー）は企業担当を持たないのでタブから除外する。
  const candidateUsers = isAdvisorOnly ? [] : await prisma.user.findMany({
    where: {
      isActive: true,
      roles: { hasSome: ["sales", "admin"] },
    },
    select: { id: true, name: true, roles: true },
    orderBy: { name: "asc" },
  })

  const users = candidateUsers
    .filter((u) => u.roles.some((r) => r === "sales" || r === "admin"))
    .map((u) => ({ id: u.id, name: u.name }))

  // 紹介条件の where 句を組み立て
  const referralWhere: Record<string, unknown> = {}
  if (selectedReferral) referralWhere.hasReferralContract = true
  if (selectedDorm) referralWhere.condDorm = true
  REFERRAL_COND_FILTERS.forEach((f) => {
    const vals = condValues(condParams[f.param])
    if (vals) referralWhere[f.field] = { in: vals }
  })

  const companies = await prisma.company.findMany({
    where: {
      ...(selectedUser !== "all" ? { userId: selectedUser } : {}),
      ...(selectedStatus !== "all" ? { status: selectedStatus } : {}),
      ...(selectedTemp !== "all" ? { temperature: selectedTemp } : {}),
      ...referralWhere,
      ...(searchQuery ? {
        OR: [
          { name: { contains: searchQuery, mode: "insensitive" } },
          { companyId: { contains: searchQuery, mode: "insensitive" } },
          { address: { contains: searchQuery, mode: "insensitive" } },
        ]
      } : {}),
    },
    include: {
      user: { select: { id: true, name: true } },
      monthlyRecords: { select: { applyCount: true, hireCount: true } },
    },
    orderBy: { updatedAt: "desc" },
  })

  const statusTabs = [
    { key: "all", label: "すべて" },
    { key: "contracted", label: "✅ 契約中" },
    { key: "referral_only", label: "🤝 人材紹介のみ" },
    { key: "approaching", label: "📋 アプローチ中" },
    { key: "delisted", label: "📉 掲載落ち" },
  ]

  const tempTabs = [
    { key: "all", label: "すべて" },
    { key: "hot", label: "🔥 ホット" },
    { key: "warm", label: "☀️ ウォーム" },
    { key: "cold", label: "❄️ コールド" },
  ]

  // 現在の絞り込み状態を保ったままURLを組み立てる
  const buildUrl = (overrides: Record<string, string>) => {
    const p = new URLSearchParams()
    if (!isAdvisorOnly) p.set("user", selectedUser)
    if (selectedStatus !== "all") p.set("status", selectedStatus)
    if (searchQuery) p.set("q", searchQuery)
    if (selectedTemp !== "all") p.set("temp", selectedTemp)
    if (selectedReferral) p.set("referral", "1")
    if (selectedDorm) p.set("dorm", "1")
    Object.entries(condParams).forEach(([k, v]) => {
      if (v) p.set(k, v)
    })
    Object.entries(overrides).forEach(([k, v]) => {
      if (v === "all" || v === "") p.delete(k)
      else p.set(k, v)
    })
    if (!isAdvisorOnly && !p.has("user")) p.set("user", selectedUser)
    const str = p.toString()
    return "/companies" + (str ? "?" + str : "")
  }

  // 紹介条件フィルタが1つでも効いているか
  const hasReferralFilter =
    selectedReferral || selectedDorm || Object.values(condParams).some((v) => v !== "")

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={session.user?.name ?? ""} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold text-gray-800">
              {isAdvisorOnly ? "企業一覧（人材紹介）" : "企業一覧"}
            </h1>
            {!isAdvisorOnly && (
              <a href="/companies/new" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">＋ 企業追加</a>
            )}
          </div>

          {/* 検索バー */}
          <form method="GET" action="/companies" className="mb-4">
            {!isAdvisorOnly && selectedUser !== "all" && <input type="hidden" name="user" value={selectedUser} />}
            {selectedStatus !== "all" && <input type="hidden" name="status" value={selectedStatus} />}
            {selectedTemp !== "all" && <input type="hidden" name="temp" value={selectedTemp} />}
            {selectedReferral && <input type="hidden" name="referral" value="1" />}
            {selectedDorm && <input type="hidden" name="dorm" value="1" />}
            {Object.entries(condParams).map(([k, v]) => (
              v ? <input key={k} type="hidden" name={k} value={v} /> : null
            ))}
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

          {/* 担当者タブ（advisor専用モードでは非表示） */}
          {!isAdvisorOnly && (
            <div className="flex gap-1 mb-3 border-b border-gray-200 overflow-x-auto">
              <a href={buildUrl({ user: "all" })} className={"px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap " + (selectedUser === "all" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700")}>全員</a>
              {users.map((user) => (
                <a key={user.id} href={buildUrl({ user: user.id })} className={"px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap " + (selectedUser === user.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700")}>{user.name}</a>
              ))}
            </div>
          )}

          {/* 紹介条件フィルタ（advisor専用モードのみ表示） */}
          {isAdvisorOnly && (
            <div className="bg-white rounded-xl border border-emerald-200 p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-medium text-emerald-800">🤝 紹介条件で絞り込む</div>
                {hasReferralFilter && (
                  <a href={buildUrl({ referral: "", dorm: "", foreign: "", female: "", tattoo: "", accident: "", age64: "" })} className="text-xs text-gray-400 hover:text-gray-600">✕ 条件をクリア</a>
                )}
              </div>

              {/* 契約・環境（ON/OFF） */}
              <div className="flex gap-2 flex-wrap mb-4">
                <a href={buildUrl({ referral: selectedReferral ? "" : "1" })} className={"px-3 py-1.5 rounded-full text-xs font-medium transition-colors border " + (selectedReferral ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400")}>紹介契約あり</a>
                <a href={buildUrl({ dorm: selectedDorm ? "" : "1" })} className={"px-3 py-1.5 rounded-full text-xs font-medium transition-colors border " + (selectedDorm ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400")}>寮あり</a>
              </div>

              {/* 受け入れ可否（未指定 / 可能のみ / 可能＋要相談） */}
              <div className="grid grid-cols-5 gap-3">
                {REFERRAL_COND_FILTERS.map((f) => {
                  const cur = condParams[f.param]
                  return (
                    <div key={f.param}>
                      <div className="text-xs text-gray-500 mb-1.5">{f.label}</div>
                      <div className="flex flex-col gap-1">
                        <a href={buildUrl({ [f.param]: "" })} className={"px-2 py-1 rounded text-xs text-center transition-colors border " + (cur === "" ? "bg-gray-600 text-white border-gray-600" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400")}>指定なし</a>
                        <a href={buildUrl({ [f.param]: "ok" })} className={"px-2 py-1 rounded text-xs text-center transition-colors border " + (cur === "ok" ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-500 border-gray-200 hover:border-green-400")}>可能のみ</a>
                        <a href={buildUrl({ [f.param]: "ok_consult" })} className={"px-2 py-1 rounded text-xs text-center transition-colors border " + (cur === "ok_consult" ? "bg-yellow-500 text-white border-yellow-500" : "bg-white text-gray-500 border-gray-200 hover:border-yellow-400")}>＋要相談</a>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ステータス・温度感フィルター */}
          <div className="flex items-center gap-4 mb-5">
            <div className="flex gap-2 flex-wrap">
              {statusTabs.map((tab) => (
                <a key={tab.key} href={buildUrl({ status: tab.key })} className={"px-3 py-1.5 rounded-full text-xs font-medium transition-colors " + (selectedStatus === tab.key ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-blue-400")}>{tab.label}</a>
              ))}
            </div>
            {!isAdvisorOnly && (
              <>
                <div className="w-px h-5 bg-gray-200" />
                <div className="flex gap-2 flex-wrap">
                  {tempTabs.map((tab) => (
                    <a key={tab.key} href={buildUrl({ temp: tab.key })} className={"px-3 py-1.5 rounded-full text-xs font-medium transition-colors " + (selectedTemp === tab.key ? "bg-gray-700 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-gray-400")}>{tab.label}</a>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 件数表示 */}
          <div className="text-xs text-gray-400 mb-3">
            {companies.length}件表示
            {searchQuery && <span className="ml-2 text-blue-600">「{searchQuery}」の検索結果</span>}
            {hasReferralFilter && <span className="ml-2 text-emerald-600">紹介条件で絞り込み中</span>}
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
                    {isAdvisorOnly
                      ? <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">紹介契約</th>
                      : <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">温度感</th>}
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">認証</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">担当者</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">応募数</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">入社数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {companies.map((company) => {
                    const totalApply = company.monthlyRecords.reduce((sum, r) => sum + (r.applyCount ?? 0), 0)
                    const totalHire = company.monthlyRecords.reduce((sum, r) => sum + (r.hireCount ?? 0), 0)
                    return (
                    <tr key={company.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-500">{company.companyId ?? "-"}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        <a href={"/companies/" + company.id} className="hover:text-blue-600 hover:underline">{company.name}</a>
                      </td>
                      <td className="px-4 py-3">
                        <span className={"text-xs px-2 py-1 rounded-full font-medium " + (STATUS_COLORS[company.status] ?? "bg-gray-100 text-gray-600")}>{STATUS_LABELS[company.status] ?? company.status}</span>
                      </td>
                      {isAdvisorOnly ? (
                        <td className="px-4 py-3">
                          {company.hasReferralContract
                            ? <span className="text-xs px-2 py-1 rounded-full font-medium bg-emerald-100 text-emerald-800">あり</span>
                            : <span className="text-xs text-gray-300">なし</span>}
                        </td>
                      ) : (
                        <td className="px-4 py-3">
                          {company.temperature
                            ? <span className={"text-xs px-2 py-1 rounded-full font-medium " + (TEMP_LABELS[company.temperature]?.cls ?? "")}>{TEMP_LABELS[company.temperature]?.label}</span>
                            : <span className="text-xs text-gray-300">-</span>}
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {(company.workplaceCertLevel ?? 0) > 0
                          ? <span className="text-yellow-500">{certLabel(company.workplaceCertLevel)}</span>
                          : <span className="text-xs text-gray-300">未取得</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{company.user.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{totalApply}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{totalHire}</td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}