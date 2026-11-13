// 置き場所: src/lib/quests/firstCall.ts
// 「応募者への初回電話」クエストのルール。
//
// ・対象: 転職道DBに登録された自社（直販）の企業への応募。TEL応募と代理店案件は対象外
// ・担当: その企業の担当営業と営業補佐の両方。どちらが対応してもよい
// ・期日: 営業時間内の応募はその日の 18:00、夜間・休日の応募は次の営業日の 18:00
// ・不在なら、翌営業日の 18:00 を期日に「かけ直し」を1回だけ出す。2回目も不在なら「連絡つかず」で終了
// ・「電話する」を押した人がいる間（30分）は、ほかの人は結果を入れられない

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { instantToWallClock, loadCompanyHolidays, makeCalendar, wallClockToInstant } from "@/lib/businessCalendar"

export const FIRST_CALL = "first_call"
export const FIRST_CALL_SETTING_KEY = "first_call"

/** ロックが自動で外れるまでの時間 */
export const LOCK_MS = 30 * 60000

/** Webhook が届かず CSV で初めて入った応募は、何営業日前の分までクエストを出すか */
const CATCH_UP_BUSINESS_DAYS = 2

/** 人が選べる結果 */
export const FIRST_CALL_RESULTS = {
  connected: "つながった",
  absent: "不在",
  wrong_number: "番号違い・使われていない",
  declined: "辞退・応募した覚えがない",
  company_contacted: "企業がすでに連絡済み",
  not_needed: "電話不要",
} as const

/** 画面に出す結果の名前（2回目の不在は自動で「連絡つかず」になる） */
export const RESULT_LABELS: Record<string, string> = {
  ...FIRST_CALL_RESULTS,
  unreachable: "連絡つかず（2回とも不在）",
}

export type FirstCallResult = keyof typeof FIRST_CALL_RESULTS

export function isFirstCallResult(v: unknown): v is FirstCallResult {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(FIRST_CALL_RESULTS, v)
}

// ===== 設定 =====

export type FirstCallSetting = { enabled: boolean; startAt: Date | null }

export async function getFirstCallSetting(): Promise<FirstCallSetting> {
  const row = await prisma.automationSetting.findUnique({ where: { key: FIRST_CALL_SETTING_KEY } })
  const cfg = (row?.config ?? {}) as { startAt?: string }
  return {
    enabled: !!row?.enabled,
    startAt: cfg.startAt ? new Date(cfg.startAt) : null,
  }
}

/**
 * オン・オフを切り替える。初めてオンにした時刻を「使い始めた日時」として残し、
 * それより前の応募にはクエストを出さない。
 */
export async function setFirstCallEnabled(enabled: boolean): Promise<FirstCallSetting> {
  const current = await getFirstCallSetting()
  const startAt = current.startAt ?? (enabled ? new Date() : null)
  const config = startAt ? { startAt: startAt.toISOString() } : {}
  await prisma.automationSetting.upsert({
    where: { key: FIRST_CALL_SETTING_KEY },
    update: { enabled, config },
    create: { key: FIRST_CALL_SETTING_KEY, enabled, config },
  })
  return { enabled, startAt }
}

// ===== クエストを作る =====

/**
 * まだクエストが無い新しい応募を探して、初回電話のクエストを作る。
 * Webhook の受信後・CSV の取り込み後・クエスト画面を開いたときに呼ぶ。何回呼んでも同じ結果になる。
 */
export async function syncFirstCallQuests(now = new Date()): Promise<{ created: number }> {
  const setting = await getFirstCallSetting()
  if (!setting.enabled || !setting.startAt) return { created: 0 }

  const cal = makeCalendar(await loadCompanyHolidays())
  const catchUpFrom = cal.businessDaysAgoStart(CATCH_UP_BUSINESS_DAYS, now)
  const since = setting.startAt > catchUpFrom ? setting.startAt : catchUpFrom

  const apps = await prisma.applicationRecord.findMany({
    where: {
      appliedAt: { gte: instantToWallClock(since) },
      companyRef: { not: null },
      // TEL応募は対象外（種別が空のものは対象にする）
      OR: [{ entryType: null }, { entryType: { not: "TEL応募" } }],
      // 代理店案件は対象外
      company: { agencyId: null },
      quests: { none: { type: FIRST_CALL } },
    },
    select: {
      id: true, appliedAt: true, companyRef: true,
      company: { select: { userId: true, assistantUserId: true } },
    },
    orderBy: { appliedAt: "asc" },
    take: 500,
  })

  let created = 0
  for (const a of apps) {
    if (!a.company || !a.companyRef) continue
    const assigneeIds = Array.from(new Set([a.company.userId, a.company.assistantUserId].filter((v): v is string => !!v)))
    try {
      await prisma.quest.create({
        data: {
          type: FIRST_CALL,
          attempt: 1,
          dueAt: cal.dueForNewApplication(wallClockToInstant(a.appliedAt)),
          companyId: a.companyRef,
          applicationId: a.id,
          assignees: { connect: assigneeIds.map(id => ({ id })) },
        },
      })
      created++
    } catch (e) {
      // 同時に別の処理が作っていた場合（一意制約）は気にしない
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue
      throw e
    }
  }

  if (created > 0) console.log("[quests] 初回電話のクエストを " + created + " 件作成しました")
  return { created }
}

// ===== ロック（「電話する」） =====

