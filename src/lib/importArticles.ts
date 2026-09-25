import { createHash } from "crypto"
import { prisma } from "@/lib/prisma"

// =====================================================================
// 列の定義
// =====================================================================

/** 特徴フラグ（0/1）。1 の項目名を features に入れる */
export const FEATURE_COLUMNS = [
  "寮完備", "住宅支援制度あり", "二種免許費用負担", "事故補償あり", "給与保障", "入社祝い金支給",
  "退職金制度あり", "昼日勤あり", "夜日勤あり", "日曜日休み", "Wワーク・副業可", "マイカー通勤可",
  "バイク通勤可", "徒歩10分以内", "シャトルバス", "年金受給者活躍中", "女性活躍中", "外国籍の方活躍中",
  "正社員", "定時制社員", "嘱託社員", "アルバイト・パート", "ハイヤー運転手", "介護ドライバー",
  "出張面接可", "リモート面接可", "電話面接可", "体験入社・見学OK", "クラブ活動あり", "託児所あり",
  "社員食堂あり", "女性専用設備あり", "GOアプリ導入", "DiDiアプリ導入", "S.RIDEアプリ導入",
  "Uberアプリ導入", "カーナビあり", "JPNタクシー導入", "フリーダイアル",
]

/** 画像の列（値が入っていれば1枚と数える） */
const IMAGE_COLUMNS = [
  "サムネイル画像", "メインイメージ", "注目の５社画像",
  "先輩乗務員の声1画像", "先輩乗務員の声2画像", "先輩乗務員の声3画像",
  "ハイグレードプランアピール画像1", "ハイグレードプランアピール画像2",
  "会社概要画像1", "会社概要画像2", "会社概要画像3", "会社概要画像4",
  "会社からの一言画像",
  "メッセージ画像1", "メッセージ画像2", "メッセージ画像3", "メッセージ画像4",
  "point_image",
]

const VIDEO_COLUMNS = ["動画ID1", "動画ID2", "動画ID3", "動画ID4"]

const SCORE_COLUMNS = ["スカウトポイント", "仕事観", "教育レベル", "働きやすさ", "採用率", "福利厚生", "稼ぎやすさ"]

/**
 * 記事の「中身」に関係ない列。変更検出（ハッシュ）と履歴から除外する。
 * ここに入っている列だけが変わっても、履歴は増えない。
 */
const NON_CONTENT_COLUMNS = new Set([
  "登録日時", "更新日時", "求人ページの更新日時", "並び順", "ブログ", "知恵袋新着通知",
  "デフォルトの表示切り替え", "公開ステータス", "PC", "スマートフォン", "モバイル",
  "public_work_flg", "タクシーを呼ぶ", "プレビュー表示", "掲載終了求人に掲載する",
  "エントリーページの表示切り替え", "転職道.COM 年間掲載費用", "注目の5社 年問掲載費用",
])
function isContentColumn(name: string): boolean {
  if (NON_CONTENT_COLUMNS.has(name)) return false
  if (name.startsWith("c_")) return false
  // SEO設定（求人情報ページtitle / …description / …keywords / …h1）
  if (/ページ(title|description|keywords|h1)$/.test(name)) return false
  return true
}

/** 取り込み後の掲載中件数が、既存の掲載中件数のこの割合を下回ったら中断する */
export const ARTICLE_SHRINK_GUARD_RATIO = 0.8

// =====================================================================
// CSV の読み込み
// =====================================================================

/** UTF-8 として読めなければ Shift-JIS として読む */
export function decodeCsv(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^\uFEFF/, "")
  } catch {
    return new TextDecoder("shift_jis").decode(buf)
  }
}

/** ダブルクォート内の改行・カンマに対応したCSVパーサ */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') { inQuotes = true; continue }
    if (ch === ",") { row.push(field); field = ""; continue }
    if (ch === "\r") continue
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue }
    field += ch
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(v => v !== ""))
}

/** 重複する列名に (2) (3) … を付けて区別する */
function uniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>()
  return headers.map(h => {
    const name = h.trim()
    const n = (seen.get(name) ?? 0) + 1
    seen.set(name, n)
    return n === 1 ? name : `${name}(${n})`
  })
}

/** "2026/09/03 9:45" → 日本時間として Date に */
function parseJstDateTime(s: string | undefined): Date | null {
  if (!s) return null
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s.trim())
  if (!m) return null
  const pad = (v: string) => v.padStart(2, "0")
  const d = new Date(`${m[1]}-${pad(m[2])}-${pad(m[3])}T${pad(m[4] ?? "0")}:${m[5] ?? "00"}:00+09:00`)
  return isNaN(d.getTime()) ? null : d
}

