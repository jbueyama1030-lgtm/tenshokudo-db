"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"

type CompetitorMedia = { name: string; monthly: number | null; costPerHire: number | null; note: string }
type Option = { name: string; amount: number }
type MonthlyRecord = {
  id: string
  year: number
  month: number
  applyCount: number
  hireCount: number
  inflowBreakdown: Record<string, number> | null
}
type DriverSales = {
  monthlyRevenue?: number
  annualRevenue?: number
  shifts?: Record<string, { top?: number; avg?: number }>
}

type Company = {
  id: string
  companyId: string | null
  name: string
  status: string
  userId: string
  user: { id: string; name: string }
  contactPerson: string | null
  contactPosition: string | null
  phone: string | null
  address: string | null
  vehicleCount: number | null
  driverCount: number | null
  annualHiringTarget: number | null
  adoptionChallenge: string | null
  apps: string[]
  dispatchRatio: string | null
  shifts: string[]
  competitorMedia: CompetitorMedia[]
  tenshokudoCostPerHire: number | null
  planName: string | null
  monthlyFee: number | null
  discountRate: number | null
  discountNote: string | null
  options: Option[]
  contractStart: string | null
  contractRenewal: string | null
  contractNote: string | null
  applyCount: number
  hireCount: number
  workplaceCertLevel: number
  websiteUrl: string | null
  temperature: string | null
  negotiationMemo: string | null
  nextAction: string | null
  nextActionDate: string | null
  memo: string | null
  persona: string[]
  media: string | null
  monthlyRecords: MonthlyRecord[]
  driverSales: DriverSales | null
}

type User = { id: string; name: string }

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  contracted: { label: "✅ 契約中", cls: "bg-green-100 text-green-800" },
  approaching: { label: "📋 アプローチ中", cls: "bg-blue-100 text-blue-800" },
  delisted: { label: "📉 掲載落ち", cls: "bg-gray-100 text-gray-600" },
}
const TEMP_MAP: Record<string, { label: string; cls: string }> = {
  hot: { label: "🔥 ホット", cls: "bg-red-100 text-red-800" },
  warm: { label: "☀️ ウォーム", cls: "bg-yellow-100 text-yellow-800" },
  cold: { label: "❄️ コールド", cls: "bg-blue-100 text-blue-800" },
}
const ALL_SHIFTS = ["日勤", "夜勤", "隔日勤務", "その他"]
const ALL_APPS = ["GO", "Uber Taxi", "S.RIDE", "DiDi", "自社アプリ"]
const DRIVER_SHIFT_KEYS = ["全体", "隔日勤務", "日勤", "夜勤"]

function fmt(n: number | null | undefined) {
  if (n == null) return "-"
  return Number(n).toLocaleString("ja-JP")
}

function certStars(level: number | null | undefined): string {
  const n = level ?? 0
  if (n <= 0) return "未取得"
  return "★".repeat(n)
}

const CERT_OPTIONS = [
  { value: 0, label: "未取得" },
  { value: 1, label: "★" },
  { value: 2, label: "★★" },
  { value: 3, label: "★★★" },
]

function daysUntil(dateStr: string | null) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr).getTime() - new Date().getTime()) / 86400000)
}

// ★ コンポーネント外に定義
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      {children}
    </div>
  )
}

