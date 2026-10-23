// 置き場所: src/app/companies/page.tsx
import Sidebar from "@/components/Sidebar"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getRoles } from "@/lib/permissions"
import { buildCompanyList } from "@/lib/companyList"
import { UserSelect } from "@/components/CompanyListControls"
import CompanyListView from "@/components/CompanyListView"

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

type SearchParams = {
  user?: string
  referral?: string
  dorm?: string
  foreign?: string
  female?: string
  tattoo?: string
  accident?: string
  age64?: string
}

/**
 * 企業一覧（営業のやることリスト）。
 * 担当者の切り替えと人材紹介の条件だけサーバー側で絞り、
 * 検索・ステータス・要対応の絞り込み・並び替えは画面側（CompanyListView）で行う。
 */
export default async function CompaniesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth()
  if (!session) redirect("/login")

  const params = await searchParams
  const roles = getRoles(session)
  const isAdvisorOnly = roles.includes("advisor") && !roles.includes("sales") && !roles.includes("admin")
  const canCreate = roles.includes("sales") || roles.includes("admin")
  const myAgencyId = session.user.agencyId ?? null

  // 営業は最初から自分の担当だけ。advisor 専用モードは全企業
  const selectedUser = isAdvisorOnly ? "all" : params.user === undefined ? session.user.id : params.user

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
    : await prisma.user.findMany({
        where: {
          isActive: true,
          roles: { hasSome: ["sales", "admin"] },
          ...(myAgencyId ? { agencyId: myAgencyId } : {}),
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })

  const rows = await buildCompanyList(session, {
    user: selectedUser,
    status: "all",
    q: "",
    focus: "",
    extraWhere: isAdvisorOnly ? referralWhere : undefined,
    // 法人グループ・タグは社内向け（代理店ユーザーには出さない）
    withGroups: !myAgencyId,
  })

  // URL（担当者・紹介条件）を組み立てる
  const buildUrl = (overrides: Record<string, string>) => {
    const p = new URLSearchParams()
    if (!isAdvisorOnly) p.set("user", selectedUser)
    if (selectedReferral) p.set("referral", "1")
    if (selectedDorm) p.set("dorm", "1")
    Object.entries(condParams).forEach(([k, v]) => { if (v) p.set(k, v) })
    Object.entries(overrides).forEach(([k, v]) => {
      if (k !== "user" && v === "") p.delete(k)
      else p.set(k, v)
    })
    const str = p.toString()
    return "/companies" + (str ? "?" + str : "")
  }
  const userHref: Record<string, string> = { all: buildUrl({ user: "all" }) }
  users.forEach(u => { userHref[u.id] = buildUrl({ user: u.id }) })

  const selectedName = users.find(u => u.id === selectedUser)?.name
  const title = isAdvisorOnly
    ? "企業一覧（人材紹介）"
    : selectedUser === session.user.id
      ? "自分の担当企業"
      : selectedUser === "all"
        ? "企業一覧"
        : (selectedName ?? "") + "さんの担当企業"

  const advisorFilters = isAdvisorOnly ? (
    <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-4 mb-4">
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
  ) : null

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={session.user?.name ?? ""} />
      <main className="flex-1 overflow-auto">
        <CompanyListView
          rows={rows}
          title={title}
          userControl={isAdvisorOnly ? null : <UserSelect users={users} selected={selectedUser} hrefFor={userHref} />}
          advisorMode={isAdvisorOnly}
          canCreate={canCreate && !isAdvisorOnly}
          exportQuery={"user=" + encodeURIComponent(selectedUser)}
          extraFilters={advisorFilters}
        />
      </main>
    </div>
  )
}
