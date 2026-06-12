"use client"
import Sidebar from "@/components/Sidebar"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

type CompetitorMedia = { name: string; monthly: number | null; costPerHire: number | null; note: string }
type Option = { name: string; amount: number }
type User = { id: string; name: string }

const ALL_SHIFTS = ["日勤", "夜勤", "隔日勤務", "その他"]
const ALL_APPS = ["GO", "Uber Taxi", "S.RIDE", "DiDi", "自社アプリ"]

function fmt(n: number) {
  return Number(n).toLocaleString("ja-JP")
}

export default function NewCompanyPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [userName, setUserName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState({
    name: "",
    companyId: "",
    status: "approaching",
    userId: "",
    phone: "",
    address: "",
    vehicleCount: "",
    driverCount: "",
    annualHiringTarget: "",
    adoptionChallenge: "",
    apps: [] as string[],
    dispatchRatio: "",
    shifts: [] as string[],
    competitorMedia: [] as CompetitorMedia[],
    tenshokudoCostPerHire: "",
    planName: "",
    monthlyFee: "",
    discountRate: "",
    discountNote: "",
    options: [] as Option[],
    contractStart: "",
    contractRenewal: "",
    temperature: "",
    negotiationMemo: "",
    nextAction: "",
    nextActionDate: "",
    applyCount: 0,
    hireCount: 0,
    memo: "",
  })

  useEffect(() => {
    fetch("/api/users").then(r => r.json()).then((data: User[]) => {
      setUsers(data)
      if (data.length > 0) setForm(f => ({ ...f, userId: data[0].id }))
    })
    fetch("/api/auth/session").then(r => r.json()).then(s => setUserName(s?.user?.name ?? ""))
  }, [])

  const set = (key: string, val: unknown) => setForm(f => ({ ...f, [key]: val }))

  const annualBase = Number(form.monthlyFee || 0) * 12
  const discountAmt = Math.round(annualBase * (Number(form.discountRate || 0) / 100))
  const optionTotal = form.options.reduce((s, o) => s + (Number(o.amount) || 0), 0)
  const totalRevenue = annualBase - discountAmt + optionTotal

  const handleSubmit = async () => {
    if (!form.name) { setError("企業名は必須です"); return }
    if (!form.userId) { setError("担当者を選択してください"); return }
    setLoading(true)
    setError("")
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        vehicleCount: form.vehicleCount ? Number(form.vehicleCount) : null,
        driverCount: form.driverCount ? Number(form.driverCount) : null,
        annualHiringTarget: form.annualHiringTarget ? Number(form.annualHiringTarget) : null,
        tenshokudoCostPerHire: form.tenshokudoCostPerHire ? Number(form.tenshokudoCostPerHire) : null,
        monthlyFee: form.monthlyFee ? Number(form.monthlyFee) : null,
        discountRate: form.discountRate ? Number(form.discountRate) : null,
        contractStart: form.contractStart || null,
        contractRenewal: form.contractRenewal || null,
        nextActionDate: form.nextActionDate || null,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      router.push(`/companies/${data.id}`)
    } else {
      const data = await res.json()
      setError(data.error ?? "エラーが発生しました")
    }
    setLoading(false)
  }

  const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      {children}
    </div>
  )

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userName={userName} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-5xl">
          <div className="flex items-center gap-3 mb-6">
            <a href="/companies" className="text-sm text-gray-400 hover:text-gray-600">← 企業一覧</a>
            <span className="text-gray-300">/</span>
            <h1 className="text-xl font-bold text-gray-800">企業追加</h1>
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-700">{error}</div>}

          {/* 基本情報 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">基本情報</h2>
            <div className="grid grid-cols-3 gap-4">
              <Field label="企業名" required>
                <input value={form.name} onChange={e => set("name", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="例：株式会社〇〇運輸" />
              </Field>
              <Field label="企業ID">
                <input value={form.companyId} onChange={e => set("companyId", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="例：12345" />
              </Field>
              <Field label="ステータス">
                <select value={form.status} onChange={e => set("status", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="approaching">📋 アプローチ中</option>
                  <option value="contracted">✅ 契約中</option>
                  <option value="delisted">📉 掲載落ち</option>
                </select>
              </Field>
              <Field label="担当者" required>
                <select value={form.userId} onChange={e => set("userId", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
              <Field label="電話番号">
                <input value={form.phone} onChange={e => set("phone", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="例：03-1234-5678" />
              </Field>
              <Field label="住所">
                <input value={form.address} onChange={e => set("address", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="例：東京都渋谷区〇〇" />
              </Field>
              <Field label="保有車両数">
                <input type="number" value={form.vehicleCount} onChange={e => set("vehicleCount", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="例：45" />
              </Field>
              <Field label="ドライバー数">
                <input type="number" value={form.driverCount} onChange={e => set("driverCount", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="例：38" />
              </Field>
              <Field label="年間採用目標">
                <input type="number" value={form.annualHiringTarget} onChange={e => set("annualHiringTarget", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="例：12" />
              </Field>
            </div>
          </div>

          {/* 採用課題・アプリ */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">採用課題</h2>
              <textarea value={form.adoptionChallenge} onChange={e => set("adoptionChallenge", e.target.value)} rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="採用における課題を記録..." />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">導入アプリ・配車割合</h2>
              <div className="mb-3">
                <div className="text-xs text-gray-400 mb-2">導入アプリ</div>
                <div className="flex flex-wrap gap-2">
                  {ALL_APPS.map(app => {
                    const sel = form.apps.includes(app)
                    return (
                      <button key={app} type="button" onClick={() => set("apps", sel ? form.apps.filter(a => a !== app) : [...form.apps, app])}
                        className={`text-xs px-3 py-1 rounded-full border transition-colors ${sel ? "bg-blue-100 text-blue-800 border-blue-300" : "bg-gray-50 text-gray-500 border-gray-200"}`}>{app}</button>
                    )
                  })}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">配車割合</div>
                <input value={form.dispatchRatio} onChange={e => set("dispatchRatio", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="例: GO 60% / Uber 40%" />
              </div>
            </div>
          </div>

          {/* 募集勤務形態 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">募集勤務形態</h2>
            <div className="flex gap-2 flex-wrap">
              {ALL_SHIFTS.map(s => {
                const sel = form.shifts.includes(s)
                return (
                  <button key={s} type="button" onClick={() => set("shifts", sel ? form.shifts.filter(x => x !== s) : [...form.shifts, s])}
                    className={`text-sm px-4 py-1.5 rounded-full border transition-colors ${sel ? "bg-blue-100 text-blue-800 border-blue-300" : "bg-gray-50 text-gray-500 border-gray-200"}`}>{s}</button>
                )
              })}
            </div>
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
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {form.competitorMedia.map((m, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2"><input value={m.name} onChange={e => { const arr = [...form.competitorMedia]; arr[i] = { ...arr[i], name: e.target.value }; set("competitorMedia", arr) }} className="w-full border border-gray-200 rounded px-2 py-1 text-xs" /></td>
                    <td className="px-3 py-2"><input type="number" value={m.monthly ?? ""} onChange={e => { const arr = [...form.competitorMedia]; arr[i] = { ...arr[i], monthly: Number(e.target.value) }; set("competitorMedia", arr) }} className="w-24 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="円" /></td>
                    <td className="px-3 py-2"><input type="number" value={m.costPerHire ?? ""} onChange={e => { const arr = [...form.competitorMedia]; arr[i] = { ...arr[i], costPerHire: Number(e.target.value) }; set("competitorMedia", arr) }} className="w-28 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="円" /></td>
                    <td className="px-3 py-2"><input value={m.note} onChange={e => { const arr = [...form.competitorMedia]; arr[i] = { ...arr[i], note: e.target.value }; set("competitorMedia", arr) }} className="w-full border border-gray-200 rounded px-2 py-1 text-xs" /></td>
                    <td className="px-3 py-2"><button type="button" onClick={() => set("competitorMedia", form.competitorMedia.filter((_, j) => j !== i))} className="text-red-400 text-xs hover:text-red-600">削除</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={() => set("competitorMedia", [...form.competitorMedia, { name: "", monthly: null, costPerHire: null, note: "" }])} className="text-xs text-blue-600 hover:underline">＋ 媒体を追加</button>
            <div className="mt-3 flex items-center gap-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">転職道の採用単価：</span>
              <input type="number" value={form.tenshokudoCostPerHire} onChange={e => set("tenshokudoCostPerHire", e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36" placeholder="円" />
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
                    <select value={form.planName} onChange={e => set("planName", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      <option value="">未設定</option>
                      <option>ライト</option><option>スタンダード</option><option>ハイグレード</option>
                    </select>
                  </Field>
                  <Field label="月額掲載料">
                    <input type="number" value={form.monthlyFee} onChange={e => set("monthlyFee", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="円" />
                  </Field>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-xs text-gray-500">年間掲載料（基本）</span>
                  <span className="text-sm font-medium">¥{fmt(annualBase)}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">割引率</span>
                    <input type="number" value={form.discountRate} onChange={e => set("discountRate", e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-xs w-16" placeholder="%" />
                  </div>
                  <span className="text-sm text-red-500 font-medium">－ ¥{fmt(discountAmt)}</span>
                </div>
                <div className="py-2 border-b border-gray-100">
                  <div className="text-xs text-gray-400 mb-2">オプション（追加広告等）</div>
                  {form.options.map((op, i) => (
                    <div key={i} className="flex items-center justify-between mb-1.5">
                      <input value={op.name} onChange={e => { const arr = [...form.options]; arr[i] = { ...arr[i], name: e.target.value }; set("options", arr) }} className="border border-gray-200 rounded px-2 py-1 text-xs flex-1 mr-2" placeholder="オプション名" />
                      <input type="number" value={op.amount} onChange={e => { const arr = [...form.options]; arr[i] = { ...arr[i], amount: Number(e.target.value) }; set("options", arr) }} className="border border-gray-200 rounded px-2 py-1 text-xs w-28 mr-2" placeholder="金額" />
                      <button type="button" onClick={() => set("options", form.options.filter((_, j) => j !== i))} className="text-red-400 text-xs">削除</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => set("options", [...form.options, { name: "", amount: 0 }])} className="text-xs text-blue-600 hover:underline">＋ オプション追加</button>
                </div>
                <Field label="割引備考">
                  <input value={form.discountNote} onChange={e => set("discountNote", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="例: 3年契約5%OFF" />
                </Field>
              </div>
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-xs text-gray-400 mb-3">契約期間</div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="契約開始日">
                      <input type="date" value={form.contractStart} onChange={e => set("contractStart", e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                    </Field>
                    <Field label="次回更新日">
                      <input type="date" value={form.contractRenewal} onChange={e => set("contractRenewal", e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                    </Field>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 商談情報 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">商談情報</h2>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Field label="温度感">
                <select value={form.temperature} onChange={e => set("temperature", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">未設定</option>
                  <option value="hot">🔥 ホット</option>
                  <option value="warm">☀️ ウォーム</option>
                  <option value="cold">❄️ コールド</option>
                </select>
              </Field>
              <Field label="次回アクション">
                <input value={form.nextAction} onChange={e => set("nextAction", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="例: 資料送付" />
              </Field>
              <Field label="次回アクション日">
                <input type="date" value={form.nextActionDate} onChange={e => set("nextActionDate", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </Field>
            </div>
            <Field label="商談メモ">
              <textarea value={form.negotiationMemo} onChange={e => set("negotiationMemo", e.target.value)} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="商談の詳細を記録..." />
            </Field>
          </div>

          {/* メモ */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">メモ</h2>
            <textarea value={form.memo} onChange={e => set("memo", e.target.value)} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="自由メモ..." />
          </div>

          <div className="flex gap-2 mb-8">
            <a href="/companies" className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">キャンセル</a>
            <button onClick={handleSubmit} disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {loading ? "登録中..." : "✅ 登録する"}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}