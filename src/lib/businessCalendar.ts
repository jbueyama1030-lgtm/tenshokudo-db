// 置き場所: src/lib/businessCalendar.ts
// 営業日の計算（クエストの期日などに使う）。
//
// ・営業時間は平日 9:00〜18:00（日本時間）
// ・土日、日本の祝日、会社独自の休み（BusinessHoliday）は休み
// ・サーバーの時刻設定（Railway は UTC、手元のPCは日本時間）に左右されないよう、
//   日本時間の計算はすべて「UTC + 9時間」で行う

import holidayJp from "@holiday-jp/holiday_jp"
import { prisma } from "@/lib/prisma"

const JST_OFFSET = 9 * 3600000
export const OPEN_HOUR = 9
export const CLOSE_HOUR = 18

export type Ymd = { y: number; m: number; d: number }

/** 実際の時刻 → 日本時間の年月日・時分・曜日（0 = 日曜） */
export function jstParts(instant: Date) {
  const t = new Date(instant.getTime() + JST_OFFSET)
  return {
    y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(),
    h: t.getUTCHours(), mi: t.getUTCMinutes(), s: t.getUTCSeconds(),
    dow: t.getUTCDay(),
  }
}

/** 日本時間の年月日・時分 → 実際の時刻 */
export function jstInstant(y: number, m: number, d: number, h = 0, mi = 0, s = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h, mi, s) - JST_OFFSET)
}

/**
 * 応募日時（ApplicationRecord.appliedAt）を実際の時刻に直す。
 * 応募日時は「日本時間の見た目の日時」をサーバーの時刻設定のまま保存しているため、
 * サーバー上の見た目（getHours など）が日本時間の値になっている。
 */
export function wallClockToInstant(wall: Date): Date {
  return jstInstant(wall.getFullYear(), wall.getMonth() + 1, wall.getDate(), wall.getHours(), wall.getMinutes(), wall.getSeconds())
}

/** 実際の時刻 → 応募日時と同じ保存の形（検索の条件に使う） */
export function instantToWallClock(instant: Date): Date {
  const p = jstParts(instant)
  return new Date(p.y, p.m - 1, p.d, p.h, p.mi, p.s)
}

export function ymdKey(v: Ymd): string {
  return v.y + "-" + String(v.m).padStart(2, "0") + "-" + String(v.d).padStart(2, "0")
}

function addDays(v: Ymd, n: number): Ymd & { dow: number } {
  const t = new Date(Date.UTC(v.y, v.m - 1, v.d + n))
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), dow: t.getUTCDay() }
}

function isJapaneseHoliday(v: Ymd): boolean {
  try {
    return holidayJp.isHoliday(new Date(v.y, v.m - 1, v.d))
  } catch {
    // ライブラリが持っていない年（遠い将来など）は祝日なしとして扱う
    return false
  }
}

/** 会社独自の休みを読み込む */
export async function loadCompanyHolidays(): Promise<Set<string>> {
  const rows = await prisma.businessHoliday.findMany({ select: { date: true } })
  return new Set(rows.map(r => r.date))
}

export type BusinessCalendar = ReturnType<typeof makeCalendar>

/** 会社独自の休みを渡して、営業日の計算をまとめたものを作る */
export function makeCalendar(companyHolidays: Set<string>) {
  const isBusinessDay = (v: Ymd): boolean => {
    const dow = addDays(v, 0).dow
    if (dow === 0 || dow === 6) return false
    if (isJapaneseHoliday(v)) return false
    if (companyHolidays.has(ymdKey(v))) return false
    return true
  }

  /** v の次の営業日（v 自身は含めない） */
  const nextBusinessDay = (v: Ymd): Ymd => {
    let cur: Ymd = v
    for (let i = 0; i < 60; i++) {
      cur = addDays(cur, 1)
      if (isBusinessDay(cur)) return cur
    }
    return cur
  }

  return {
    isBusinessDay,

    /**
     * 新しい応募の初回電話の期日。
     * 営業日の 18:00 より前の応募 → その日の 18:00
     * それ以外（夜間・休日） → 次の営業日の 18:00
     */
    dueForNewApplication(appliedInstant: Date): Date {
      const p = jstParts(appliedInstant)
      const day: Ymd = { y: p.y, m: p.m, d: p.d }
      const target = isBusinessDay(day) && p.h < CLOSE_HOUR ? day : nextBusinessDay(day)
      return jstInstant(target.y, target.m, target.d, CLOSE_HOUR)
    },

    /** from の翌営業日の 18:00（かけ直しの期日） */
    nextBusinessDayClose(from: Date): Date {
      const p = jstParts(from)
      const target = nextBusinessDay({ y: p.y, m: p.m, d: p.d })
      return jstInstant(target.y, target.m, target.d, CLOSE_HOUR)
    },

    /** 今日から n 営業日さかのぼった日の 0:00（日本時間） */
    businessDaysAgoStart(n: number, now: Date): Date {
      const p = jstParts(now)
      let cur: Ymd = { y: p.y, m: p.m, d: p.d }
      let count = 0
      for (let i = 0; i < 60 && count < n; i++) {
        cur = addDays(cur, -1)
        if (isBusinessDay(cur)) count++
      }
      return jstInstant(cur.y, cur.m, cur.d)
    },

    /** 今が営業時間内か */
    isOpenNow(now: Date): boolean {
      const p = jstParts(now)
      return isBusinessDay({ y: p.y, m: p.m, d: p.d }) && p.h >= OPEN_HOUR && p.h < CLOSE_HOUR
    },
  }
}
