// 置き場所: src/lib/importApplications.ts
import { PrismaClient } from "@prisma/client"
import { createHash } from "crypto"
import { extractPref, UNKNOWN_PREF } from "@/lib/area"

/**
 * 応募明細CSVの取り込み。
 *
 * 【方式】差分で更新する
 * CSVの各行を既存の応募と突き合わせ、無ければ追加、変わっていれば更新する。
 * 突き合わせは「応募ID」列があればそれで、無ければ（企業ID・応募日時・流入）で行う。
 * 応募のステータスは後から変わる（未対応→面接設定済み→入社）ので、毎回最新の値で上書きする。
 * 応募のIDが変わらないため、架電の記録などを応募にひもづけられる。
 *
 * CSVに含まれる年月のうち、CSVから消えた応募は削除する（管理画面で重複などを消した場合）。
 * ただし作られてから PROTECT_RECENT_MS 以内の応募は消さない。
 * 応募通知APIで先に入った応募が、まだCSVに載っていないだけの場合があるため。
 *
 * 【個人情報】
 * 電話番号は保存しない。ソルト付きSHA-256のハッシュのみ保存し、
 * UU（実人数）の名寄せにだけ使う。ハッシュから電話番号は復元できない。
 * ソルトは環境変数 PHONE_HASH_SALT。変更しても、次の取り込みで全件のハッシュが新しい値に更新される。
 *
 * 応募者の属性は集計に必要な最小限だけ保存する：
 * 年齢（数字）・性別・二種の有無・企業開封の有無・都道府県（住所から都道府県だけ）。
 * 氏名・生年月日・住所そのもの・メールアドレス・志望動機・メモは保存しない。
 *
 * 【安全装置】
 * 取り込み後の件数が既存より大幅に減る場合は中断する。
 * CSVが不完全な状態で来たときに既存データを失わないため。
 */

// 取り込み後の件数がこの割合を下回ったら中断（0.8 = 2割以上減ったら異常とみなす）
const SHRINK_GUARD_RATIO = 0.8

// createMany の1回あたりの件数
const BATCH_SIZE = 5000

// CSVから消えていても削除しない猶予（通知APIで先に入り、まだCSVに載っていない応募を守る）
const PROTECT_RECENT_MS = 3 * 60 * 60 * 1000

export type ImportResult = {
  success: number     // CSVの行のうち、DBに反映できた件数（追加＋更新＋変更なし）
  created: number     // 新しく追加した件数
  updated: number     // 既存の応募を更新した件数（ステータスの変化など）
  skip: number
  error: number
  shifted: number
  unmatched: number
  deleted: number
  hashed: number      // 電話番号ハッシュを付与できた件数
  withAge: number     // 年齢を取り込めた件数
  aborted?: string    // 中断した場合の理由
}

/** CSVを1行ずつ配列にパース（ダブルクォート対応の簡易パーサ） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += c
      }
    } else {
      if (c === '"') inQuotes = true
      else if (c === ",") { cur.push(field); field = "" }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = "" }
      else if (c === "\r") { /* skip */ }
      else field += c
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur) }
  return rows
}

/** バイト列を文字コード自動判定でテキスト化（UTF-8優先、化けたらShift-JIS） */
export function decodeCsv(buf: ArrayBuffer | Buffer): string {
  const bytes = buf instanceof Buffer ? new Uint8Array(buf) : new Uint8Array(buf)
  let text = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "")
  const badCount = (text.match(/\uFFFD/g) || []).length
  if (badCount > 5) {
    try {
      text = new TextDecoder("shift-jis").decode(bytes).replace(/^\uFEFF/, "")
    } catch { /* shift-jis 未対応環境ならそのまま */ }
  }
  return text
}

/** 応募日文字列をパース：「2026/07/16(木)14:20:02」「2026/07/16(木)14:20」両対応 */
export function parseAppliedAt(raw: string): Date | null {
  if (!raw) return null
  const cleaned = raw.replace(/\([^)]*\)/g, " ").trim()
  const m = cleaned.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  const date = new Date(
    Number(y), Number(mo) - 1, Number(d),
    Number(h), Number(mi), s ? Number(s) : 0
  )
  return isNaN(date.getTime()) ? null : date
}