// =====================================================================
// 行 → 記事データ
// =====================================================================

export type ParsedArticle = {
  sourceCompanyId: string
  name: string
  prefecture: string | null
  city: string | null
  title: string | null
  features: string[]
  imageCount: number
  videoCount: number
  planType1: string | null
  planType2: string | null
  priceRank: string | null
  scores: Record<string, number>
  pageUpdatedAt: Date | null
  contentHash: string
  data: Record<string, string>
  content: Record<string, string>
}

export function parseArticles(text: string): { articles: ParsedArticle[]; errors: string[] } {
  const rows = parseCsv(text)
  if (rows.length < 2) return { articles: [], errors: ["CSVにデータ行がありません"] }

  const headers = uniqueHeaders(rows[0])
  if (!headers.includes("企業ID")) {
    return { articles: [], errors: ["「企業ID」列が見つかりません。記事一覧のCSVか確認してください"] }
  }

  const errors: string[] = []
  const seenIds = new Set<string>()
  const articles: ParsedArticle[] = []

  rows.slice(1).forEach((cells, idx) => {
    const lineNo = idx + 2
    const data: Record<string, string> = {}
    headers.forEach((h, i) => {
      const v = (cells[i] ?? "").trim()
      if (v !== "") data[h] = v
    })

    const id = data["企業ID"]
    if (!id) { errors.push(`${lineNo}行目: 企業IDが空のためスキップ`); return }
    if (seenIds.has(id)) { errors.push(`${lineNo}行目: 企業ID ${id} が重複しているためスキップ`); return }
    seenIds.add(id)

    // 中身に関係する列だけでハッシュを取る（キー順を固定）
    const content: Record<string, string> = {}
    for (const key of Object.keys(data).sort()) {
      if (isContentColumn(key)) content[key] = data[key]
    }
    const contentHash = createHash("sha256").update(JSON.stringify(content)).digest("hex")

    const scores: Record<string, number> = {}
    for (const col of SCORE_COLUMNS) {
      const n = Number(data[col])
      if (data[col] != null && Number.isFinite(n)) scores[col] = n
    }

    articles.push({
      sourceCompanyId: id,
      name: data["企業名"] ?? "",
      prefecture: data["エリア"] ?? null,
      city: data["エリア2"] ?? null,
      title: data["タイトル"] ?? null,
      features: FEATURE_COLUMNS.filter(c => data[c] === "1"),
      imageCount: IMAGE_COLUMNS.filter(c => !!data[c]).length,
      videoCount: VIDEO_COLUMNS.filter(c => !!data[c]).length,
      planType1: data["掲載プラン1"] ?? null,
      planType2: data["掲載プラン2"] ?? null,
      priceRank: data["単価ランク"] ?? null,
      scores,
      pageUpdatedAt: parseJstDateTime(data["求人ページの更新日時"]),
      contentHash,
      data,
      content,
    })
  })

  return { articles, errors }
}

// =====================================================================
// 取り込み本体
// =====================================================================

export type ArticleImportResult = {
  ok: boolean
  /** 件数ガードで止めた場合の説明（ok=false） */
  guardMessage?: string
  total: number
  created: number
  changed: number
  unchanged: number
  delisted: number
  snapshots: number
  /** DBの企業に紐づかなかった企業ID（記事は保存する。企業登録後に再取り込みで紐づく） */
  unmatchedIds: string[]
  errors: string[]
}

/**
 * 記事CSVを取り込む。
 * - 企業IDごとに最新の内容で上書き（1社1記事）
 * - 内容（ハッシュ）が変わった記事と新規の記事だけ履歴を1行追加
 * - 前回あって今回のCSVに無い記事は掲載終了（isListed=false）にする
 * - 掲載中の件数が大きく減る場合は中断（force で無視できる）
 */
