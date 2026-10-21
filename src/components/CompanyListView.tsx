// 置き場所: src/components/CompanyListView.tsx
"use client"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { CompanyRow } from "@/lib/companyList"
import {
  IconAlert, IconBan, IconBuilding, IconCalendar, IconChart, IconChevronRight, IconDownload, IconExternal,
  IconFile, IconHome, IconPencil, IconPhone, IconPlus, IconPlusCircle, IconSearch, IconSort, IconX,
} from "@/components/icons"

const STATUS_LABELS: Record<string, string> = {
  contracted: "契約中",
  referral_only: "人材紹介のみ",
  approaching: "アプローチ中",
  delisted: "掲載落ち",
}
const STATUS_CHIP: Record<string, string> = {
  contracted: "bg-green-50 text-green-700 ring-green-200",
  referral_only: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  approaching: "bg-blue-50 text-blue-700 ring-blue-200",
  delisted: "bg-gray-100 text-gray-500 ring-gray-200",
}
const STATUS_DOT: Record<string, string> = {
  contracted: "bg-green-500",
  referral_only: "bg-emerald-500",
  approaching: "bg-blue-500",
  delisted: "bg-gray-400",
}
const FLAG_CHIP: Record<string, string> = {
  red: "bg-red-50 text-red-700",
  yellow: "bg-amber-50 text-amber-800",
  gray: "bg-gray-100 text-gray-500",
}

type SortKey = "updated" | "name" | "apply" | "action"
type FocusKey = "" | "attention" | "no_apply" | "stale_article" | "renewal" | "action_overdue" | "unassigned"

type Detail = {
  id: string
  name: string
  companyId: string | null
  status: string
  phone: string | null
  address: string | null
  websiteUrl: string | null
  nextAction: string | null
  nextActionDate: string | null
  negotiationMemo: string | null
  memo: string | null
  user: { id: string; name: string }
  monthlyRecords: { id: string; year: number; month: number; applyCount: number; hireCount: number }[]
}

function ymd(iso: string | null | undefined): string {
  if (!iso) return ""
  const j = new Date(new Date(iso).getTime() + 9 * 3600000)
  return `${j.getUTCFullYear()}/${String(j.getUTCMonth() + 1).padStart(2, "0")}/${String(j.getUTCDate()).padStart(2, "0")}`
}