/** 企業ID正規化：全角→半角、.0除去、前後空白除去 */
export function normalizeCompanyId(raw: string): string {
  if (!raw) return ""
  let s = String(raw).trim()
  s = s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  if (/^\d+\.0+$/.test(s)) s = s.split(".")[0]
  return s
}

/**
 * 電話番号をハッシュ化する。
 * 全角→半角に直し、数字以外（ハイフン・空白・括弧）を除いてから
 * ソルトを付けてSHA-256にかける。元の番号は保存しない。
 * 桁数が明らかに足りないものは null（名寄せに使えないため）。
 */
export function hashPhone(raw: string): string | null {
  if (!raw) return null
  const salt = process.env.PHONE_HASH_SALT
  if (!salt) return null

  let s = String(raw).trim()
  s = s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  const digits = s.replace(/\D/g, "")
  if (digits.length < 9) return null

  return createHash("sha256").update(digits + salt).digest("hex")
}

/** 年齢: 数字だけ取り出し、15〜100歳の範囲外は null */
export function parseAge(raw: string): number | null {
  if (!raw) return null
  const s = String(raw).replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/\D/g, "")
  if (!s) return null
  const n = Number(s)
  return n >= 15 && n <= 100 ? n : null
}

/** 性別: 男性／女性のみ。それ以外は null */
export function parseGender(raw: string): string | null {
  const s = (raw ?? "").trim()
  if (s.startsWith("男")) return "男性"
  if (s.startsWith("女")) return "女性"
  return null
}

/** 二種: 有り=true / 無し=false / それ以外=null */
export function parseLicense2(raw: string): boolean | null {
  const s = (raw ?? "").trim()
  if (!s) return null
  if (s.includes("有")) return true
  if (s.includes("無")) return false
  return null
}

/** 企業開封: 開封済=true / 未開封=false / それ以外=null */
export function parseOpened(raw: string): boolean | null {
  const s = (raw ?? "").trim()
  if (s === "開封済") return true
  if (s === "未開封") return false
  return null
}

type Parsed = {
  externalId: string | null
  sourceCompanyId: string
  appliedAt: Date
  status: string
  inflow: string
  entryType: string | null
  phoneHash: string | null
  age: number | null
  gender: string | null
  hasLicense2: boolean | null
  companyOpened: boolean | null
  applicantPref: string | null
  companyRef: string | null
  year: number
  month: number
}

/** 突き合わせ用のキー（企業ID・応募日時・流入）。DBの uniqueApplication と同じ組み合わせ */
function tripleKey(sourceCompanyId: string, appliedAt: Date, inflow: string): string {
  return sourceCompanyId + "|" + appliedAt.getTime() + "|" + inflow
}

/** 更新の対象にする項目（CSVの値で上書きする） */
const SYNC_FIELDS = [
  "externalId", "sourceCompanyId", "appliedAt", "year", "month", "status", "inflow", "entryType",
  "phoneHash", "age", "gender", "hasLicense2", "companyOpened", "applicantPref", "companyRef",
] as const

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  return (a ?? null) === (b ?? null)
}

/**
 * CSVテキストを取り込む。
 * skipGuard = true で件数チェックを無効化（手動で意図的に少量を入れる場合）。
 */
