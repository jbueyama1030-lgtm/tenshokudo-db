// 置き場所: src/app/api/companies/export/route.ts
import { auth } from "@/auth"
import { buildCompanyList } from "@/lib/companyList"

const STATUS_LABEL: Record<string, string> = {
  contracted: "契約中",
  referral_only: "人材紹介のみ",
  approaching: "アプローチ中",
  delisted: "掲載落ち",
}

function esc(v: unknown): string {
  const s = v == null ? "" : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function ymd(iso: string | null): string {
  return iso ? new Date(new Date(iso).getTime() + 9 * 3600000).toISOString().slice(0, 10) : ""
}

/**
 * 企業一覧の CSV 書き出し。企業一覧と同じクエリ（user / status / q / focus）で絞り込んだまま出す。
 * ids=カンマ区切りの企業ID（cuid）を渡すと、選択した企業だけを出す。
 * 代理店ユーザーは自代理店の企業だけ。
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session) return new Response("Unauthorized", { status: 401 })

  const sp = new URL(req.url).searchParams
  const rows = await buildCompanyList(session, {
    user: sp.get("user") ?? "all",
    status: sp.get("status") ?? "all",
    q: sp.get("q") ?? "",
    focus: sp.get("focus") ?? "",
    ids: sp.get("ids") ? sp.get("ids")!.split(",").filter(Boolean) : undefined,
  })

  const header = ["企業ID", "会社名", "都道府県", "電話番号", "ステータス", "担当者", "直近3か月の応募", "直近3か月の入社", "最終応募日", "次回アクション", "次回アクション日", "契約更新日", "要対応"]
  const lines = [header.join(",")]
  for (const r of rows) {
    lines.push([
      r.companyId, r.name, r.prefecture, r.phone, STATUS_LABEL[r.status] ?? r.status, r.userName,
      r.apply3m, r.hire3m, ymd(r.lastAppliedAt), r.nextAction, ymd(r.nextActionDate), ymd(r.renewalDate),
      r.flags.filter(f => f.level !== "gray").map(f => f.label).join(" / "),
    ].map(esc).join(","))
  }

  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
  return new Response("\uFEFF" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="companies-${today}.csv"`,
    },
  })
}
