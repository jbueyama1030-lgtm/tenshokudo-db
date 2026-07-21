"use client"
import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"

type CompetitorMedia = { name: string; monthly: number | null; costPerHire: number | null; note: string }
type Option = { name: string; amount: number }
type ReferralFee = { condition: string; amount: number | null }
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
  hasReferralContract: boolean
  referralFees: ReferralFee[] | null
  condWorkSide: string | null
  condFemale: string | null
  condLgbtq: string | null
  condForeign: string | null
  condSpecialTrain: string | null
  condAge64: string | null
  condTattoo: string | null
  condAccident: string | null
  condDorm: boolean | null
  condHousingSupport: boolean | null
  condFemaleFacility: boolean | null
  condJobChangeLimit: boolean | null
  condGuarantor: boolean | null
  condAgeRange: string | null
  condRetirementAge: string | null
  condIdealPerson: string | null
  condHiringStandard: string | null
  condAppearance: string | null
  condMedicalHistory: string | null
  condNote: string | null
}

type User = { id: string; name: string }

// 制作案件の型とラベル
type ProductionTask = {
  id: string
  name: string
  type: string
  priority: string
  status: string
  memo: string | null
  dueDate: string | null
  assignee: { id: string; name: string } | null
  requester: { id: string; name: string } | null
  createdAt: string
}

const TASK_TYPE_LABELS: Record<string, string> = {
  new: "新規", revise: "修正", renewal: "リニューアル",
}
const TASK_PRIORITY_LABELS: Record<string, { label: string; cls: string }> = {
  high: { label: "高", cls: "bg-red-100 text-red-700" },
  medium: { label: "中", cls: "bg-yellow-100 text-yellow-700" },
  low: { label: "低", cls: "bg-gray-100 text-gray-600" },
}
const TASK_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  not_started: { label: "未着手", cls: "bg-gray-100 text-gray-600" },
  in_progress: { label: "着手", cls: "bg-blue-100 text-blue-700" },
  sales_review: { label: "営業確認中", cls: "bg-purple-100 text-purple-700" },
  client_review: { label: "企業確認中", cls: "bg-indigo-100 text-indigo-700" },
  published: { label: "公開", cls: "bg-green-100 text-green-700" },
  paused: { label: "一時停止中", cls: "bg-orange-100 text-orange-700" },
  stopped: { label: "停止処理済み", cls: "bg-gray-200 text-gray-500" },
}

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

