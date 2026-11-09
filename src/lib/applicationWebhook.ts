// 置き場所: src/lib/applicationWebhook.ts
// 応募通知API（転職道のシステム → 転職道DB）の受け取り処理。
// 仕様は「応募通知API 仕様書」を参照。ルート（route.ts）は認証と応答だけを担当し、中身はここに置く。

import { createHash, timingSafeEqual } from "crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { extractPref, UNKNOWN_PREF } from "@/lib/area"
import { normalizeCompanyId, parseAge, parseGender, parseLicense2 } from "@/lib/importApplications"

/** 受け付ける本文の最大サイズ（これを超えたら不正とみなす） */
export const MAX_BODY_BYTES = 20_000

/** 受け取る項目。これ以外のキーは保存しない（氏名・電話番号などが来ても捨てる） */
const ALLOWED_KEYS = [
  "applicationId", "companyId", "appliedAt", "entryType", "inflow", "status",
  "age", "gender", "license2", "prefecture", "sentAt",
] as const

// ===== 認証 =====

/**
 * Authorization: Bearer <トークン> を確認する。
 * トークンは環境変数 APPLICATION_WEBHOOK_TOKENS（カンマ区切りで複数可。入れ替え期間に新旧を両方受け付けるため）。
 * 比較は長さの差が出ないようハッシュ同士で行う。
 */
export function checkWebhookToken(authHeader: string | null): "ok" | "unauthorized" | "not_configured" {
  const tokens = (process.env.APPLICATION_WEBHOOK_TOKENS ?? "").split(",").map(t => t.trim()).filter(Boolean)
  if (tokens.length === 0) return "not_configured"
  const m = /^Bearer\s+(.+)$/.exec(authHeader ?? "")
  if (!m) return "unauthorized"
  const given = createHash("sha256").update(m[1].trim()).digest()
  for (const t of tokens) {
    const want = createHash("sha256").update(t).digest()
    if (timingSafeEqual(given, want)) return "ok"
  }
  return "unauthorized"
}

// ===== 日時 =====

/**
 * ISO 8601 の日時を、応募CSVの取り込みと同じ表し方の Date にする。
 * CSVの取り込み（parseAppliedAt）は「日本時間の年月日時分秒」を new Date(年, 月, 日, 時, 分, 秒) で作っている。
 * 同じ応募をCSVと通知で突き合わせるため、ここでも日本時間の値を取り出して同じ作り方にそろえる。
 * 時差の指定が無い場合は日本時間とみなす。
 */
export function parseIsoToJstWallClock(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(raw.trim())
  if (!m) return null
  let [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number)
  const offset = m[7]
  if (offset && offset !== "+09:00" && offset !== "+0900") {
    const instant = Date.parse(raw.trim())
    if (isNaN(instant)) return null
    const jst = new Date(instant + 9 * 60 * 60 * 1000)
    ;[y, mo, d, h, mi, s] = [jst.getUTCFullYear(), jst.getUTCMonth() + 1, jst.getUTCDate(), jst.getUTCHours(), jst.getUTCMinutes(), jst.getUTCSeconds()]
  }
  const date = new Date(y, mo - 1, d, h, mi, s)
  return isNaN(date.getTime()) ? null : date
}

// ===== 中身の確認 =====

export type WebhookPayload = {
  applicationId: string
  companyId: string
  appliedAt: Date
  entryType: string | null
  inflow: string
  status: string
  age: number | null
  gender: string | null
  hasLicense2: boolean | null
  applicantPref: string | null
}

function str(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === "string") return v.trim() || null
  if (typeof v === "number" && isFinite(v)) return String(v)
  return null
}

/** 本文を確認して、保存する形に直す。問題があれば理由を返す */
export function parseWebhookBody(body: unknown):
  { ok: true; payload: WebhookPayload; ignoredKeys: string[] } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "本文はJSONのオブジェクトで送ってください" }
  }
  const b = body as Record<string, unknown>
  const ignoredKeys = Object.keys(b).filter(k => !(ALLOWED_KEYS as readonly string[]).includes(k))

  const applicationId = str(b.applicationId)
  if (!applicationId || applicationId.length > 64) {
    return { ok: false, error: "applicationId は必須です（64文字以内）" }
  }
  const companyId = normalizeCompanyId(str(b.companyId) ?? "")
  if (!companyId) return { ok: false, error: "companyId は必須です" }

  const appliedRaw = str(b.appliedAt)
  const appliedAt = appliedRaw ? parseIsoToJstWallClock(appliedRaw) : null
  if (!appliedAt) {
    return { ok: false, error: "appliedAt は必須です（例: 2026-11-10T09:12:00+09:00）" }
  }

  const pref = b.prefecture == null ? UNKNOWN_PREF : extractPref(str(b.prefecture) ?? "")
  const license = b.license2
  const hasLicense2 = typeof license === "boolean" ? license : parseLicense2(str(license) ?? "")

  return {
    ok: true,
    ignoredKeys,
    payload: {
      applicationId,
      companyId,
      appliedAt,
      entryType: str(b.entryType),
      inflow: str(b.inflow) ?? "未設定",
      status: str(b.status) ?? "",
      age: b.age == null ? null : parseAge(str(b.age) ?? ""),
      gender: parseGender(str(b.gender) ?? ""),
      hasLicense2,
      applicantPref: pref === UNKNOWN_PREF ? null : pref,
    },
  }
}

// ===== 保存 =====

export type SaveResult = "created" | "duplicate" | "linked"

/**
 * 応募を保存する。
 * - 同じ応募IDがすでにあれば何もしない（再送への対応。CSVで更新された値を古い通知で上書きしない）
 * - 応募IDが無い同じ応募（企業ID・応募日時・流入が一致）がCSVから入っていれば、応募IDだけ付ける
 * - どちらでもなければ新しく作る
 */
export async function saveWebhookApplication(p: WebhookPayload): Promise<SaveResult> {
  const byId = await prisma.applicationRecord.findUnique({ where: { externalId: p.applicationId }, select: { id: true } })
  if (byId) return "duplicate"

  const byTriple = await prisma.applicationRecord.findUnique({
    where: { uniqueApplication: { sourceCompanyId: p.companyId, appliedAt: p.appliedAt, inflow: p.inflow } },
    select: { id: true, externalId: true },
  })
  if (byTriple) {
    if (byTriple.externalId) return "duplicate"
    await prisma.applicationRecord.update({ where: { id: byTriple.id }, data: { externalId: p.applicationId } })
    return "linked"
  }

  const company = await prisma.company.findUnique({ where: { companyId: p.companyId }, select: { id: true } })

  try {
    await prisma.applicationRecord.create({
      data: {
        externalId: p.applicationId,
        source: "webhook",
        sourceCompanyId: p.companyId,
        companyRef: company?.id ?? null,
        appliedAt: p.appliedAt,
        year: p.appliedAt.getFullYear(),
        month: p.appliedAt.getMonth() + 1,
        status: p.status,
        inflow: p.inflow,
        entryType: p.entryType,
        age: p.age,
        gender: p.gender,
        hasLicense2: p.hasLicense2,
        // 届いた直後の応募は企業がまだ開いていない。TEL応募は開封の概念がないので判定の対象外
        companyOpened: p.entryType === "TEL応募" ? null : false,
        applicantPref: p.applicantPref,
      },
    })
    return "created"
  } catch (e) {
    // 同じ応募の再送がほぼ同時に届いた場合など
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "duplicate"
    throw e
  }
}