export default function CompanyListView({
  rows,
  title,
  userControl,
  advisorMode,
  canCreate,
  exportQuery,
  extraFilters,
}: {
  rows: CompanyRow[]
  title: string
  /** 担当者のプルダウン（サーバー側で用意） */
  userControl: React.ReactNode
  advisorMode: boolean
  canCreate: boolean
  /** CSV書き出しに渡すクエリ（user など） */
  exportQuery: string
  /** 人材紹介（advisor）向けの追加の絞り込み（サーバー側で用意） */
  extraFilters?: React.ReactNode
}) {
  const router = useRouter()
  const [q, setQ] = useState("")
  const [status, setStatus] = useState("all")
  const [focus, setFocus] = useState<FocusKey>("")
  const [prioritize, setPrioritize] = useState(true)
  const [sort, setSort] = useState<SortKey>("updated")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [panelId, setPanelId] = useState<string | null>(null)

  // ===== 絞り込み =====
  const searched = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter(r =>
      [r.name, r.companyId, r.prefecture, r.address, r.phone].some(v => v && v.toLowerCase().includes(s)),
    )
  }, [rows, q])

  const statusCount = (key: string) => (key === "all" ? searched.length : searched.filter(r => r.status === key).length)
  const byStatus = status === "all" ? searched : searched.filter(r => r.status === status)

  const hasFlag = (r: CompanyRow, key: FocusKey) =>
    key === "attention" ? r.flags.some(f => f.level !== "gray") : r.flags.some(f => f.key === key)
  const kpi = {
    attention: byStatus.filter(r => hasFlag(r, "attention")).length,
    no_apply: byStatus.filter(r => hasFlag(r, "no_apply")).length,
    stale_article: byStatus.filter(r => hasFlag(r, "stale_article")).length,
    renewal: byStatus.filter(r => hasFlag(r, "renewal")).length,
  }

  const visible = useMemo(() => {
    const list = focus ? byStatus.filter(r => hasFlag(r, focus)) : byStatus
    const sorted = [...list]
    const secondary = (a: CompanyRow, b: CompanyRow) => {
      switch (sort) {
        case "name": return a.name.localeCompare(b.name, "ja")
        case "apply": return b.apply3m - a.apply3m
        case "action": return (a.nextActionDate ?? "9999").localeCompare(b.nextActionDate ?? "9999")
        default: return b.updatedAt.localeCompare(a.updatedAt)
      }
    }
    sorted.sort((a, b) => (prioritize && b.score !== a.score ? b.score - a.score : secondary(a, b)))
    return sorted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byStatus, focus, prioritize, sort])

  const toggleSelect = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }
  const allChecked = visible.length > 0 && visible.every(r => selected.has(r.id))
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(visible.map(r => r.id)))

  const csvHref = (ids?: string[]) =>
    "/api/companies/export?" + exportQuery + (ids && ids.length > 0 ? "&ids=" + ids.join(",") : "")

  const panelRow = rows.find(r => r.id === panelId) ?? null

  const kpiCards: { key: FocusKey; label: string; value: number; icon: React.ReactNode; tone: string }[] = [
    { key: "", label: advisorMode ? "企業" : "管理企業", value: byStatus.length, icon: <IconBuilding className="w-5 h-5" />, tone: "text-blue-600 bg-blue-50" },
    { key: "attention", label: "要対応", value: kpi.attention, icon: <IconAlert className="w-5 h-5" />, tone: "text-red-600 bg-red-50" },
    { key: "no_apply", label: "応募停止", value: kpi.no_apply, icon: <IconBan className="w-5 h-5" />, tone: "text-rose-600 bg-rose-50" },
    { key: "stale_article", label: "記事が古い", value: kpi.stale_article, icon: <IconFile className="w-5 h-5" />, tone: "text-amber-600 bg-amber-50" },
    { key: "renewal", label: "更新が近い", value: kpi.renewal, icon: <IconCalendar className="w-5 h-5" />, tone: "text-indigo-600 bg-indigo-50" },
  ]

  const statusTabs = [
    { key: "all", label: "すべて" },
    { key: "contracted", label: "契約中" },
    { key: "referral_only", label: "人材紹介のみ" },
    { key: "approaching", label: "アプローチ中" },
    { key: "delisted", label: "掲載落ち" },
  ]

  return (
    <div className="flex min-h-full">
      <div className="flex-1 min-w-0 px-8 py-6">
        {/* パンくず・見出し */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
          <IconHome className="w-3.5 h-3.5" />
          <span>Home</span>
          <IconChevronRight className="w-3 h-3" />
          <span className="text-gray-600">企業一覧</span>
        </div>
        <div className="flex items-start gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            <p className="text-sm text-gray-500 mt-0.5">営業先の状況と次のアクションを管理</p>
          </div>
          <div className="flex-1" />
          <a href={csvHref()} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 bg-white hover:bg-gray-50 shadow-sm">
            <IconDownload /> CSV出力
          </a>
          {canCreate && (
            <a href="/companies/new" className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 shadow-sm">
              <IconPlus /> 企業追加
            </a>
          )}
        </div>

        {/* 集計カード */}
        {!advisorMode && (
          <div className="grid grid-cols-5 gap-3 mb-4">
            {kpiCards.map(card => {
              const on = focus === card.key && (card.key !== "" || focus === "")
              const active = card.key !== "" && focus === card.key
              return (
                <button
                  key={card.label}
                  type="button"
                  onClick={() => setFocus(active ? "" : card.key)}
                  className={
                    "flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left bg-white shadow-sm transition " +
                    (active ? "border-red-300 ring-2 ring-red-100 bg-red-50/40" : on && card.key === "" ? "border-gray-200" : "border-gray-200 hover:border-gray-300")
                  }
                >
                  <span className={"w-10 h-10 rounded-full flex items-center justify-center shrink-0 " + card.tone}>{card.icon}</span>
                  <span>
                    <span className="block text-xs text-gray-500">{card.label}</span>
                    <span className={"text-2xl font-bold " + (card.key === "attention" && card.value > 0 ? "text-red-600" : "text-gray-900")}>
                      {card.value}
                      <span className="text-xs font-normal text-gray-400 ml-1">件</span>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* 絞り込み */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
          <div className="flex gap-2 mb-3">
            {userControl}
            <div className="relative flex-1">
              <IconSearch className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="会社名・企業ID・住所・電話番号で検索（入力すると絞り込まれます）"
                className="w-full border border-gray-200 rounded-xl pl-9 pr-9 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {q && (
                <button type="button" onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <IconX />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {statusTabs.map(tab => {
              const on = status === tab.key
              return (
                <button key={tab.key} type="button" onClick={() => setStatus(tab.key)}
                  className={"inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium border transition " + (on ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400")}>
                  {tab.key !== "all" && <span className={"w-1.5 h-1.5 rounded-full " + (STATUS_DOT[tab.key] ?? "")} />}
                  {tab.label}
                  <span className={"ml-0.5 px-1.5 rounded-full text-[10px] " + (on ? "bg-white/20" : "bg-gray-100 text-gray-500")}>{statusCount(tab.key)}</span>
                </button>
              )
            })}
            <div className="flex-1" />
            {!advisorMode && (
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                <span className={"relative w-10 h-6 rounded-full transition " + (prioritize ? "bg-blue-600" : "bg-gray-300")}>
                  <input type="checkbox" checked={prioritize} onChange={e => setPrioritize(e.target.checked)} className="sr-only" />
                  <span className={"absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition " + (prioritize ? "left-[18px]" : "left-0.5")} />
                </span>
                要対応を優先表示
              </label>
            )}
          </div>
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            <IconSort className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-500">
              {visible.length}件表示
              {prioritize && !advisorMode ? "／対応が必要な企業を上位に表示中" : ""}
              {focus && <button type="button" onClick={() => setFocus("")} className="ml-2 text-blue-600 underline">絞り込みを解除</button>}
            </span>
            <div className="flex-1" />
            <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 bg-white">
              <option value="updated">更新日が新しい順</option>
              <option value="action">次回アクションが近い順</option>
              <option value="apply">直近の応募が多い順</option>
              <option value="name">会社名順</option>
            </select>
          </div>
        </div>

        {extraFilters}

        {/* 選択中の操作 */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-3 text-sm">
            <span className="text-blue-800 font-medium">{selected.size}件を選択中</span>
            <a href={csvHref([...selected])} className="inline-flex items-center gap-1.5 text-blue-700 hover:underline"><IconDownload className="w-3.5 h-3.5" /> 選択した企業をCSV出力</a>
            <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs text-gray-500 hover:text-gray-700">選択を解除</button>
          </div>
        )}

        {/* 一覧 */}
        {visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400 text-base mb-1">{focus ? "該当する企業はありません 🎉" : "企業データがありません"}</p>
            <p className="text-gray-400 text-sm">条件を変更してください</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500">
                  <th className="w-10 px-4 py-3"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="w-4 h-4 rounded" /></th>
                  <th className="text-left px-3 py-3 font-medium">企業名<div className="text-[10px] text-gray-400 font-normal">企業ID・所在地</div></th>
                  <th className="text-left px-3 py-3 font-medium">契約状況</th>
                  {advisorMode ? (
                    <th className="text-left px-3 py-3 font-medium">紹介契約</th>
                  ) : (
                    <>
                      <th className="text-center px-3 py-3 font-medium">直近3か月<div className="text-[10px] text-gray-400 font-normal">応募 / 入社</div></th>
                      <th className="text-left px-3 py-3 font-medium">次回アクション</th>
                      <th className="text-left px-3 py-3 font-medium">要対応</th>
                    </>
                  )}
                  <th className="text-left px-3 py-3 font-medium">担当</th>
                  <th className="text-left px-3 py-3 font-medium">最終更新</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map(r => {
                  const isOpen = panelId === r.id
                  const mainFlags = r.flags.filter(f => f.level !== "gray").slice(0, 2)
                  const hasMissing = r.flags.some(f => f.key === "missing_info")
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setPanelId(isOpen ? null : r.id)}
                      className={"cursor-pointer transition " + (isOpen ? "bg-blue-50/60 outline outline-1 outline-blue-300" : selected.has(r.id) ? "bg-blue-50/30" : "hover:bg-gray-50")}
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} className="w-4 h-4 rounded" />
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-sm font-semibold text-gray-900">{r.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {r.companyId ? "ID " + r.companyId : "ID未登録"}
                          {r.prefecture !== "不明" && <span className="ml-2">{r.prefecture}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={"inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ring-1 " + (STATUS_CHIP[r.status] ?? "bg-gray-100 text-gray-600 ring-gray-200")}>
                          <span className={"w-1.5 h-1.5 rounded-full " + (STATUS_DOT[r.status] ?? "bg-gray-400")} />
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      </td>
                      {advisorMode ? (
                        <td className="px-3 py-3">
                          {r.hasReferralContract
                            ? <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-50 text-emerald-700">あり</span>
                            : <span className="text-xs text-gray-300">なし</span>}
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-3 text-center tabular-nums whitespace-nowrap">
                            <span className={"text-base " + (r.apply3m > 0 ? "text-gray-900 font-medium" : "text-gray-300")}>{r.apply3m}</span>
                            <span className="text-gray-300 mx-1">/</span>
                            <span className={r.hire3m > 0 ? "text-green-600 font-bold" : "text-gray-300"}>{r.hire3m}</span>
                          </td>
                          <td className="px-3 py-3 max-w-[13rem]">
                            {r.nextAction || r.nextActionDate ? (
                              <div className="flex gap-1.5">
                                <IconCalendar className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                  <div className="text-sm text-gray-800 truncate">{r.nextAction || "（内容未入力）"}</div>
                                  {r.nextActionDate && <div className="text-xs text-gray-400">{ymd(r.nextActionDate)}</div>}
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-sm text-gray-300"><IconPlusCircle className="w-4 h-4" /> 未設定</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-col items-start gap-1">
                              {mainFlags.map(f => (
                                <span key={f.key} className={"text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap font-medium " + FLAG_CHIP[f.level]}>{f.label}</span>
                              ))}
                              {hasMissing && <span className={"text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap " + FLAG_CHIP.gray}>未入力あり</span>}
                            </div>
                          </td>
                        </>
                      )}
                      <td className="px-3 py-3 text-sm text-gray-600 whitespace-nowrap">{r.userName}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{ymd(r.updatedAt)}</td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <a href={"/companies/" + r.id} className="inline-block text-xs font-medium text-blue-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 hover:border-blue-200">詳細</a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 右パネル */}
      {panelRow && (
        <CompanyPanel
          key={panelRow.id}
          row={panelRow}
          advisorMode={advisorMode}
          onClose={() => setPanelId(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  )
}

// =====================================================================
// 右パネル（企業をクリックしたときのクイックビュー）
// =====================================================================

function CompanyPanel({
  row,
  advisorMode,
  onClose,
  onSaved,
}: {
  row: CompanyRow
  advisorMode: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [tab, setTab] = useState<"basic" | "results" | "memo">("basic")
  const [detail, setDetail] = useState<Detail | null>(null)
  const [editingAction, setEditingAction] = useState(false)
  const [actionText, setActionText] = useState("")
  const [actionDate, setActionDate] = useState("")
  const [editingMemo, setEditingMemo] = useState(false)
  const [memoText, setMemoText] = useState("")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")

  useEffect(() => {
    fetch("/api/companies/" + row.id).then(async r => {
      if (!r.ok) { setErr("企業情報を読み込めませんでした"); return }
      const d = await r.json()
      setDetail(d)
      setActionText(d.nextAction ?? "")
      setActionDate(d.nextActionDate ? String(d.nextActionDate).slice(0, 10) : "")
      setMemoText(d.negotiationMemo ?? "")
    })
  }, [row.id])

  const save = async (body: Record<string, unknown>) => {
    setSaving(true)
    setErr("")
    const res = await fetch("/api/companies/" + row.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!res.ok) {
      const e = await res.json().catch(() => null)
      setErr(e?.error ?? "保存できませんでした（担当者・管理者のみ編集できます）")
      return false
    }
    const d = await res.json()
    setDetail(prev => (prev ? { ...prev, ...d } : prev))
    onSaved()
    return true
  }

  const latestYear = detail && detail.monthlyRecords.length > 0 ? Math.max(...detail.monthlyRecords.map(m => m.year)) : null
  const yearRecords = detail ? detail.monthlyRecords.filter(m => m.year === latestYear) : []

  return (
    <aside className="w-[360px] shrink-0 border-l border-gray-200 bg-white sticky top-0 h-screen overflow-y-auto">
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <span className="w-11 h-11 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center"><IconBuilding className="w-5 h-5" /></span>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconX className="w-5 h-5" /></button>
        </div>
        <h2 className="text-lg font-bold text-gray-900 leading-snug">{row.name}</h2>
        <p className="text-xs text-gray-400 mt-0.5">{row.companyId ? "ID " + row.companyId : "ID未登録"}{row.prefecture !== "不明" && "　" + row.prefecture}</p>

        <div className="flex items-center gap-2 mt-3">
          <span className={"inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ring-1 " + (STATUS_CHIP[row.status] ?? "")}>
            <span className={"w-1.5 h-1.5 rounded-full " + (STATUS_DOT[row.status] ?? "")} />
            {STATUS_LABELS[row.status] ?? row.status}
          </span>
          <a href={"/companies/" + row.id} className="ml-auto inline-flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 hover:bg-gray-50">
            企業ページを表示 <IconExternal className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* クイック操作 */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          {row.phone ? (
            <a href={"tel:" + row.phone.replace(/[^0-9+]/g, "")} className="flex flex-col items-center gap-1 border border-gray-200 rounded-xl py-2.5 text-xs text-gray-700 hover:bg-gray-50">
              <IconPhone className="w-4 h-4 text-blue-600" /> 電話する
            </a>
          ) : (
            <span className="flex flex-col items-center gap-1 border border-gray-100 rounded-xl py-2.5 text-xs text-gray-300">
              <IconPhone className="w-4 h-4" /> 電話番号なし
            </span>
          )}
          <a href={"/companies/" + row.id + "/report"} className="flex flex-col items-center gap-1 border border-gray-200 rounded-xl py-2.5 text-xs text-gray-700 hover:bg-gray-50">
            <IconChart className="w-4 h-4 text-blue-600" /> レポート
          </a>
          <a href={"/companies/" + row.id + "#production"} className="flex flex-col items-center gap-1 border border-gray-200 rounded-xl py-2.5 text-xs text-gray-700 hover:bg-gray-50">
            <IconPlus className="w-4 h-4 text-blue-600" /> 制作依頼
          </a>
        </div>

        {/* タブ */}
        <div className="flex border-b border-gray-200 mt-5 text-sm">
          {[
            { key: "basic", label: "基本情報" },
            { key: "results", label: "応募・実績" },
            { key: "memo", label: "メモ" },
          ].map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key as typeof tab)}
              className={"flex-1 py-2 -mb-px border-b-2 " + (tab === t.key ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500 hover:text-gray-700")}>
              {t.label}
            </button>
          ))}
        </div>

        {err && <p className="text-xs text-red-600 mt-3">{err}</p>}
        {!detail && !err && <p className="text-sm text-gray-400 py-8 text-center">読み込み中...</p>}

        {detail && tab === "basic" && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="grid grid-cols-[5.5rem_1fr] gap-2">
              <span className="text-xs text-gray-400 pt-0.5">担当者</span>
              <span className="text-gray-900">{detail.user?.name ?? "-"}</span>
            </div>

            {!advisorMode && (
              <div className="grid grid-cols-[5.5rem_1fr] gap-2">
                <span className="text-xs text-gray-400 pt-0.5">次回アクション</span>
                {editingAction ? (
                  <div className="space-y-2">
                    <input value={actionText} onChange={e => setActionText(e.target.value)} placeholder="例: 原稿見直し提案" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900" />
                    <input type="date" value={actionDate} onChange={e => setActionDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900" />
                    <div className="flex gap-2">
                      <button type="button" disabled={saving}
                        onClick={async () => { if (await save({ nextAction: actionText, nextActionDate: actionDate || null })) setEditingAction(false) }}
                        className="bg-blue-600 text-white text-xs rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50">保存</button>
                      <button type="button" onClick={() => setEditingAction(false)} className="text-xs text-gray-500">キャンセル</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setEditingAction(true)} className="flex items-start gap-1.5 text-left group">
                    <IconCalendar className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                    <span className="flex-1">
                      <span className="block text-gray-900">{detail.nextAction || <span className="text-gray-400">未設定</span>}</span>
                      {detail.nextActionDate && <span className="block text-xs text-gray-400">{ymd(detail.nextActionDate)}</span>}
                    </span>
                    <IconPencil className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 mt-0.5" />
                  </button>
                )}
              </div>
            )}

            {!advisorMode && row.flags.length > 0 && (
              <div className="grid grid-cols-[5.5rem_1fr] gap-2">
                <span className="text-xs text-gray-400 pt-0.5">要対応</span>
                <div className="flex flex-col items-start gap-1">
                  {row.flags.map(f => (
                    <span key={f.key} className={"text-[11px] px-2 py-0.5 rounded-full font-medium " + FLAG_CHIP[f.level]}>{f.label}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-gray-100">
              <div className="text-xs font-semibold text-gray-700 mb-2">会社情報</div>
              <div className="space-y-1.5 text-sm">
                <div className="grid grid-cols-[5.5rem_1fr] gap-2"><span className="text-xs text-gray-400 pt-0.5">住所</span><span className="text-gray-800">{detail.address || "-"}</span></div>
                <div className="grid grid-cols-[5.5rem_1fr] gap-2"><span className="text-xs text-gray-400 pt-0.5">電話番号</span><span className="text-gray-800">{detail.phone || "-"}</span></div>
                <div className="grid grid-cols-[5.5rem_1fr] gap-2">
                  <span className="text-xs text-gray-400 pt-0.5">HP</span>
                  {detail.websiteUrl ? (
                    <a href={detail.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all inline-flex items-center gap-1">
                      {detail.websiteUrl} <IconExternal className="w-3 h-3 shrink-0" />
                    </a>
                  ) : <span className="text-gray-400">-</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {detail && tab === "results" && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs text-gray-400">直近3か月の応募</div>
                <div className="text-xl font-bold text-gray-900">{row.apply3m}<span className="text-xs font-normal text-gray-400 ml-1">件</span></div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs text-gray-400">直近3か月の入社</div>
                <div className="text-xl font-bold text-green-600">{row.hire3m}<span className="text-xs font-normal text-gray-400 ml-1">名</span></div>
              </div>
            </div>
            <div className="grid grid-cols-[6rem_1fr] gap-2 text-sm">
              <span className="text-xs text-gray-400 pt-0.5">最終応募日</span><span>{row.lastAppliedAt ? ymd(row.lastAppliedAt) : "-"}</span>
              <span className="text-xs text-gray-400 pt-0.5">契約更新日</span><span>{row.renewalDate ? ymd(row.renewalDate) : "-"}</span>
            </div>
            {yearRecords.length > 0 && (
              <div>
                <div className="text-xs text-gray-400 mb-1">月次実績（{latestYear}年）</div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {yearRecords.map(m => (
                      <tr key={m.id}>
                        <td className="py-1.5 text-gray-600">{m.month}月</td>
                        <td className="py-1.5 text-right">応募 <span className="font-medium">{m.applyCount}</span></td>
                        <td className="py-1.5 text-right">入社 <span className="font-medium text-green-600">{m.hireCount}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <a href={"/companies/" + row.id + "/report"} className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
              <IconChart className="w-3.5 h-3.5" /> 採用レポートを開く
            </a>
          </div>
        )}

        {detail && tab === "memo" && (
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">商談メモ</span>
                {!editingMemo && (
                  <button type="button" onClick={() => setEditingMemo(true)} className="text-gray-400 hover:text-gray-600"><IconPencil className="w-3.5 h-3.5" /></button>
                )}
              </div>
              {editingMemo ? (
                <div className="space-y-2">
                  <textarea value={memoText} onChange={e => setMemoText(e.target.value)} rows={6} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                  <div className="flex gap-2">
                    <button type="button" disabled={saving}
                      onClick={async () => { if (await save({ negotiationMemo: memoText })) setEditingMemo(false) }}
                      className="bg-blue-600 text-white text-xs rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50">保存</button>
                    <button type="button" onClick={() => setEditingMemo(false)} className="text-xs text-gray-500">キャンセル</button>
                  </div>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl p-3 text-gray-700 whitespace-pre-wrap min-h-[4rem]">
                  {detail.negotiationMemo || <span className="text-gray-400">未入力</span>}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">メモ</div>
              <div className="border border-gray-100 bg-gray-50 rounded-xl p-3 text-gray-700 whitespace-pre-wrap min-h-[3rem]">
                {detail.memo || <span className="text-gray-400">未入力</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
