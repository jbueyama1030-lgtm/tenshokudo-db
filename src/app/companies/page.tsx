// 置き場所: src/app/companies/page.tsx
import Sidebar from "@/components/Sidebar"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getRoles } from "@/lib/permissions"
import { buildCompanyList, FOCUS_OPTIONS, type CompanyRow } from "@/lib/companyList"
import { LiveSearch, UserSelect } from "@/components/CompanyListControls"

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

const FLAG_COLORS: Record<string, string> = {
  red: "bg-red-100 text-red-700",
  yellow: "bg-amber-100 text-amber-800",
  gray: "bg-gray-100 text-gray-500",
}

// 紹介条件フィルタ（3択項目）: URLパラメータ名 → Companyのカラム名
const REFERRAL_COND_FILTERS = [
  { param: "foreign", field: "condForeign", label: "外国籍" },
  { param: "female", field: "condFemale", label: "女性" },
  { param: "tattoo", field: "condTattoo", label: "タトゥー" },
  { param: "accident", field: "condAccident", label: "事故・違反" },
  { param: "age64", field: "condAge64", label: "64歳未経験" },
]

// 3択フィルタの値を Prisma の in 条件に変換
function condValues(param: string | undefined): string[] | null {
  if (param === "ok") return ["ok"]
  if (param === "ok_consult") return ["ok", "consult"]
  return null
}

function md(iso: string): string {
  const j = new Date(new Date(iso).getTime() + 9 * 3600000)
  return `${j.getUTCMonth() + 1}/${j.getUTCDate()}`
}