type Actor = { id: string; isAdmin: boolean }

async function loadForAction(questId: string) {
  return prisma.quest.findUnique({
    where: { id: questId },
    select: {
      id: true, type: true, status: true, attempt: true, companyId: true, applicationId: true,
      lockedById: true, lockedAt: true,
      lockedBy: { select: { name: true } },
      assignees: { select: { id: true } },
    },
  })
}

export type ActionError = { ok: false; status: number; error: string }

function canAct(q: { assignees: { id: string }[] }, actor: Actor): boolean {
  return actor.isAdmin || q.assignees.some(a => a.id === actor.id)
}

function lockIsFresh(lockedAt: Date | null, now: Date): boolean {
  return !!lockedAt && now.getTime() - lockedAt.getTime() < LOCK_MS
}

/** 「電話する」を押す。ほかの人が対応中なら失敗する */
export async function lockQuest(questId: string, actor: Actor, now = new Date()): Promise<{ ok: true } | ActionError> {
  const q = await loadForAction(questId)
  if (!q) return { ok: false, status: 404, error: "クエストが見つかりません" }
  if (q.status !== "open") return { ok: false, status: 409, error: "このクエストはもう完了しています" }
  if (!canAct(q, actor)) return { ok: false, status: 403, error: "このクエストの担当ではありません" }

  // 空いている・自分が持っている・30分過ぎている、のどれかなら取れる（同時に押されても1人だけが取れる）
  const res = await prisma.quest.updateMany({
    where: {
      id: questId,
      status: "open",
      OR: [
        { lockedById: null },
        { lockedById: actor.id },
        { lockedAt: { lt: new Date(now.getTime() - LOCK_MS) } },
      ],
    },
    data: { lockedById: actor.id, lockedAt: now },
  })
  if (res.count === 1) return { ok: true }

  const latest = await loadForAction(questId)
  return { ok: false, status: 409, error: (latest?.lockedBy?.name ?? "ほかの人") + "さんが対応中です" }
}

/** 「やめる」。自分のロックだけを外す */
export async function unlockQuest(questId: string, actor: Actor): Promise<void> {
  await prisma.quest.updateMany({
    where: { id: questId, lockedById: actor.id },
    data: { lockedById: null, lockedAt: null },
  })
}

// ===== 結果を入れる =====

export async function recordFirstCallResult(
  questId: string,
  actor: Actor,
  result: FirstCallResult,
  note: string,
  now = new Date(),
): Promise<{ ok: true; nextQuestId: string | null } | ActionError> {
  const q = await loadForAction(questId)
  if (!q || q.type !== FIRST_CALL) return { ok: false, status: 404, error: "クエストが見つかりません" }
  if (q.status !== "open") return { ok: false, status: 409, error: "このクエストはもう完了しています" }
  if (!canAct(q, actor)) return { ok: false, status: 403, error: "このクエストの担当ではありません" }
  if (q.lockedById && q.lockedById !== actor.id && lockIsFresh(q.lockedAt, now)) {
    return { ok: false, status: 409, error: (q.lockedBy?.name ?? "ほかの人") + "さんが対応中です" }
  }
  const trimmed = note.trim().slice(0, 500)
  if (result === "not_needed" && !trimmed) {
    return { ok: false, status: 400, error: "「電話不要」のときは理由を入力してください" }
  }

  // 2回目も不在なら「連絡つかず」で終える
  const finalResult = result === "absent" && q.attempt >= 2 ? "unreachable" : result
  const needsRetry = result === "absent" && q.attempt < 2

  const cal = needsRetry ? makeCalendar(await loadCompanyHolidays()) : null

  const nextQuestId = await prisma.$transaction(async tx => {
    // 同時に別の人が完了させていないことを確かめながら完了にする
    const done = await tx.quest.updateMany({
      where: { id: questId, status: "open" },
      data: {
        status: "done",
        result: finalResult,
        resultNote: trimmed || null,
        doneById: actor.id,
        doneAt: now,
        lockedById: null,
        lockedAt: null,
      },
    })
    if (done.count !== 1) return undefined

    if (!needsRetry || !cal) return null
    const next = await tx.quest.create({
      data: {
        type: FIRST_CALL,
        attempt: q.attempt + 1,
        dueAt: cal.nextBusinessDayClose(now),
        companyId: q.companyId,
        applicationId: q.applicationId,
        assignees: { connect: q.assignees.map(a => ({ id: a.id })) },
      },
      select: { id: true },
    })
    return next.id
  })

  if (nextQuestId === undefined) return { ok: false, status: 409, error: "このクエストはもう完了しています" }
  return { ok: true, nextQuestId }
}

// ===== 担当替え =====

/**
 * 企業の担当営業・営業補佐が変わったときに、その企業の対応待ちクエストの担当を付け替える。
 * 完了したクエストは、対応した人の記録として残すため触らない。
 */
export async function syncOpenQuestAssignees(companyId: string): Promise<number> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { userId: true, assistantUserId: true },
  })
  if (!company) return 0
  const ids = Array.from(new Set([company.userId, company.assistantUserId].filter((v): v is string => !!v)))

  const open = await prisma.quest.findMany({ where: { companyId, status: "open" }, select: { id: true } })
  for (const q of open) {
    await prisma.quest.update({
      where: { id: q.id },
      data: { assignees: { set: ids.map(id => ({ id })) } },
    })
  }
  return open.length
}
