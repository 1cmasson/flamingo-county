import type { Lang } from '../i18n'

/**
 * Date handling for the events board.
 *
 * The static site never computed any of this. `EV_TODAY` was the literal string
 * `'2026-08-17'`, `MONTHNAME` had entries for exactly two months, and the
 * this-weekend / next-week / later buckets hardcoded their boundaries. That was
 * fine for a design prototype and is not fine for a site people visit.
 *
 * Two rules make the replacement correct:
 *
 * 1. **The zone is Miami, not the server's.** Railway runs UTC, so after 8pm
 *    local it is already tomorrow in UTC and every bucket would quietly shift a
 *    day each evening. `todayISO()` asks for the calendar date in
 *    America/New_York explicitly.
 *
 * 2. **Compare as `YYYY-MM-DD` strings**, the way the source did. The seed
 *    stores event dates at noon UTC precisely so a date-only value survives
 *    ±12h of zone shifting; converting back to `Date` objects to compare them
 *    would reintroduce the problem that trick exists to avoid.
 *
 * NOTE: this depends on the pages rendering per request. Every route currently
 * builds dynamic (see CMS.md), so `new Date()` is evaluated on each visit. If
 * anything is ever switched to static rendering, "today" freezes at build time
 * and the site is back to the bug this file replaced — with no error to notice.
 */
export const SITE_TZ = 'America/New_York'

/** Today's calendar date in Miami, as YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is the shape we want to compare on.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SITE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** The date portion of whatever Payload gives back. */
export function dateOnly(v: string | Date | null | undefined): string {
  if (!v) return ''
  return typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10)
}

/** Parse YYYY-MM-DD into a UTC-noon Date, safe for weekday/month lookups. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12))
}

function addDays(iso: string, n: number): string {
  const dt = parseISO(iso)
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

/** 0 = Sunday, matching JS getDay() and the `dow` field on weekly events. */
export function weekday(iso: string): number {
  return parseISO(iso).getUTCDay()
}

export type Bucket = { key: 'weekend' | 'next' | 'later'; from: string; to: string }

/**
 * The three buckets, derived rather than hardcoded.
 *
 * The source's frozen today was Monday 2026-08-17 and its buckets ran 17–23,
 * 24–30, then 31 onward — i.e. the rest of this week, all of next week, and
 * everything after. That is what this reproduces, from a live date.
 *
 * Events before today are dropped, same as the source's first bucket starting
 * at its "today".
 */
export function buckets(today: string = todayISO()): Bucket[] {
  const dow = weekday(today)
  // Days remaining until Sunday, treating Sunday as the last day of the week.
  const toSunday = dow === 0 ? 0 : 7 - dow
  const endOfThisWeek = addDays(today, toSunday)
  const startOfNextWeek = addDays(endOfThisWeek, 1)
  const endOfNextWeek = addDays(startOfNextWeek, 6)

  return [
    { key: 'weekend', from: today, to: endOfThisWeek },
    { key: 'next', from: startOfNextWeek, to: endOfNextWeek },
    { key: 'later', from: addDays(endOfNextWeek, 1), to: '9999-12-31' },
  ]
}

export const BUCKET_LABEL: Record<Bucket['key'], string> = {
  weekend: 'THIS WEEKEND',
  next: 'NEXT WEEK',
  later: 'LATER ON',
}

/** e.g. "THU 20 — SUN 23 AUG", built from the days that actually have events. */
export function rangeLabel(days: string[], lang: Lang): string {
  if (!days.length) return ''
  const first = days[0]
  const last = days[days.length - 1]
  const wd = (iso: string) =>
    new Intl.DateTimeFormat(lang === 'es' ? 'es' : 'en', {
      timeZone: 'UTC',
      weekday: 'short',
    })
      .format(parseISO(iso))
      .toUpperCase()
      .replace('.', '')
  const dayNum = (iso: string) => String(parseISO(iso).getUTCDate())
  const mon = (iso: string) =>
    new Intl.DateTimeFormat(lang === 'es' ? 'es' : 'en', { timeZone: 'UTC', month: 'short' })
      .format(parseISO(iso))
      .toUpperCase()
      .replace('.', '')

  if (first === last) return `${wd(first)} ${dayNum(first)} ${mon(first)}`
  return `${wd(first)} ${dayNum(first)} — ${wd(last)} ${dayNum(last)} ${mon(last)}`
}

/** Short weekday and month, for the day markers and event cards. */
export function shortWeekday(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'es' ? 'es' : 'en', {
    timeZone: 'UTC',
    weekday: 'short',
  })
    .format(parseISO(iso))
    .toUpperCase()
    .replace('.', '')
}

export function shortMonth(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'es' ? 'es' : 'en', {
    timeZone: 'UTC',
    month: 'short',
  })
    .format(parseISO(iso))
    .toUpperCase()
    .replace('.', '')
}

/**
 * "AUGUST 2026" / "AGOSTO 2026".
 *
 * The dictionary is no help here — `MONTHNAME` only ever had keys for months 8
 * and 9 — so this comes from Intl. Spanish formats as "agosto de 2026", and the
 * source's label had no "de", so it is stripped to match.
 */
export function monthTitle(year: number, month1: number, lang: Lang): string {
  const dt = new Date(Date.UTC(year, month1 - 1, 1, 12))
  const s = new Intl.DateTimeFormat(lang === 'es' ? 'es' : 'en', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(dt)
  return s.replace(' de ', ' ').toUpperCase()
}

/** Calendar grid for a month: leading blanks then each day as YYYY-MM-DD. */
export function monthGrid(year: number, month1: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month1 - 1, 1, 12))
  const lead = first.getUTCDay()
  const days = new Date(Date.UTC(year, month1, 0, 12)).getUTCDate()
  const cells: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let d = 1; d <= days; d++) {
    cells.push(`${year}-${String(month1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return cells
}

/** Weekday initials for the calendar header, starting Sunday. */
export function weekdayHeadings(lang: Lang): string[] {
  const fmt = new Intl.DateTimeFormat(lang === 'es' ? 'es' : 'en', {
    timeZone: 'UTC',
    weekday: 'short',
  })
  // 2026-08-02 is a Sunday.
  return Array.from({ length: 7 }, (_, i) =>
    fmt
      .format(new Date(Date.UTC(2026, 7, 2 + i, 12)))
      .toUpperCase()
      .replace('.', ''),
  )
}