type SearchParams = {
  user?: string
  status?: string
  q?: string
  focus?: string
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
  const myAgencyId = session.user.agencyId ?? null

  // 営業は最初から自分の担当だけ。advisor 専用モードは全企業
  const selectedUser = isAdvisorOnly ? "all" : params.user === undefined ? session.user.id : params.user
  const selectedStatus = params.status ?? "all"
  const searchQuery = params.q ?? ""
  const selectedFocus = params.focus ?? ""

  // 紹介条件（advisor 専用）
  const selectedReferral = params.referral === "1"
  const selectedDorm = params.dorm === "1"
  const condParams: Record<string, string> = {
    foreign: params.foreign ?? "",
    female: params.female ?? "",
    tattoo: params.tattoo ?? "",
    accident: params.accident ?? "",
    age64: params.age64 ?? "",
  }
  const referralWhere: Record<string, unknown> = {}
  if (selectedReferral) referralWhere.hasReferralContract = true
  if (selectedDorm) referralWhere.condDorm = true
  REFERRAL_COND_FILTERS.forEach(f => {
    const vals = condValues(condParams[f.param])
    if (vals) referralWhere[f.field] = { in: vals }
  })
  const hasReferralFilter = selectedReferral || selectedDorm || Object.values(condParams).some(v => v !== "")

  // 担当者の候補: 営業・管理者。代理店ユーザーには自代理店の人だけ
  const users = isAdvisorOnly
    ? []
    : (
        await prisma.user.findMany({
          where: {
            isActive: true,
            roles: { hasSome: ["sales", "admin"] },
            ...(myAgencyId ? { agencyId: myAgencyId } : {}),
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      )

  // 札の件数を出すため、focus なしで集計してから画面側で絞る
  const allRows = await buildCompanyList(session, {
    user: selectedUser,
    status: selectedStatus,
    q: searchQuery,
    focus: "",
    extraWhere: isAdvisorOnly ? referralWhere : undefined,
  })
  const countFor = (key: string) =>
    key === "attention"
      ? allRows.filter(r => r.flags.some(f => f.level !== "gray")).length
      : allRows.filter(r => r.flags.some(f => f.key === key)).length
  const rows: CompanyRow[] = !selectedFocus
    ? allRows
    : selectedFocus === "attention"
      ? allRows.filter(r => r.flags.some(f => f.level !== "gray"))
      : allRows.filter(r => r.flags.some(f => f.key === selectedFocus))

  // 現在の絞り込み状態を保ったままURLを組み立てる
  const buildUrl = (overrides: Record<string, string>, base = "/companies") => {
    const p = new URLSearchParams()
    if (!isAdvisorOnly) p.set("user", selectedUser)
    if (selectedStatus !== "all") p.set("status", selectedStatus)
    if (searchQuery) p.set("q", searchQuery)
    if (selectedFocus) p.set("focus", selectedFocus)
    if (selectedReferral) p.set("referral", "1")
    if (selectedDorm) p.set("dorm", "1")
    Object.entries(condParams).forEach(([k, v]) => { if (v) p.set(k, v) })
    Object.entries(overrides).forEach(([k, v]) => {
      if (k !== "user" && (v === "all" || v === "")) p.delete(k)
      else p.set(k, v)
    })
    const str = p.toString()
    return base + (str ? "?" + str : "")
  }

  const userHref: Record<string, string> = { all: buildUrl({ user: "all" }) }
  users.forEach(u => { userHref[u.id] = buildUrl({ user: u.id }) })

  const statusTabs = [
    { key: "all", label: "すべて" },
    { key: "contracted", label: "✅ 契約中" },
    { key: "referral_only", label: "🤝 人材紹介のみ" },
    { key: "approaching", label: "📋 アプローチ中" },
    { key: "delisted", label: "📉 掲載落ち" },
  ]

  const showUserColumn = selectedUser === "all"
  const isMine = selectedUser === session.user.id

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={session.user?.name ?? ""} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6">
          <div className="flex items-center gap-3 mb-5">
            <h1 className="text-xl font-bold text-gray-800">
              {isAdvisorOnly ? "企業一覧（人材紹介）" : isMine ? "自分の担当企業" : "企業一覧"}
            </h1>
            <div className="flex-1" />
            <a href={buildUrl({}, "/api/companies/export")} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 bg-white hover:bg-gray-50">
              ⬇ CSV
            </a>
            {!isAdvisorOnly && (
              <a href="/companies/new" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">＋ 企業追加</a>
            )}
          </div>

          {/* 担当者・検索 */}
          <div className="flex gap-2 mb-4">
            {!isAdvisorOnly && <UserSelect users={users} selected={selectedUser} hrefFor={userHref} />}
            <LiveSearch initial={searchQuery} baseHref={buildUrl({ q: "" })} />
          </div>

          {/* 今日やること（advisor 専用モード以外） */}
          {!isAdvisorOnly && (
            <div className="flex gap-2 flex-wrap mb-3">
              <a href={buildUrl({ focus: "" })} className={"px-3 py-1.5 rounded-full text-xs font-medium border " + (!selectedFocus ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400")}>
                すべて <span className="opacity-70">{allRows.length}</span>
              </a>
              {FOCUS_OPTIONS.map(f => {
                const n = countFor(f.key)
                const on = selectedFocus === f.key
                return (
                  <a key={f.key} href={buildUrl({ focus: f.key })}
                    className={"px-3 py-1.5 rounded-full text-xs font-medium border " + (on ? "bg-red-600 text-white border-red-600" : n > 0 ? "bg-white text-red-700 border-red-200 hover:border-red-400" : "bg-white text-gray-400 border-gray-200")}>
                    {f.label} <span className="opacity-70">{n}</span>
                  </a>
                )
              })}
            </div>
          )}

          {/* ステータス */}
          <div className="flex gap-2 flex-wrap mb-5">
            {statusTabs.map(tab => (
              <a key={tab.key} href={buildUrl({ status: tab.key })} className={"px-3 py-1.5 rounded-full text-xs font-medium transition-colors " + (selectedStatus === tab.key ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-blue-400")}>{tab.label}</a>
            ))}
          </div>

          {/* 紹介条件フィルタ（advisor 専用モードのみ） */}
          {isAdvisorOnly && (
            <div className="bg-white rounded-xl border border-emerald-200 p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-medium text-emerald-800">🤝 紹介条件で絞り込む</div>
                {hasReferralFilter && (
                  <a href={buildUrl({ referral: "", dorm: "", foreign: "", female: "", tattoo: "", accident: "", age64: "" })} className="text-xs text-gray-400 hover:text-gray-600">✕ 条件をクリア</a>
                )}
              </div>
              <div className="flex gap-2 flex-wrap mb-4">
                <a href={buildUrl({ referral: selectedReferral ? "" : "1" })} className={"px-3 py-1.5 rounded-full text-xs font-medium border " + (selectedReferral ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400")}>紹介契約あり</a>
                <a href={buildUrl({ dorm: selectedDorm ? "" : "1" })} className={"px-3 py-1.5 rounded-full text-xs font-medium border " + (selectedDorm ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400")}>寮あり</a>
              </div>
              <div className="grid grid-cols-5 gap-3">
                {REFERRAL_COND_FILTERS.map(f => {
                  const cur = condParams[f.param]
                  return (
                    <div key={f.param}>
                      <div className="text-xs text-gray-500 mb-1.5">{f.label}</div>
                      <div className="flex flex-col gap-1">
                        <a href={buildUrl({ [f.param]: "" })} className={"px-2 py-1 rounded text-xs text-center border " + (cur === "" ? "bg-gray-600 text-white border-gray-600" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400")}>指定なし</a>
                        <a href={buildUrl({ [f.param]: "ok" })} className={"px-2 py-1 rounded text-xs text-center border " + (cur === "ok" ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-500 border-gray-200 hover:border-green-400")}>可能のみ</a>
                        <a href={buildUrl({ [f.param]: "ok_consult" })} className={"px-2 py-1 rounded text-xs text-center border " + (cur === "ok_consult" ? "bg-yellow-500 text-white border-yellow-500" : "bg-white text-gray-500 border-gray-200 hover:border-yellow-400")}>＋要相談</a>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="text-xs text-gray-400 mb-3">
            {rows.length}件表示
            {!isAdvisorOnly && <span className="ml-2">（対応が必要な企業ほど上に並んでいます）</span>}
            {searchQuery && <span className="ml-2 text-blue-600">「{searchQuery}」の検索結果</span>}
          </div>

          {rows.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-400 text-lg mb-2">{selectedFocus ? "該当する企業はありません 🎉" : "企業データがありません"}</p>
              <p className="text-gray-400 text-sm">条件を変更するか「企業追加」から登録してください</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">会社名</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">ステータス</th>
                    {isAdvisorOnly ? (
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">紹介契約</th>
                    ) : (
                      <>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">直近3か月<br />応募 / 入社</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">次回アクション</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">要対応</th>
                      </>
                    )}
                    {(showUserColumn || isAdvisorOnly) && <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">担当者</th>}
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(r => (
                    <tr key={r.id} className="group hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <a href={"/companies/" + r.id} className="text-sm font-medium text-gray-900 hover:text-blue-600 hover:underline">{r.name}</a>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {r.companyId ? "ID " + r.companyId : "ID未登録"}
                          {r.prefecture !== "不明" && <span className="ml-2">{r.prefecture}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={"text-xs px-2 py-1 rounded-full font-medium " + (STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600")}>{STATUS_LABELS[r.status] ?? r.status}</span>
                      </td>
                      {isAdvisorOnly ? (
                        <td className="px-4 py-3">
                          {r.hasReferralContract
                            ? <span className="text-xs px-2 py-1 rounded-full font-medium bg-emerald-100 text-emerald-800">あり</span>
                            : <span className="text-xs text-gray-300">なし</span>}
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-sm text-right tabular-nums whitespace-nowrap">
                            <span className={r.apply3m > 0 ? "text-gray-900" : "text-gray-300"}>{r.apply3m}</span>
                            <span className="text-gray-300 mx-1">/</span>
                            <span className={r.hire3m > 0 ? "text-green-700 font-bold" : "text-gray-300"}>{r.hire3m}</span>
                          </td>
                          <td className="px-4 py-3 text-sm max-w-[14rem]">
                            {r.nextActionDate || r.nextAction ? (
                              <>
                                {r.nextActionDate && <span className="text-xs text-gray-500 mr-1.5">{md(r.nextActionDate)}</span>}
                                <span className="text-gray-700">{r.nextAction ?? ""}</span>
                              </>
                            ) : <span className="text-xs text-gray-300">未設定</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {r.flags.map(f => (
                                <span key={f.key} className={"text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap " + FLAG_COLORS[f.level]}>{f.label}</span>
                              ))}
                            </div>
                          </td>
                        </>
                      )}
                      {(showUserColumn || isAdvisorOnly) && <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{r.userName}</td>}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <a href={"/companies/" + r.id + "/report"} className="text-xs text-blue-600 hover:underline mr-3">レポート</a>
                          <a href={"/companies/" + r.id} className="text-xs text-blue-600 hover:underline">詳細 →</a>
                        </span>
                      </td>
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