function MonthlyRecordsTable({ records }: { records: MonthlyRecord[] }) {
  const years = [...new Set(records.map(r => r.year))].sort()
  const [selectedYear, setSelectedYear] = useState(years[years.length - 1])
  const filtered = records.filter(r => r.year === selectedYear)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">📈 月次実績</h2>
        <div className="flex gap-1">
          {years.map(y => (
            <button key={y} onClick={() => setSelectedYear(y)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${selectedYear === y ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"}`}>
              {y}年
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">月</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">応募数</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">入社数</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">流入元内訳</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-900 font-medium">{r.month}月</td>
                <td className="px-3 py-2 text-right font-bold text-blue-600">{r.applyCount}</td>
                <td className="px-3 py-2 text-right font-bold text-green-600">{r.hireCount}</td>
                <td className="px-3 py-2">
                  {r.inflowBreakdown && (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(r.inflowBreakdown)
                        .sort((a, b) => b[1] - a[1])
                        .map(([key, val]) => (
                          <span key={key} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {key}: {val}
                          </span>
                        ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200">
            <tr>
              <td className="px-3 py-2 text-xs font-medium text-gray-500">{selectedYear}年 合計</td>
              <td className="px-3 py-2 text-right font-bold text-blue-700">{filtered.reduce((s, r) => s + r.applyCount, 0)}</td>
              <td className="px-3 py-2 text-right font-bold text-green-700">{filtered.reduce((s, r) => s + r.hireCount, 0)}</td>
              <td className="px-3 py-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function TenshokudoCostPerHire({ annualRevenue, records }: { annualRevenue: number; records: MonthlyRecord[] }) {
  const years = [...new Set(records.map(r => r.year))].sort()
  const [selectedYear, setSelectedYear] = useState(years.length > 0 ? years[years.length - 1] : null)

  if (years.length === 0) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400">転職道の採用単価：</span>
        <span className="text-sm text-gray-400">月次実績データがありません</span>
      </div>
    )
  }

  const yearHires = records.filter(r => r.year === selectedYear).reduce((s, r) => s + r.hireCount, 0)
  const costPerHire = yearHires > 0 ? Math.round(annualRevenue / yearHires) : null

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">転職道の採用単価（年間掲載料 ÷ 入社数）</span>
        <div className="flex gap-1">
          {years.map(y => (
            <button key={y} type="button" onClick={() => setSelectedYear(y)}
              className={`px-2.5 py-0.5 text-xs rounded-full border transition-colors ${selectedYear === y ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"}`}>
              {y}年
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-baseline gap-3">
        {costPerHire != null
          ? <span className="text-base font-bold text-blue-700">¥{fmt(costPerHire)}</span>
          : <span className="text-sm text-gray-400">算出不可（入社数0）</span>}
        <span className="text-xs text-gray-400">
          {selectedYear}年：年間掲載料 ¥{fmt(annualRevenue)} ÷ 入社 {yearHires}名
        </span>
      </div>
    </div>
  )
}

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [company, setCompany] = useState<Company | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Company>>({})
  const [loading, setLoading] = useState(false)
  const [userName, setUserName] = useState("")
  const [sessionUser, setSessionUser] = useState<{ id: string; role: string } | null>(null)

  useEffect(() => {
    fetch(`/api/companies/${id}`).then(r => r.json()).then(data => {
      setCompany(data)
      setForm({
        ...data,
        competitorMedia: data.competitorMedia ?? [],
        options: data.options ?? [],
        apps: data.apps ?? [],
        shifts: data.shifts ?? [],
        driverSales: data.driverSales ?? { monthlyRevenue: undefined, annualRevenue: undefined, shifts: {} },
      })
    })
    fetch("/api/users").then(r => r.json()).then(setUsers)
    fetch("/api/auth/session").then(r => r.json()).then(s => {
      setUserName(s?.user?.name ?? "")
      setSessionUser({ id: s?.user?.id ?? "", role: s?.user?.role ?? "" })
    })
  }, [id])

  const set = (key: string, val: unknown) => setForm(f => ({ ...f, [key]: val }))

  const handleSave = async () => {
    setLoading(true)
    const res = await fetch(`/api/companies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const updated = await res.json()
      setCompany(updated)
      setEditing(false)
    }
    setLoading(false)
  }

  const handleDelete = async () => {
    if (!confirm("この企業を削除しますか？")) return
    await fetch(`/api/companies/${id}`, { method: "DELETE" })
    router.push("/companies")
  }

  if (!company) return <div className="flex h-screen items-center justify-center text-gray-400">読み込み中...</div>

  const annualBase = (form.monthlyFee ?? 0) * 12
  const discountAmt = Math.round(annualBase * ((form.discountRate ?? 0) / 100))
  const optionTotal = (form.options ?? []).reduce((s, o) => s + (Number(o.amount) || 0), 0)
  const totalRevenue = annualBase - discountAmt + optionTotal
  const renewalDays = daysUntil(company.contractRenewal)

  const setDriverSales = (key: string, val: unknown) => {
    const current = (form.driverSales as DriverSales) ?? {}
    set("driverSales", { ...current, [key]: val })
  }

  const setDriverShift = (shift: string, field: "top" | "avg", val: string) => {
    const current = (form.driverSales as DriverSales) ?? {}
    const shifts = current.shifts ?? {}
    set("driverSales", {
      ...current,
      shifts: {
        ...shifts,
        [shift]: { ...shifts[shift], [field]: val ? Number(val) : undefined },
      },
    })
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-5xl">
          <div className="flex items-center gap-3 mb-4">
            <a href="/companies" className="text-sm text-gray-400 hover:text-gray-600">← 企業一覧</a>
            <span className="text-gray-300">/</span>
            <h1 className="text-xl font-bold text-gray-800">{company.name}</h1>
            {company.companyId && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">ID: {company.companyId}</span>}
          </div>

          <div className="flex gap-2 mb-6">
            {editing ? (
              <>
                <button onClick={handleSave} disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{loading ? "保存中..." : "💾 保存"}</button>
                <button onClick={() => { setEditing(false); setForm({ ...company, competitorMedia: company.competitorMedia ?? [], options: company.options ?? [] }) }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">キャンセル</button>
              </>
            ) : sessionUser?.role !== "sales" || company.userId === sessionUser?.id ? (
              <>
                <button onClick={() => setEditing(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">✏️ 編集</button>
                <button onClick={handleDelete} className="px-4 py-2 text-sm border border-red-300 rounded-lg text-red-600 hover:bg-red-50">🗑️ 削除</button>
              </>
            ) : (
              <span className="text-xs text-gray-400 bg-gray-100 px-3 py-2 rounded-lg">👁 閲覧のみ（担当外）</span>
            )}
          </div>

          {/* 基本情報 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">基本情報</h2>
            <div className="grid grid-cols-3 gap-4">
              <Field label="企業名">
                {editing ? <input value={form.name ?? ""} onChange={e => set("name", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" /> : <p className="text-sm text-gray-900 font-medium">{company.name}</p>}
              </Field>
              <Field label="企業ID">
                {editing ? <input value={form.companyId ?? ""} onChange={e => set("companyId", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" /> : <p className="text-sm text-gray-900">{company.companyId ?? "-"}</p>}
              </Field>
              <Field label="ステータス">
                {editing ? (
                  <select value={form.status ?? ""} onChange={e => set("status", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
                    <option value="approaching">📋 アプローチ中</option>
                    <option value="contracted">✅ 契約中</option>
                    <option value="delisted">📉 掲載落ち</option>
                  </select>
                ) : <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_MAP[company.status]?.cls}`}>{STATUS_MAP[company.status]?.label}</span>}
              </Field>
              <Field label="担当者">
                {editing ? (
                  <select value={form.userId ?? ""} onChange={e => set("userId", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                ) : <p className="text-sm text-gray-900">{company.user.name}</p>}
              </Field>
              <Field label="企業担当者">
                {editing ? <input value={form.contactPerson ?? ""} onChange={e => set("contactPerson", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="例: 山田太郎" /> : <p className="text-sm text-gray-900">{company.contactPerson ?? "-"}</p>}
              </Field>
              <Field label="役職">
                {editing ? <input value={form.contactPosition ?? ""} onChange={e => set("contactPosition", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="例: 採用部長" /> : <p className="text-sm text-gray-900">{company.contactPosition ?? "-"}</p>}
              </Field>
              <Field label="電話番号">
                {editing ? <input value={form.phone ?? ""} onChange={e => set("phone", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" /> : <p className="text-sm text-gray-900">{company.phone ?? "-"}</p>}
              </Field>
              <Field label="住所">
                {editing ? <input value={form.address ?? ""} onChange={e => set("address", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" /> : <p className="text-sm text-gray-900">{company.address ?? "-"}</p>}
              </Field>
              <Field label="保有車両数">
                {editing ? <input type="number" value={form.vehicleCount ?? ""} onChange={e => set("vehicleCount", e.target.value === "" ? null : Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" /> : <p className="text-sm text-gray-900">{company.vehicleCount != null ? company.vehicleCount + "台" : "-"}</p>}
              </Field>
              <Field label="ドライバー数">
                {editing ? <input type="number" value={form.driverCount ?? ""} onChange={e => set("driverCount", e.target.value === "" ? null : Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" /> : <p className="text-sm text-gray-900">{company.driverCount != null ? company.driverCount + "名" : "-"}</p>}
              </Field>
              <Field label="年間採用目標">
                {editing ? <input type="number" value={form.annualHiringTarget ?? ""} onChange={e => set("annualHiringTarget", e.target.value === "" ? null : Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" /> : <p className="text-sm text-gray-900">{company.annualHiringTarget != null ? company.annualHiringTarget + "名" : "-"}</p>}
              </Field>
              <Field label="働きやすい職場認証">
                {editing ? (
                  <select value={form.workplaceCertLevel ?? 0} onChange={e => set("workplaceCertLevel", Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
                    {CERT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  (company.workplaceCertLevel ?? 0) > 0
                    ? <p className="text-sm text-yellow-500 font-medium">{certStars(company.workplaceCertLevel)}</p>
                    : <p className="text-sm text-gray-400">未取得</p>
                )}
              </Field>
              <Field label="HP（企業サイト）">
                {editing ? (
                  <input value={form.websiteUrl ?? ""} onChange={e => set("websiteUrl", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="https://example.com" />
                ) : (
                  company.websiteUrl
                    ? <a href={company.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline break-all">{company.websiteUrl}</a>
                    : <p className="text-sm text-gray-400">-</p>
                )}
              </Field>
            </div>
          </div>

          {/* 採用課題・アプリ */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">採用課題</h2>
              {editing
                ? <textarea value={form.adoptionChallenge ?? ""} onChange={e => set("adoptionChallenge", e.target.value)} rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="採用における課題を記録..." />
                : <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{company.adoptionChallenge || "-"}</p>}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">導入アプリ・配車割合</h2>
              <div className="mb-3">
                <div className="text-xs text-gray-400 mb-2">導入アプリ</div>
                {editing ? (
                  <div className="flex flex-wrap gap-2">
                    {ALL_APPS.map(app => {
                      const sel = (form.apps ?? []).includes(app)
                      return (
                        <button key={app} type="button" onClick={() => {
                          const apps = form.apps ?? []
                          set("apps", sel ? apps.filter(a => a !== app) : [...apps, app])
                        }} className={`text-xs px-3 py-1 rounded-full border transition-colors ${sel ? "bg-blue-100 text-blue-800 border-blue-300" : "bg-gray-50 text-gray-500 border-gray-200"}`}>{app}</button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(company.apps ?? []).length > 0
                      ? (company.apps ?? []).map(app => <span key={app} className="text-xs px-2.5 py-1 rounded-full bg-purple-100 text-purple-800">{app}</span>)
                      : <span className="text-sm text-gray-400">-</span>}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">配車割合</div>
                {editing
                  ? <input value={form.dispatchRatio ?? ""} onChange={e => set("dispatchRatio", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="例: GO 60% / Uber 40%" />
                  : <p className="text-sm text-gray-700">{company.dispatchRatio || "-"}</p>}
              </div>
            </div>
          </div>

          {/* 募集勤務形態 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">募集勤務形態</h2>
            <div className="flex gap-2 flex-wrap">
              {ALL_SHIFTS.map(s => {
                const sel = (editing ? form.shifts ?? [] : company.shifts ?? []).includes(s)
                return editing ? (
                  <button key={s} type="button" onClick={() => {
                    const shifts = form.shifts ?? []
                    set("shifts", sel ? shifts.filter(x => x !== s) : [...shifts, s])
                  }} className={`text-sm px-4 py-1.5 rounded-full border transition-colors ${sel ? "bg-blue-100 text-blue-800 border-blue-300" : "bg-gray-50 text-gray-500 border-gray-200"}`}>{s}</button>
                ) : (
                  <span key={s} className={`text-sm px-4 py-1.5 rounded-full border ${sel ? "bg-blue-100 text-blue-800 border-blue-300" : "bg-gray-50 text-gray-300 border-gray-200"}`}>{s}</span>
                )
              })}
            </div>
          </div>

          {/* ドライバー売上情報 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">🚕 ドライバー・会社売上情報</h2>
            {editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="会社月間売上">
                    <input
                      type="number"
                      value={(form.driverSales as DriverSales)?.monthlyRevenue ?? ""}
                      onChange={e => setDriverSales("monthlyRevenue", e.target.value ? Number(e.target.value) : undefined)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                      placeholder="例: 9600000"
                    />
                  </Field>
                  <Field label="会社年間売上">
                    <input
                      type="number"
                      value={(form.driverSales as DriverSales)?.annualRevenue ?? ""}
                      onChange={e => setDriverSales("annualRevenue", e.target.value ? Number(e.target.value) : undefined)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                      placeholder="例: 115200000"
                    />
                  </Field>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-2">勤務形態別ドライバー売上（万円）</div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">勤務形態</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">トップ売上（万円）</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">平均売上（万円）</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {DRIVER_SHIFT_KEYS.map(shift => (
                        <tr key={shift}>
                          <td className="px-3 py-2 text-xs font-medium text-gray-700">{shift}</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={(form.driverSales as DriverSales)?.shifts?.[shift]?.top ?? ""}
                              onChange={e => setDriverShift(shift, "top", e.target.value)}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-900"
                              placeholder="例: 100"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={(form.driverSales as DriverSales)?.shifts?.[shift]?.avg ?? ""}
                              onChange={e => setDriverShift(shift, "avg", e.target.value)}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-900"
                              placeholder="例: 70"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="text-xs text-blue-500 mb-1">会社月間売上</div>
                    <div className="text-2xl font-bold text-blue-700">
                      {company.driverSales?.monthlyRevenue != null ? "¥" + fmt(company.driverSales.monthlyRevenue) : "-"}
                    </div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="text-xs text-green-500 mb-1">会社年間売上</div>
                    <div className="text-2xl font-bold text-green-700">
                      {company.driverSales?.annualRevenue != null ? "¥" + fmt(company.driverSales.annualRevenue) : "-"}
                    </div>
                  </div>
                </div>
                {company.driverSales?.shifts && Object.keys(company.driverSales.shifts).length > 0 && (
                  <div>
                    <div className="text-xs text-gray-400 mb-2">勤務形態別ドライバー売上</div>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">勤務形態</th>
                          <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">トップ売上</th>
                          <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">平均売上</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {DRIVER_SHIFT_KEYS.filter(s => company.driverSales?.shifts?.[s]).map(shift => (
                          <tr key={shift} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-xs font-medium text-gray-700">{shift}</td>
                            <td className="px-3 py-2 text-right font-bold text-blue-600">
                              {company.driverSales?.shifts?.[shift]?.top != null ? company.driverSales.shifts[shift].top + "万円" : "-"}
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-gray-600">
                              {company.driverSales?.shifts?.[shift]?.avg != null ? company.driverSales.shifts[shift].avg + "万円" : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {(!company.driverSales || (!company.driverSales.monthlyRevenue && !company.driverSales.annualRevenue && !company.driverSales.shifts)) && (
                  <p className="text-sm text-gray-400">未入力</p>
                )}
              </div>
            )}
          </div>

          {/* 競合媒体 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">転職道以外の利用媒体・採用単価</h2>
            <table className="w-full text-sm mb-3">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">媒体名</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">月額費用</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">採用単価</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">備考</th>
                  {editing && <th className="px-3 py-2"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(editing ? form.competitorMedia ?? [] : company.competitorMedia ?? []).map((m, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-gray-900">{editing ? <input value={m.name} onChange={e => { const arr = [...(form.competitorMedia ?? [])]; arr[i] = { ...arr[i], name: e.target.value }; set("competitorMedia", arr) }} className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-900" /> : m.name}</td>
                    <td className="px-3 py-2 text-gray-900">{editing ? <input type="number" value={m.monthly ?? ""} onChange={e => { const arr = [...(form.competitorMedia ?? [])]; arr[i] = { ...arr[i], monthly: e.target.value === "" ? null : Number(e.target.value) }; set("competitorMedia", arr) }} className="w-24 border border-gray-200 rounded px-2 py-1 text-xs text-gray-900" placeholder="円" /> : (m.monthly != null ? "¥" + fmt(m.monthly) : "-")}</td>
                    <td className="px-3 py-2 text-gray-900">{editing ? <input type="number" value={m.costPerHire ?? ""} onChange={e => { const arr = [...(form.competitorMedia ?? [])]; arr[i] = { ...arr[i], costPerHire: e.target.value === "" ? null : Number(e.target.value) }; set("competitorMedia", arr) }} className="w-28 border border-gray-200 rounded px-2 py-1 text-xs text-gray-900" placeholder="円" /> : (m.costPerHire != null ? "¥" + fmt(m.costPerHire) : "-")}</td>
                    <td className="px-3 py-2 text-gray-900">{editing ? <input value={m.note} onChange={e => { const arr = [...(form.competitorMedia ?? [])]; arr[i] = { ...arr[i], note: e.target.value }; set("competitorMedia", arr) }} className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-900" /> : m.note}</td>
                    {editing && <td className="px-3 py-2"><button type="button" onClick={() => set("competitorMedia", (form.competitorMedia ?? []).filter((_, j) => j !== i))} className="text-red-400 text-xs hover:text-red-600">削除</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {editing && <button type="button" onClick={() => set("competitorMedia", [...(form.competitorMedia ?? []), { name: "", monthly: null, costPerHire: null, note: "" }])} className="text-xs text-blue-600 hover:underline">＋ 媒体を追加</button>}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <TenshokudoCostPerHire annualRevenue={totalRevenue} records={company.monthlyRecords ?? []} />
            </div>
          </div>

          {/* 売上管理 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">売上管理</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">年間売上合計</span>
                <span className="text-2xl font-bold text-blue-700">¥{fmt(totalRevenue)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="プラン">
                    {editing
                      ? <select value={form.planName ?? ""} onChange={e => set("planName", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
                          <option value="">未設定</option>
                          <option>ライト</option><option>スタンダード</option><option>ハイグレード</option>
                        </select>
                      : <p className="text-sm text-gray-900">{company.planName ?? "-"}</p>}
                  </Field>
                  <Field label="月額掲載料">
                    {editing
                      ? <input type="number" value={form.monthlyFee ?? ""} onChange={e => set("monthlyFee", e.target.value === "" ? null : Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="円" />
                      : <p className="text-sm text-gray-900">{company.monthlyFee != null ? "¥" + fmt(company.monthlyFee) : "-"}</p>}
                  </Field>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-xs text-gray-500">年間掲載料（基本）</span>
                  <span className="text-sm font-medium">¥{fmt(annualBase)}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">割引率</span>
                    {editing
                      ? <input type="number" value={form.discountRate ?? ""} onChange={e => set("discountRate", e.target.value === "" ? null : Number(e.target.value))} className="border border-gray-300 rounded px-2 py-1 text-xs w-16 text-gray-900" placeholder="%" />
                      : <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">{company.discountRate ?? 0}%</span>}
                  </div>
                  <span className="text-sm text-red-500 font-medium">－ ¥{fmt(discountAmt)}</span>
                </div>
                <div className="py-2 border-b border-gray-100">
                  <div className="text-xs text-gray-400 mb-2">オプション（追加広告等）</div>
                  {(editing ? form.options ?? [] : company.options ?? []).map((op, i) => (
                    <div key={i} className="flex items-center justify-between mb-1.5">
                      {editing
                        ? <>
                            <input value={op.name} onChange={e => { const arr = [...(form.options ?? [])]; arr[i] = { ...arr[i], name: e.target.value }; set("options", arr) }} className="border border-gray-200 rounded px-2 py-1 text-xs flex-1 mr-2 text-gray-900" placeholder="オプション名" />
                            <input type="number" value={op.amount} onChange={e => { const arr = [...(form.options ?? [])]; arr[i] = { ...arr[i], amount: e.target.value === "" ? 0 : Number(e.target.value) }; set("options", arr) }} className="border border-gray-200 rounded px-2 py-1 text-xs w-28 mr-2 text-gray-900" placeholder="金額" />
                            <button type="button" onClick={() => set("options", (form.options ?? []).filter((_, j) => j !== i))} className="text-red-400 text-xs">削除</button>
                          </>
                        : <>
                            <span className="text-xs text-gray-600">{op.name}</span>
                            <span className="text-sm font-medium text-green-700">＋ ¥{fmt(op.amount)}</span>
                          </>}
                    </div>
                  ))}
                  {editing && <button type="button" onClick={() => set("options", [...(form.options ?? []), { name: "", amount: 0 }])} className="text-xs text-blue-600 hover:underline">＋ オプション追加</button>}
                </div>
                <Field label="割引備考">
                  {editing
                    ? <input value={form.discountNote ?? ""} onChange={e => set("discountNote", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="例: 3年契約5%OFF" />
                    : <p className="text-sm text-gray-900">{company.discountNote || "-"}</p>}
                </Field>
              </div>
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-xs text-gray-400 mb-3">契約期間</div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="契約開始日">
                      {editing
                        ? <input type="date" value={form.contractStart?.slice(0, 10) ?? ""} onChange={e => set("contractStart", e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900" />
                        : <p className="text-sm text-gray-900">{company.contractStart?.slice(0, 10) ?? "-"}</p>}
                    </Field>
                    <Field label="次回更新日">
                      {editing
                        ? <input type="date" value={form.contractRenewal?.slice(0, 10) ?? ""} onChange={e => set("contractRenewal", e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900" />
                        : <div>
                            <p className="text-sm text-gray-900">{company.contractRenewal?.slice(0, 10) ?? "-"}</p>
                            {renewalDays != null && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${renewalDays <= 14 ? "bg-red-100 text-red-700" : renewalDays <= 60 ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>残{renewalDays}日</span>
                            )}
                          </div>}
                    </Field>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="text-xs text-gray-400 mb-1">契約期間備考</div>
                    {editing
                      ? <textarea value={form.contractNote ?? ""} onChange={e => set("contractNote", e.target.value)} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="例: 初年度のみ半年契約、更新時に再見積もり等" />
                      : <p className="text-sm text-gray-900 whitespace-pre-wrap">{company.contractNote || "-"}</p>}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-xs text-gray-400 mb-3">転職道実績</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-gray-400 mb-1">累計応募数</div>
                      <div className="text-2xl font-bold text-gray-900">{company.applyCount}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-1">累計入社数</div>
                      <div className="text-2xl font-bold text-green-600">{company.hireCount}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 月次実績 */}
          {company.monthlyRecords && company.monthlyRecords.length > 0 && (
            <MonthlyRecordsTable records={company.monthlyRecords} />
          )}

          {/* 商談情報 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">商談情報</h2>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Field label="温度感">
                {editing
                  ? <select value={form.temperature ?? ""} onChange={e => set("temperature", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
                      <option value="">未設定</option>
                      <option value="hot">🔥 ホット</option>
                      <option value="warm">☀️ ウォーム</option>
                      <option value="cold">❄️ コールド</option>
                    </select>
                  : company.temperature
                    ? <span className={`text-xs px-2 py-1 rounded-full font-medium ${TEMP_MAP[company.temperature]?.cls}`}>{TEMP_MAP[company.temperature]?.label}</span>
                    : <p className="text-sm text-gray-900">-</p>}
              </Field>
              <Field label="次回アクション">
                {editing ? <input value={form.nextAction ?? ""} onChange={e => set("nextAction", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="例: 資料送付" /> : <p className="text-sm text-gray-900">{company.nextAction ?? "-"}</p>}
              </Field>
              <Field label="次回アクション日">
                {editing ? <input type="date" value={form.nextActionDate?.slice(0, 10) ?? ""} onChange={e => set("nextActionDate", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" /> : <p className="text-sm text-gray-900">{company.nextActionDate?.slice(0, 10) ?? "-"}</p>}
              </Field>
            </div>
            <Field label="商談メモ">
              {editing
                ? <textarea value={form.negotiationMemo ?? ""} onChange={e => set("negotiationMemo", e.target.value)} rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="商談の詳細を記録..." />
                : <p className="text-sm text-gray-900 whitespace-pre-wrap">{company.negotiationMemo ?? "-"}</p>}
            </Field>
          </div>

          {/* メモ */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">メモ</h2>
            {editing
              ? <textarea value={form.memo ?? ""} onChange={e => set("memo", e.target.value)} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
              : <p className="text-sm text-gray-900 whitespace-pre-wrap">{company.memo ?? "-"}</p>}
          </div>
        </div>
      </main>
    </div>
  )
}