export async function importArticles(text: string, opts: { force?: boolean } = {}): Promise<ArticleImportResult> {
  const { articles, errors } = parseArticles(text)
  const empty = { total: 0, created: 0, changed: 0, unchanged: 0, delisted: 0, snapshots: 0, unmatchedIds: [], errors }

  if (articles.length === 0) {
    return { ok: false, guardMessage: errors[0] ?? "取り込める行がありません", ...empty }
  }

  // ---- 件数ガード ----
  const listedBefore = await prisma.jobArticle.count({ where: { isListed: true } })
  if (!opts.force && listedBefore > 0 && articles.length < listedBefore * ARTICLE_SHRINK_GUARD_RATIO) {
    return {
      ok: false,
      guardMessage: `CSVの記事数（${articles.length}件）が、現在の掲載中記事（${listedBefore}件）の${Math.round(
        ARTICLE_SHRINK_GUARD_RATIO * 100,
      )}%を下回っています。CSVが途中で切れていないか確認してください。`,
      ...empty,
      total: articles.length,
    }
  }

  // ---- 既存データ ----
  const ids = articles.map(a => a.sourceCompanyId)
  const [existing, companies] = await Promise.all([
    prisma.jobArticle.findMany({
      where: { sourceCompanyId: { in: ids } },
      select: { id: true, sourceCompanyId: true, contentHash: true, companyRef: true, isListed: true },
    }),
    prisma.company.findMany({
      where: { companyId: { in: ids } },
      select: { id: true, companyId: true },
    }),
  ])
  const existingById = new Map(existing.map(e => [e.sourceCompanyId, e]))
  const companyRefById = new Map(companies.map(c => [c.companyId as string, c.id]))

  const now = new Date()
  const toCreate: ParsedArticle[] = []
  const toUpdate: { id: string; a: ParsedArticle; contentChanged: boolean }[] = []
  const unchangedIds: string[] = []
  const unmatchedIds: string[] = []

  for (const a of articles) {
    const ref = companyRefById.get(a.sourceCompanyId) ?? null
    if (!ref) unmatchedIds.push(a.sourceCompanyId)
    const ex = existingById.get(a.sourceCompanyId)
    if (!ex) { toCreate.push(a); continue }
    const contentChanged = ex.contentHash !== a.contentHash
    if (contentChanged || ex.companyRef !== ref || !ex.isListed) {
      toUpdate.push({ id: ex.id, a, contentChanged })
    } else {
      unchangedIds.push(ex.id)
    }
  }

  const baseFields = (a: ParsedArticle) => ({
    name: a.name,
    prefecture: a.prefecture,
    city: a.city,
    title: a.title,
    features: a.features,
    imageCount: a.imageCount,
    videoCount: a.videoCount,
    planType1: a.planType1,
    planType2: a.planType2,
    priceRank: a.priceRank,
    scores: a.scores,
    pageUpdatedAt: a.pageUpdatedAt,
    contentHash: a.contentHash,
    data: a.data,
    companyRef: companyRefById.get(a.sourceCompanyId) ?? null,
    isListed: true,
    delistedAt: null,
    lastImportedAt: now,
  })

  let snapshots = 0
  let delisted = 0

  await prisma.$transaction(
    async tx => {
      // 新規
      if (toCreate.length > 0) {
        await tx.jobArticle.createMany({
          data: toCreate.map(a => ({ sourceCompanyId: a.sourceCompanyId, ...baseFields(a) })),
        })
        const created = await tx.jobArticle.findMany({
          where: { sourceCompanyId: { in: toCreate.map(a => a.sourceCompanyId) } },
          select: { id: true, sourceCompanyId: true },
        })
        const idBySource = new Map(created.map(c => [c.sourceCompanyId, c.id]))
        await tx.jobArticleSnapshot.createMany({
          data: toCreate.map(a => ({
            articleId: idBySource.get(a.sourceCompanyId)!,
            contentHash: a.contentHash,
            content: a.content,
            pageUpdatedAt: a.pageUpdatedAt,
            capturedAt: now,
          })),
        })
        snapshots += toCreate.length
      }

      // 変更あり（内容・紐づけ・掲載再開）
      for (const u of toUpdate) {
        await tx.jobArticle.update({ where: { id: u.id }, data: baseFields(u.a) })
      }
      const contentChanged = toUpdate.filter(u => u.contentChanged)
      if (contentChanged.length > 0) {
        await tx.jobArticleSnapshot.createMany({
          data: contentChanged.map(u => ({
            articleId: u.id,
            contentHash: u.a.contentHash,
            content: u.a.content,
            pageUpdatedAt: u.a.pageUpdatedAt,
            capturedAt: now,
          })),
        })
        snapshots += contentChanged.length
      }

      // 変更なし（取り込み日時だけ更新）
      if (unchangedIds.length > 0) {
        await tx.jobArticle.updateMany({ where: { id: { in: unchangedIds } }, data: { lastImportedAt: now } })
      }

      // 今回のCSVに無い記事 → 掲載終了
      const res = await tx.jobArticle.updateMany({
        where: { isListed: true, sourceCompanyId: { notIn: ids } },
        data: { isListed: false, delistedAt: now },
      })
      delisted = res.count
    },
    { timeout: 120_000 },
  )

  return {
    ok: true,
    total: articles.length,
    created: toCreate.length,
    changed: toUpdate.filter(u => u.contentChanged).length,
    unchanged: articles.length - toCreate.length - toUpdate.filter(u => u.contentChanged).length,
    delisted,
    snapshots,
    unmatchedIds,
    errors,
  }
}