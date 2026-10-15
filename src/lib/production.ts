// 置き場所: src/lib/production.ts
// 制作タスクの共通定義（画面・APIの両方から使う）

/** 分類。記事制作だけが企業必須・営業依頼の流れ（営業確認・企業確認・公開）を持つ */
export const CATEGORY_OPTIONS = [
  { value: "article", label: "記事制作" },
  { value: "hp_lp", label: "HP・LP" },
  { value: "dev", label: "開発" },
  { value: "document", label: "資料作成" },
  { value: "subsidy", label: "助成金" },
  { value: "other", label: "その他" },
] as const

export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map(o => [o.value, o.label]),
)

/** 記事制作の種別 */
export const TYPE_OPTIONS = [
  { value: "new", label: "新規" },
  { value: "light", label: "新規ライト" },
  { value: "revise", label: "修正" },
  { value: "renewal", label: "リニューアル" },
] as const

export const TYPE_LABELS: Record<string, string> = {
  ...Object.fromEntries(TYPE_OPTIONS.map(o => [o.value, o.label])),
  other: "—",
}

export const PRIORITY_OPTIONS = [
  { value: "high", label: "高", cls: "bg-red-100 text-red-700" },
  { value: "medium", label: "中", cls: "bg-yellow-100 text-yellow-700" },
  { value: "low", label: "低", cls: "bg-gray-100 text-gray-600" },
] as const

export const PRIORITY_LABELS: Record<string, { label: string; cls: string }> = Object.fromEntries(
  PRIORITY_OPTIONS.map(o => [o.value, { label: o.label, cls: o.cls }]),
)

export const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  not_started: { label: "未着手", cls: "bg-gray-100 text-gray-600" },
  in_progress: { label: "対応中", cls: "bg-blue-100 text-blue-700" },
  submitted: { label: "提出済", cls: "bg-purple-100 text-purple-700" },
  sales_review: { label: "営業確認中", cls: "bg-purple-100 text-purple-700" },
  client_review: { label: "企業確認中", cls: "bg-indigo-100 text-indigo-700" },
  published: { label: "公開", cls: "bg-green-100 text-green-700" },
  completed: { label: "完了", cls: "bg-emerald-100 text-emerald-800" },
  paused: { label: "一時停止中", cls: "bg-orange-100 text-orange-700" },
  stopped: { label: "停止・アーカイブ", cls: "bg-gray-200 text-gray-500" },
}

/** 分類ごとに選べるステータス */
export function statusOptionsFor(category: string): string[] {
  if (category === "article") {
    return ["not_started", "in_progress", "sales_review", "client_review", "published", "completed", "paused", "stopped"]
  }
  return ["not_started", "in_progress", "submitted", "completed", "paused", "stopped"]
}

export const ALL_STATUSES = Object.keys(STATUS_LABELS)

/** ダッシュボードの列 */
export const BOARD_COLUMNS = [
  { key: "todo", label: "未着手", statuses: ["not_started"] },
  { key: "doing", label: "対応中", statuses: ["in_progress", "paused"] },
  { key: "review", label: "確認待ち", statuses: ["submitted", "sales_review", "client_review"] },
  { key: "done", label: "公開・完了", statuses: ["published", "completed"] },
] as const

/** 確認待ちのとき、誰の返事待ちか */
export function waitingFor(status: string): string | null {
  if (status === "sales_review") return "営業の確認待ち"
  if (status === "client_review") return "企業の確認待ち"
  if (status === "submitted") return "確認待ち"
  return null
}

/** 終わった扱いのステータス（滞留・納期のアラート対象外） */
export const FINISHED_STATUSES = ["published", "completed", "stopped"]
