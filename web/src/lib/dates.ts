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

/** The zone's offset from UTC, in ms, at a given instant. */
function offsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SITE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at)
  const p: Record<string, number> = {}
  for (const { type, value } of parts) if (type !== 'literal') p[type] = Number(value)
  // `hour` comes back as 24 at midnight under hour12:false in some runtimes.
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second)
  return asUTC - at.getTime()
}

/**
 * A Miami wall-clock time as an RFC 5545 UTC stamp — `20260906T130000Z`.
 *
 * Written in UTC rather than `TZID=America/New_York` on purpose: a TZID
 * reference obliges the file to carry a VTIMEZONE block defining that zone,
 * and a UTC instant needs nothing and is unambiguous everywhere. Floating
 * local time would be worse than either — it means "9am wherever you happen to
 * be", so the same file would say a different hour to a reader in Madrid.
 *
 * The offset is resolved twice. The first pass reads the zone's offset at the
 * naive instant; the second re-reads it at the corrected one, which is what
 * settles a time sitting within an hour of a DST change. September is well
 * inside EDT, but the two lines are what make this correct in March and
 * November too.
 */
export function utcStamp(iso: string, hhmm: string, addMinutes = 0): string {
  const [y, m, d] = iso.split('-').map(Number)
  const [hh, mi] = hhmm.split(':').map(Number)
  const naive = Date.UTC(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, (mi ?? 0) + addMinutes)
  let ts = naive - offsetMs(new Date(naive))
  ts = naive - offsetMs(new Date(ts))
  return new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
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

export function addDays(iso: string, n: number): string {
  const dt = parseISO(iso)
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

/**
 * The calendar day an event finishes on, YYYY-MM-DD.
 *
 * Its own `endDate` when it runs over several days. Otherwise the day after,
 * when the clock closes at or before it opens — a 9PM–1AM night ends on the
 * next date, and writing it on the same date makes the finish come before the
 * start, which calendars and search engines both reject. Otherwise its own day.
 */
export function eventEndDay(ev: {
  date: string
  endDate?: string | null
  startTime?: string | null
  endTime?: string | null
}): string {
  const start = dateOnly(ev.date)
  const end = dateOnly(ev.endDate)
  if (end && end > start) return end
  if (ev.startTime && ev.endTime && ev.endTime <= ev.startTime) return addDays(start, 1)
  return start
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

/** The date fields the board reads off an event. */
export type EventDates = Parameters<typeof eventEndDay>[0]

/**
 * Whether an event is still on the board today: it has not finished yet.
 *
 * Keyed on the last day, not the first, so an exhibit that opened last month
 * stays listed for its whole run, and a 9PM–1AM night that started yesterday
 * is still listed this morning.
 */
export function isStillOn(ev: EventDates, today: string): boolean {
  return eventEndDay(ev) >= today
}

/**
 * The last day an event occupies on the list view (the calendar uses `eventRunEnd`).
 *
 * That is its `endDate` for a multi-day run and its own day otherwise. The
 * early-morning spill of a past-midnight night is deliberately left out — a
 * Sunday 9PM–1AM night is a Sunday event, and counting Monday would also put
 * it under NEXT WEEK. The one exception is when that morning is today: the
 * night is still on, so it shows under today rather than vanishing.
 */
export function eventLastBoardDay(ev: EventDates, today: string): string {
  const last = eventRunEnd(ev)
  return eventEndDay(ev) === today && last < today ? today : last
}

/** Its `endDate` for a multi-day run, otherwise its own day — no spill. */
export function eventRunEnd(ev: EventDates): string {
  const start = dateOnly(ev.date)
  const end = dateOnly(ev.endDate)
  return end && end > start ? end : start
}

/**
 * The day an event is shown under within [from, to], or null if its run
 * misses that range: the first day of the overlap, never before today. One
 * day per range, so a three-week exhibit is one card per bucket, not one per
 * day.
 */
export function boardDayIn(ev: EventDates, from: string, to: string, today: string): string | null {
  const start = dateOnly(ev.date)
  const last = eventLastBoardDay(ev, today)
  const lo = [start, from, today].reduce((a, b) => (a > b ? a : b))
  const hi = last < to ? last : to
  return lo <= hi ? lo : null
}

export type BucketGroup<E> = {
  key: Bucket['key']
  count: number
  days: { iso: string; items: E[] }[]
}

/**
 * The list view: each bucket with the events whose run overlaps it, grouped
 * under the day each one is shown on. An event spanning two buckets is in
 * both, once each. Events keep their input order within a day. Buckets with
 * nothing in them are dropped.
 */
export function groupIntoBuckets<E extends EventDates>(
  events: E[],
  today: string,
): BucketGroup<E>[] {
  const live = events.filter((ev) => isStillOn(ev, today))
  return buckets(today)
    .map((bk) => {
      const placed = live
        .map((ev) => ({ ev, day: boardDayIn(ev, bk.from, bk.to, today) }))
        .filter((p): p is { ev: E; day: string } => p.day !== null)
      const days = [...new Set(placed.map((p) => p.day))].sort()
      return {
        key: bk.key,
        count: placed.length,
        days: days.map((iso) => ({
          iso,
          items: placed.filter((p) => p.day === iso).map((p) => p.ev),
        })),
      }
    })
    .filter((b) => b.count > 0)
}

/**
 * The calendar days an event occupies within [from, to]: every day from its
 * start through its `endDate`. A past-midnight night occupies only its start
 * day, so it is not drawn twice on the grid — including the morning after,
 * when the list still shows it under today: on the grid it sits on the night
 * it happened.
 */
export function eventDaysIn(ev: EventDates, from: string, to: string): string[] {
  const start = dateOnly(ev.date)
  const end = eventRunEnd(ev)
  const out: string[] = []
  for (let d = start > from ? start : from; d <= end && d <= to; d = addDays(d, 1)) out.push(d)
  return out
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

/**
 * A Miami wall-clock time as a `Date`: `utcStamp` as an instant rather than as
 * ICS text, with the same DST handling.
 */
export function miamiInstant(iso: string, hhmm: string): Date {
  const s = utcStamp(iso, hhmm)
  return new Date(
    `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`,
  )
}

/**
 * Month and weekday names for the date line. Written out rather than taken
 * from Intl, whose Spanish short September is "sept." in some ICU builds and
 * "sep." in others: the image would change with the Node version.
 */
const MONTH_SHORT: Record<Lang, string[]> = {
  es: ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'],
  en: ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'],
}
const MONTH_LONG: Record<Lang, string[]> = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
}
const WEEKDAY_LONG: Record<Lang, string[]> = {
  es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
}

/**
 * The one line that says when an event is, for the generated event card:
 *
 * - one day: "Sábado 10 de octubre" / "Saturday, October 10"
 * - a run that is already on: "Hasta el 19 de octubre" / "Through October 19"
 * - a run still ahead: "Del 18 de sep. al 19 de oct." / "Sep. 18 to Oct. 19",
 *   or "Del 18 al 25 de oct." / "Oct. 18 to 25" inside one month
 *
 * A past-midnight night (9PM–1AM) is one day: only `endDate` makes a run, the
 * same as on the board (`eventRunEnd`).
 */
export function eventDateLine(ev: EventDates, lang: Lang, today: string = todayISO()): string {
  const start = dateOnly(ev.date)
  const end = eventRunEnd(ev)
  const parts = (iso: string) => {
    const d = parseISO(iso)
    return { day: d.getUTCDate(), month: d.getUTCMonth(), dow: d.getUTCDay() }
  }
  const s = parts(start)
  const e = parts(end)
  if (end === start) {
    return lang === 'es'
      ? `${WEEKDAY_LONG.es[s.dow]} ${s.day} de ${MONTH_LONG.es[s.month]}`
      : `${WEEKDAY_LONG.en[s.dow]}, ${MONTH_LONG.en[s.month]} ${s.day}`
  }
  if (start <= today) {
    return lang === 'es'
      ? `Hasta el ${e.day} de ${MONTH_LONG.es[e.month]}`
      : `Through ${MONTH_LONG.en[e.month]} ${e.day}`
  }
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  if (lang === 'es') {
    return sameMonth
      ? `Del ${s.day} al ${e.day} de ${MONTH_SHORT.es[e.month]}`
      : `Del ${s.day} de ${MONTH_SHORT.es[s.month]} al ${e.day} de ${MONTH_SHORT.es[e.month]}`
  }
  return sameMonth
    ? `${MONTH_SHORT.en[s.month]} ${s.day} to ${e.day}`
    : `${MONTH_SHORT.en[s.month]} ${s.day} to ${MONTH_SHORT.en[e.month]} ${e.day}`
}

const DAYS_ES: Record<string, string> = { Mon: 'Lun', Tue: 'Mar', Wed: 'Mié', Thu: 'Jue', Fri: 'Vie', Sat: 'Sáb', Sun: 'Dom' }

/**
 * A listing's hours label on a Spanish page. `detail.hours[].d` is localized,
 * but most listings only have the English label, and Spanish pages fall back
 * to it ("Sun", "Fri & Sat"). This reads it in Spanish ("Dom", "Vie y Sáb"),
 * whole words only, so a label already written in Spanish passes unchanged.
 */
export function hoursLabel(label: string, lang: Lang): string {
  if (lang !== 'es') return label
  return label.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g, (d) => DAYS_ES[d]).replace(/ & /g, ' y ')
}