// 人材紹介：3択（可能/不可能/要相談）
const COND3_MAP: Record<string, { label: string; cls: string }> = {
  ok: { label: "可能", cls: "bg-green-100 text-green-800" },
  ng: { label: "不可", cls: "bg-red-100 text-red-800" },
  consult: { label: "要相談", cls: "bg-yellow-100 text-yellow-800" },
}
const COND3_OPTIONS = [
  { value: "", label: "未入力" },
  { value: "ok", label: "可能" },
  { value: "ng", label: "不可能" },
  { value: "consult", label: "要相談" },
]
const COND3_ACCEPT = [
  { key: "condWorkSide", label: "Wワーク・副業" },
  { key: "condFemale", label: "女性雇用" },
  { key: "condLgbtq", label: "LGBTQ受け入れ" },
  { key: "condForeign", label: "外国籍雇用" },
  { key: "condTattoo", label: "タトゥー・刺青" },
  { key: "condAccident", label: "事故・違反者" },
  { key: "condAge64", label: "64歳未経験" },
  { key: "condSpecialTrain", label: "特別講習対応" },
]
const COND2_ENV = [
  { key: "condDorm", label: "寮", yes: "有", no: "無" },
  { key: "condHousingSupport", label: "住宅支援", yes: "有", no: "無" },
  { key: "condFemaleFacility", label: "女性専用設備", yes: "有", no: "無" },
]
const COND2_STANDARD = [
  { key: "condJobChangeLimit", label: "転職回数制限", yes: "有", no: "無" },
  { key: "condGuarantor", label: "保証人", yes: "要", no: "不要" },
]
const CONDTEXT_SHORT = [
  { key: "condAgeRange", label: "採用可能年齢" },
  { key: "condRetirementAge", label: "定年" },
  { key: "condMedicalHistory", label: "既往歴" },
]
const CONDTEXT_LONG = [
  { key: "condIdealPerson", label: "求める人物像" },
  { key: "condHiringStandard", label: "採用基準" },
  { key: "condAppearance", label: "身だしなみ" },
  { key: "condNote", label: "備考" },
]

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
              className={"px-3 py-1 text-xs rounded-full border transition-colors " + (selectedYear === y ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-400")}>
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
              className={"px-2.5 py-0.5 text-xs rounded-full border transition-colors " + (selectedYear === y ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-400")}>
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
  const [tasks, setTasks] = useState<ProductionTask[]>([])
  const [taskForm, setTaskForm] = useState({ name: "", type: "new", priority: "medium", dueDate: "", memo: "" })
  const [taskLoading, setTaskLoading] = useState(false)

  const [inlineField, setInlineField] = useState<string>("")
  const [inlineValue, setInlineValue] = useState<string>("")
  const [inlineSaving, setInlineSaving] = useState(false)
  const [inlineSavedMsg, setInlineSavedMsg] = useState(false)

  useEffect(() => {
    fetch("/api/companies/" + id).then(r => r.json()).then(data => {
      setCompany(data)
      setForm({
        ...data,
        competitorMedia: data.competitorMedia ?? [],
        options: data.options ?? [],
        apps: data.apps ?? [],
        shifts: data.shifts ?? [],
        driverSales: data.driverSales ?? { monthlyRevenue: undefined, annualRevenue: undefined, shifts: {} },
        referralFees: data.referralFees ?? [],
      })
    })
    fetch("/api/users").then(r => r.json()).then(setUsers)
    fetch("/api/auth/session").then(r => r.json()).then(s => {
      setUserName(s?.user?.name ?? "")
      setSessionUser({ id: s?.user?.id ?? "", role: s?.user?.role ?? "" })
    })
    loadTasks()
  }, [id])

  const set = (key: string, val: unknown) => setForm(f => ({ ...f, [key]: val }))

  const loadTasks = async () => {
    const res = await fetch("/api/production-tasks?companyId=" + id)
    if (res.ok) setTasks(await res.json())
  }

  const handleCreateTask = async () => {
    if (!taskForm.name.trim()) return
    setTaskLoading(true)
    const res = await fetch("/api/production-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...taskForm, companyId: id }),
    })
    if (res.ok) {
      setTaskForm({ name: "", type: "new", priority: "medium", dueDate: "", memo: "" })
      await loadTasks()
    }
    setTaskLoading(false)
  }

  const handleSave = async () => {
    setLoading(true)
    const res = await fetch("/api/companies/" + id, {
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
    await fetch("/api/companies/" + id, { method: "DELETE" })
    router.push("/companies")
  }

  const startInline = (field: string, currentValue: string) => {
    setInlineField(field)
    setInlineValue(currentValue ?? "")
    setInlineSavedMsg(false)
  }

  const cancelInline = () => {
    setInlineField("")
    setInlineValue("")
  }

  const saveInline = async (field: string, valueOverride?: string) => {
    const value = valueOverride !== undefined ? valueOverride : inlineValue
    setInlineSaving(true)

    const payload: Record<string, unknown> = {}
    if (field === "nextActionDate") {
      payload.nextActionDate = value || null
    } else {
      payload[field] = value || null
    }

    const res = await fetch("/api/companies/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      setCompany(c => c ? { ...c, [field]: value || null } : c)
      setForm(f => ({ ...f, [field]: value || null }))
      setInlineField("")
      setInlineValue("")
      setInlineSavedMsg(true)
      setTimeout(() => setInlineSavedMsg(false), 2000)
    }
    setInlineSaving(false)
  }

  if (!company) return <div className="flex h-screen items-center justify-center text-gray-400">読み込み中...</div>

  const annualBase = (form.monthlyFee ?? 0) * 12
  const discountAmt = Math.round(annualBase * ((form.discountRate ?? 0) / 100))
  const optionTotal = (form.options ?? []).reduce((s, o) => s + (Number(o.amount) || 0), 0)
  const totalRevenue = annualBase - discountAmt + optionTotal
  const renewalDays = daysUntil(company.contractRenewal)

  const canInlineEdit =
    !editing &&
    sessionUser != null &&
    sessionUser.role !== "production" &&
    (sessionUser.role !== "sales" || company.userId === sessionUser.id)

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

  const formVal = form as unknown as Record<string, unknown>
  const compVal = company as unknown as Record<string, unknown>

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
            {company.hasReferralContract && <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full font-medium">🤝 紹介契約あり</span>}
          </div>

          <div className="flex gap-2 mb-6">
            {editing ? (
              <>
                <button onClick={handleSave} disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{loading ? "保存中..." : "💾 保存"}</button>
                <button onClick={() => { setEditing(false); setForm({ ...company, competitorMedia: company.competitorMedia ?? [], options: company.options ?? [], referralFees: company.referralFees ?? [] }) }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">キャンセル</button>
              </>
            ) : sessionUser?.role === "production" ? (
              <span className="text-xs text-gray-400 bg-gray-100 px-3 py-2 rounded-lg">👁 閲覧のみ（制作）</span>
            ) : sessionUser?.role !== "sales" || company.userId === sessionUser?.id ? (
              <>
                <button onClick={() => setEditing(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">✏️ 全項目を編集</button>
                <button onClick={handleDelete} className="px-4 py-2 text-sm border border-red-300 rounded-lg text-red-600 hover:bg-red-50">🗑️ 削除</button>
                {inlineSavedMsg && <span className="text-xs text-green-600 self-center ml-1">✓ 保存しました</span>}
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
                ) : <span className={"text-xs px-2 py-1 rounded-full font-medium " + (STATUS_MAP[company.status]?.cls ?? "")}>{STATUS_MAP[company.status]?.label ?? company.status}</span>}
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
                        }} className={"text-xs px-3 py-1 rounded-full border transition-colors " + (sel ? "bg-blue-100 text-blue-800 border-blue-300" : "bg-gray-50 text-gray-500 border-gray-200")}>{app}</button>
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
                  }} className={"text-sm px-4 py-1.5 rounded-full border transition-colors " + (sel ? "bg-blue-100 text-blue-800 border-blue-300" : "bg-gray-50 text-gray-500 border-gray-200")}>{s}</button>
                ) : (
                  <span key={s} className={"text-sm px-4 py-1.5 rounded-full border " + (sel ? "bg-blue-100 text-blue-800 border-blue-300" : "bg-gray-50 text-gray-300 border-gray-200")}>{s}</span>
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
                              <span className={"text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block " + (renewalDays <= 14 ? "bg-red-100 text-red-700" : renewalDays <= 60 ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700")}>残{renewalDays}日</span>
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

          {/* 商談情報（インライン編集対応） */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">商談情報</h2>
              {canInlineEdit && !editing && (
                <span className="text-xs text-gray-400">クリックしてその場で編集できます</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Field label="温度感">
                {editing ? (
                  <select value={form.temperature ?? ""} onChange={e => set("temperature", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
                    <option value="">未設定</option>
                    <option value="hot">🔥 ホット</option>
                    <option value="warm">☀️ ウォーム</option>
                    <option value="cold">❄️ コールド</option>
                  </select>
                ) : inlineField === "temperature" ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={inlineValue}
                      onChange={e => saveInline("temperature", e.target.value)}
                      disabled={inlineSaving}
                      autoFocus
                      className="border border-blue-400 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">未設定</option>
                      <option value="hot">🔥 ホット</option>
                      <option value="warm">☀️ ウォーム</option>
                      <option value="cold">❄️ コールド</option>
                    </select>
                    <button onClick={cancelInline} className="text-xs text-gray-400 hover:text-gray-600">取消</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => canInlineEdit && startInline("temperature", company.temperature ?? "")}
                    disabled={!canInlineEdit}
                    className={"text-left " + (canInlineEdit ? "cursor-pointer hover:opacity-70" : "cursor-default")}
                  >
                    {company.temperature
                      ? <span className={"text-xs px-2 py-1 rounded-full font-medium " + (TEMP_MAP[company.temperature]?.cls ?? "")}>{TEMP_MAP[company.temperature]?.label ?? company.temperature}</span>
                      : <span className="text-sm text-gray-400">{canInlineEdit ? "＋ 設定" : "-"}</span>}
                  </button>
                )}
              </Field>

              <Field label="次回アクション">
                {editing ? (
                  <input value={form.nextAction ?? ""} onChange={e => set("nextAction", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="例: 資料送付" />
                ) : inlineField === "nextAction" ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={inlineValue}
                      onChange={e => setInlineValue(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveInline("nextAction"); if (e.key === "Escape") cancelInline() }}
                      disabled={inlineSaving}
                      autoFocus
                      className="flex-1 border border-blue-400 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="例: 資料送付"
                    />
                    <button onClick={() => saveInline("nextAction")} disabled={inlineSaving} className="text-xs bg-blue-600 text-white rounded px-2 py-1.5 hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">{inlineSaving ? "..." : "保存"}</button>
                    <button onClick={cancelInline} className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap">取消</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => canInlineEdit && startInline("nextAction", company.nextAction ?? "")}
                    disabled={!canInlineEdit}
                    className={"text-left w-full " + (canInlineEdit ? "cursor-pointer hover:opacity-70" : "cursor-default")}
                  >
                    {company.nextAction
                      ? <span className="text-sm text-gray-900">{company.nextAction}</span>
                      : <span className="text-sm text-gray-400">{canInlineEdit ? "＋ 入力" : "-"}</span>}
                  </button>
                )}
              </Field>

              <Field label="次回アクション日">
                {editing ? (
                  <input type="date" value={form.nextActionDate?.slice(0, 10) ?? ""} onChange={e => set("nextActionDate", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                ) : inlineField === "nextActionDate" ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={inlineValue.slice(0, 10)}
                      onChange={e => saveInline("nextActionDate", e.target.value)}
                      disabled={inlineSaving}
                      autoFocus
                      className="border border-blue-400 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button onClick={cancelInline} className="text-xs text-gray-400 hover:text-gray-600">取消</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => canInlineEdit && startInline("nextActionDate", company.nextActionDate ?? "")}
                    disabled={!canInlineEdit}
                    className={"text-left w-full " + (canInlineEdit ? "cursor-pointer hover:opacity-70" : "cursor-default")}
                  >
                    {company.nextActionDate
                      ? <span className="text-sm text-gray-900">{company.nextActionDate.slice(0, 10)}</span>
                      : <span className="text-sm text-gray-400">{canInlineEdit ? "＋ 日付を設定" : "-"}</span>}
                  </button>
                )}
              </Field>
            </div>
            <Field label="商談メモ">
              {editing
                ? <textarea value={form.negotiationMemo ?? ""} onChange={e => set("negotiationMemo", e.target.value)} rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="商談の詳細を記録..." />
                : <p className="text-sm text-gray-900 whitespace-pre-wrap">{company.negotiationMemo ?? "-"}</p>}
            </Field>
          </div>

          {/* 人材紹介（キャリアアドバイザー向け） */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">🤝 人材紹介</h2>
              {editing ? (
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.hasReferralContract ?? false}
                    onChange={e => set("hasReferralContract", e.target.checked)}
                    className="w-4 h-4"
                  />
                  紹介契約あり
                </label>
              ) : (
                company.hasReferralContract
                  ? <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full font-medium">紹介契約あり</span>
                  : <span className="text-xs text-gray-400">紹介契約なし</span>
              )}
            </div>

            {/* 紹介単価 */}
            <div className="mb-5">
              <div className="text-xs text-gray-400 mb-2">紹介単価</div>
              {!editing && (company.referralFees ?? []).length === 0 && (
                <p className="text-sm text-gray-400">未登録</p>
              )}
              {(editing ? form.referralFees ?? [] : company.referralFees ?? []).map((fee, i) => (
                <div key={i} className="flex items-center gap-2 mb-1.5">
                  {editing ? (
                    <>
                      <input
                        value={fee.condition}
                        onChange={e => { const arr = [...(form.referralFees ?? [])]; arr[i] = { ...arr[i], condition: e.target.value }; set("referralFees", arr) }}
                        className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm text-gray-900"
                        placeholder="例: 〜39歳 / 経験者"
                      />
                      <input
                        type="number"
                        value={fee.amount ?? ""}
                        onChange={e => { const arr = [...(form.referralFees ?? [])]; arr[i] = { ...arr[i], amount: e.target.value === "" ? null : Number(e.target.value) }; set("referralFees", arr) }}
                        className="w-32 border border-gray-200 rounded px-2 py-1 text-sm text-right text-gray-900"
                        placeholder="金額"
                      />
                      <button type="button" onClick={() => set("referralFees", (form.referralFees ?? []).filter((_, j) => j !== i))} className="text-red-400 text-xs hover:text-red-600">削除</button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-gray-600 flex-1">{fee.condition || "-"}</span>
                      <span className="text-sm font-bold text-emerald-700">{fee.amount != null ? "¥" + fmt(fee.amount) : "-"}</span>
                    </>
                  )}
                </div>
              ))}
              {editing && (
                <button type="button" onClick={() => set("referralFees", [...(form.referralFees ?? []), { condition: "", amount: null }])} className="text-xs text-blue-600 hover:underline">＋ 単価を追加</button>
              )}
            </div>

            {/* 待遇・環境 */}
            <div className="mb-5 pt-4 border-t border-gray-100">
              <div className="text-xs font-medium text-gray-600 mb-3">待遇・環境</div>
              <div className="grid grid-cols-3 gap-4">
                {COND2_ENV.map(item => (
                  <Field key={item.key} label={item.label}>
                    {editing ? (
                      <select
                        value={formVal[item.key] === true ? "true" : formVal[item.key] === false ? "false" : ""}
                        onChange={e => set(item.key, e.target.value === "" ? null : e.target.value === "true")}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                      >
                        <option value="">未入力</option>
                        <option value="true">{item.yes}</option>
                        <option value="false">{item.no}</option>
                      </select>
                    ) : (
                      compVal[item.key] === true
                        ? <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-100 text-green-800">{item.yes}</span>
                        : compVal[item.key] === false
                          ? <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-600">{item.no}</span>
                          : <span className="text-sm text-gray-300">-</span>
                    )}
                  </Field>
                ))}
              </div>
            </div>

            {/* 受け入れ可否 */}
            <div className="mb-5 pt-4 border-t border-gray-100">
              <div className="text-xs font-medium text-gray-600 mb-3">受け入れ可否</div>
              <div className="grid grid-cols-4 gap-4">
                {COND3_ACCEPT.map(item => (
                  <Field key={item.key} label={item.label}>
                    {editing ? (
                      <select
                        value={(formVal[item.key] as string) ?? ""}
                        onChange={e => set(item.key, e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900"
                      >
                        {COND3_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      (() => {
                        const v = compVal[item.key] as string | null
                        return v && COND3_MAP[v]
                          ? <span className={"text-xs px-2 py-1 rounded-full font-medium " + COND3_MAP[v].cls}>{COND3_MAP[v].label}</span>
                          : <span className="text-sm text-gray-300">-</span>
                      })()
                    )}
                  </Field>
                ))}
              </div>
            </div>

            {/* 採用基準 */}
            <div className="mb-5 pt-4 border-t border-gray-100">
              <div className="text-xs font-medium text-gray-600 mb-3">採用基準</div>
              <div className="grid grid-cols-5 gap-4">
                {COND2_STANDARD.map(item => (
                  <Field key={item.key} label={item.label}>
                    {editing ? (
                      <select
                        value={formVal[item.key] === true ? "true" : formVal[item.key] === false ? "false" : ""}
                        onChange={e => set(item.key, e.target.value === "" ? null : e.target.value === "true")}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900"
                      >
                        <option value="">未入力</option>
                        <option value="true">{item.yes}</option>
                        <option value="false">{item.no}</option>
                      </select>
                    ) : (
                      compVal[item.key] === true
                        ? <span className="text-xs px-2 py-1 rounded-full font-medium bg-orange-100 text-orange-800">{item.yes}</span>
                        : compVal[item.key] === false
                          ? <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-600">{item.no}</span>
                          : <span className="text-sm text-gray-300">-</span>
                    )}
                  </Field>
                ))}
                {CONDTEXT_SHORT.map(item => (
                  <Field key={item.key} label={item.label}>
                    {editing ? (
                      <input
                        value={(formVal[item.key] as string) ?? ""}
                        onChange={e => set(item.key, e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900"
                        placeholder="例: 25〜60歳"
                      />
                    ) : (
                      <p className="text-sm text-gray-900">{(compVal[item.key] as string) || "-"}</p>
                    )}
                  </Field>
                ))}
              </div>
            </div>

            {/* 求める人物像・その他 */}
            <div className="pt-4 border-t border-gray-100">
              <div className="text-xs font-medium text-gray-600 mb-3">求める人物像・その他</div>
              <div className="grid grid-cols-2 gap-4">
                {CONDTEXT_LONG.map(item => (
                  <Field key={item.key} label={item.label}>
                    {editing ? (
                      <textarea
                        value={(formVal[item.key] as string) ?? ""}
                        onChange={e => set(item.key, e.target.value)}
                        rows={3}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                      />
                    ) : (
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{(compVal[item.key] as string) || "-"}</p>
                    )}
                  </Field>
                ))}
              </div>
            </div>
          </div>

          {/* メモ */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">メモ</h2>
            {editing
              ? <textarea value={form.memo ?? ""} onChange={e => set("memo", e.target.value)} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
              : <p className="text-sm text-gray-900 whitespace-pre-wrap">{company.memo ?? "-"}</p>}
          </div>

          {/* 制作案件 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">🎨 制作案件</h2>

            <div className="bg-gray-50 rounded-lg p-4 mb-5">
              <div className="text-xs font-medium text-gray-600 mb-3">制作依頼を起票</div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">案件名 <span className="text-red-400">*</span></label>
                  <input value={taskForm.name} onChange={e => setTaskForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="例: 求人LP新規制作" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">種別</label>
                  <select value={taskForm.type} onChange={e => setTaskForm(f => ({ ...f, type: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
                    <option value="new">新規</option>
                    <option value="revise">修正</option>
                    <option value="renewal">リニューアル</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">優先度</label>
                  <select value={taskForm.priority} onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">納期</label>
                  <input type="date" value={taskForm.dueDate} onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">メモ・依頼内容</label>
                  <textarea value={taskForm.memo} onChange={e => setTaskForm(f => ({ ...f, memo: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="制作担当への依頼内容・参考情報など" />
                </div>
              </div>
              <button onClick={handleCreateTask} disabled={taskLoading || !taskForm.name.trim()} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {taskLoading ? "起票中..." : "＋ 制作依頼を起票"}
              </button>
            </div>

            <div className="text-xs font-medium text-gray-600 mb-2">この企業の案件一覧（{tasks.length}件）</div>
            {tasks.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">まだ制作案件がありません</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">案件名</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">種別</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">優先度</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">ステータス</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">制作担当</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">納期</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tasks.map(t => (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-900 font-medium">
                          <a href={"/production/" + t.id} className="hover:text-blue-600 hover:underline">{t.name}</a>
                          {t.memo && <div className="text-xs text-gray-400 font-normal mt-0.5 whitespace-pre-wrap">{t.memo}</div>}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{TASK_TYPE_LABELS[t.type] ?? t.type}</td>
                        <td className="px-3 py-2">
                          <span className={"text-xs px-2 py-0.5 rounded-full font-medium " + (TASK_PRIORITY_LABELS[t.priority]?.cls ?? "")}>{TASK_PRIORITY_LABELS[t.priority]?.label ?? t.priority}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={"text-xs px-2 py-0.5 rounded-full font-medium " + (TASK_STATUS_LABELS[t.status]?.cls ?? "")}>{TASK_STATUS_LABELS[t.status]?.label ?? t.status}</span>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{t.assignee ? t.assignee.name : <span className="text-gray-300">未割当</span>}</td>
                        <td className="px-3 py-2 text-gray-600">{t.dueDate ? t.dueDate.slice(0, 10) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}