export async function importApplicationsCsv(
  prisma: PrismaClient,
  csvText: string,
  options: { skipGuard?: boolean } = {}
): Promise<ImportResult> {
  const results: ImportResult = {
    success: 0, created: 0, updated: 0, skip: 0, error: 0, shifted: 0, unmatched: 0, deleted: 0, hashed: 0, withAge: 0,
  }
  const runAt = Date.now()

  const parsedCsv = parseCsv(csvText)
  if (parsedCsv.length < 2) {
    return { ...results, aborted: "データ行が見つかりません" }
  }

  const header = parsedCsv[0].map(h => h.trim())
  const iDate = header.indexOf("応募日")
  const iCompanyId = header.indexOf("企業ID")
  const iStatus = header.indexOf("ステータス")
  const iInflow = header.indexOf("流入")
  // 応募IDは無くても取り込めるようにする（開発会社の対応前のCSVとの互換）
  const iAppId = header.indexOf("応募ID")
  // 種別・電話番号は無くても取り込めるようにする（旧CSVとの互換）
  const iEntryType = header.indexOf("種別")
  const iPhone = header.indexOf("電話番号")
  // 応募者の属性（無くても取り込める）
  const iAge = header.indexOf("年齢")
  const iGender = header.indexOf("性別")
  const iLicense2 = header.indexOf("二種")
  const iOpened = header.indexOf("企業開封")
  const iAddress = header.indexOf("住所")

  if (iDate < 0 || iCompanyId < 0 || iStatus < 0 || iInflow < 0) {
    return { ...results, aborted: "必要な列（応募日 / 企業ID / ステータス / 流入）が見つかりません" }
  }

  // 企業マスタ（companyId → Company.id）
  const companies = await prisma.company.findMany({ select: { id: true, companyId: true } })
  const companyMap: Record<string, string> = {}
  companies.forEach(c => { if (c.companyId) companyMap[c.companyId] = c.id })

  // --- パース ---
  const parsed: Parsed[] = []
  const monthsInCsv = new Set<string>()

  for (const r of parsedCsv.slice(1)) {
    if (r.length <= iDate) continue
    const rawDate = (r[iDate] ?? "").trim()
    const sourceCompanyId = normalizeCompanyId((r[iCompanyId] ?? "").trim())
    if (!rawDate && !sourceCompanyId) continue

    const externalId = iAppId >= 0 ? ((r[iAppId] ?? "").trim() || null) : null
    const status = (r[iStatus] ?? "").trim()
    const inflow = (r[iInflow] ?? "").trim() || "未設定"
    const entryType = iEntryType >= 0 ? ((r[iEntryType] ?? "").trim() || null) : null
    const phoneHash = iPhone >= 0 ? hashPhone((r[iPhone] ?? "").trim()) : null
    const appliedAt = parseAppliedAt(rawDate)
    const age = iAge >= 0 ? parseAge(r[iAge] ?? "") : null
    const gender = iGender >= 0 ? parseGender(r[iGender] ?? "") : null
    const hasLicense2 = iLicense2 >= 0 ? parseLicense2(r[iLicense2] ?? "") : null
    // TEL応募は管理画面で「開く」操作がないため、CSVでは常に「未開封」になる。
    // 開封の判定には使えないので保存しない（null＝判定の対象外）。
    const companyOpened = iOpened >= 0 && entryType !== "TEL応募" ? parseOpened(r[iOpened] ?? "") : null
    const pref = iAddress >= 0 ? extractPref(r[iAddress] ?? "") : UNKNOWN_PREF
    const applicantPref = pref === UNKNOWN_PREF ? null : pref

    if (!rawDate || !sourceCompanyId || !appliedAt) { results.skip++; continue }

    const year = appliedAt.getFullYear()
    const month = appliedAt.getMonth() + 1
    monthsInCsv.add(year + "-" + month)

    const companyRef = companyMap[sourceCompanyId] ?? null
    if (!companyRef) results.unmatched++
    if (phoneHash) results.hashed++
    if (age != null) results.withAge++

    parsed.push({
      externalId, sourceCompanyId, appliedAt, status, inflow, entryType, phoneHash,
      age, gender, hasLicense2, companyOpened, applicantPref,
      companyRef, year, month,
    })
  }

  if (parsed.length === 0) {
    return { ...results, aborted: "取り込める行がありませんでした" }
  }

  // --- 安全装置：既存データが大幅に減る場合は中断 ---
  const targetMonths = Array.from(monthsInCsv).map(ym => {
    const [y, m] = ym.split("-").map(Number)
    return { year: y, month: m }
  })

  if (!options.skipGuard) {
    const existing = await prisma.applicationRecord.count({ where: { OR: targetMonths } })
    if (existing > 0 && parsed.length < existing * SHRINK_GUARD_RATIO) {
      return {
        ...results,
        aborted:
          "件数が大幅に減少しているため中断しました（既存 " + existing +
          " 件 → CSV " + parsed.length + " 件）。CSVが不完全な可能性があります。",
      }
    }
  }

  // --- 秒ずらし（同一キーの衝突をメモリ上で解決。CSVの並び順が同じなら毎回同じ結果になる） ---
  const usedKeys = new Set<string>()
  for (const p of parsed) {
    let keyStr = tripleKey(p.sourceCompanyId, p.appliedAt, p.inflow)
    while (usedKeys.has(keyStr)) {
      p.appliedAt = new Date(p.appliedAt.getTime() + 1000)
      p.year = p.appliedAt.getFullYear()
      p.month = p.appliedAt.getMonth() + 1
      keyStr = tripleKey(p.sourceCompanyId, p.appliedAt, p.inflow)
      results.shifted++
    }
    usedKeys.add(keyStr)
  }

  // --- 既存の応募を読み込んで突き合わせる ---
  const existingRows = await prisma.applicationRecord.findMany({
    where: { OR: targetMonths },
    select: {
      id: true, createdAt: true,
      externalId: true, sourceCompanyId: true, appliedAt: true, year: true, month: true, status: true,
      inflow: true, entryType: true, phoneHash: true, age: true, gender: true, hasLicense2: true,
      companyOpened: true, applicantPref: true, companyRef: true,
    },
  })
  type Existing = (typeof existingRows)[number]
  const byExternalId = new Map<string, Existing>()
  const byTriple = new Map<string, Existing>()
  for (const e of existingRows) {
    if (e.externalId) byExternalId.set(e.externalId, e)
    byTriple.set(tripleKey(e.sourceCompanyId, e.appliedAt, e.inflow), e)
  }

  const seenIds = new Set<string>()
  const toCreate: Parsed[] = []
  const toUpdate: { id: string; data: Record<string, unknown> }[] = []

  for (const p of parsed) {
    const found =
      (p.externalId ? byExternalId.get(p.externalId) : undefined) ??
      byTriple.get(tripleKey(p.sourceCompanyId, p.appliedAt, p.inflow))

    if (!found || seenIds.has(found.id)) { toCreate.push(p); continue }
    seenIds.add(found.id)

    const data: Record<string, unknown> = {}
    for (const f of SYNC_FIELDS) {
      const next = p[f]
      // 応募IDは、CSVに無い（null）ときに既存の値を消さない
      if (f === "externalId" && next == null) continue
      if (!sameValue(found[f], next)) data[f] = next
    }
    if (Object.keys(data).length > 0) toUpdate.push({ id: found.id, data })
    else results.success++
  }

  // --- 更新（ふだんはステータスが変わった応募だけなので少ない） ---
  for (const u of toUpdate) {
    try {
      await prisma.applicationRecord.update({ where: { id: u.id }, data: u.data })
      results.updated++
      results.success++
    } catch {
      results.error++
    }
  }

  // --- 追加 ---
  for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
    const chunk = toCreate.slice(i, i + BATCH_SIZE)
    try {
      const res = await prisma.applicationRecord.createMany({
        data: chunk.map(p => ({
          externalId: p.externalId,
          source: "csv",
          sourceCompanyId: p.sourceCompanyId,
          companyRef: p.companyRef,
          appliedAt: p.appliedAt,
          year: p.year,
          month: p.month,
          status: p.status,
          inflow: p.inflow,
          entryType: p.entryType,
          phoneHash: p.phoneHash,
          age: p.age,
          gender: p.gender,
          hasLicense2: p.hasLicense2,
          companyOpened: p.companyOpened,
          applicantPref: p.applicantPref,
        })),
        skipDuplicates: true,
      })
      results.created += res.count
      results.success += res.count
      results.skip += chunk.length - res.count
    } catch {
      results.error += chunk.length
    }
  }

  // --- CSVから消えた応募を削除（最近入ったものは守る） ---
  const staleIds = existingRows
    .filter(e => !seenIds.has(e.id) && runAt - e.createdAt.getTime() > PROTECT_RECENT_MS)
    .map(e => e.id)
  for (let i = 0; i < staleIds.length; i += BATCH_SIZE) {
    const del = await prisma.applicationRecord.deleteMany({ where: { id: { in: staleIds.slice(i, i + BATCH_SIZE) } } })
    results.deleted += del.count
  }

  return results
}
