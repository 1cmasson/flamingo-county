import ICAL from 'ical.js'

import { addDays, SITE_TZ } from './dates'
import { esc } from './telegram'

/**
 * The owner's Google Calendar, read for the morning brief and the evening wrap.
 *
 * It reads the calendar's *secret address in iCal format* from
 * `GOOGLE_CALENDAR_ICS_URL`. That is read-only and needs no OAuth, but anyone
 * holding the URL can read the whole calendar, so it is a secret. It is never
 * logged, and no error message built here ever includes it.
 *
 * Parsing and recurrence (RRULE, EXDATE, COUNT/UNTIL) come from ical.js,
 * Mozilla's parser behind Thunderbird, which has no dependencies of its own.
 * Turning a wall-clock time into an instant is done here with Intl instead of
 * the file's VTIMEZONE blocks: ical.js only applies a TZID whose VTIMEZONE was
 * registered first, and on its own it treats `TZID=America/New_York` as floating
 * time, which on a UTC server is four or five hours off.
 */

/** Long enough for a large calendar on a slow day, short enough not to hold up a Telegram reply. */
const FETCH_TIMEOUT_MS = 8_000
/** A recurring event is expanded from its first date; this stops a runaway rule. */
const MAX_OCCURRENCES = 50_000
const MAX_LINES = 12

export type CalendarItem = {
  title: string
  allDay: boolean
  /** The instant it starts. For an all-day item, Miami midnight of its first day. */
  start: Date
  end: Date
  /** A timed item that began on an earlier day and is still running. */
  continues?: boolean
}

/** What the calendar said for some Miami days, keyed YYYY-MM-DD. */
export type Agenda =
  | { status: 'off' }
  | { status: 'error'; reason: string }
  | { status: 'ok'; days: Record<string, CalendarItem[]> }

export function calendarConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CALENDAR_ICS_URL?.trim())
}

/* ------------------------------------------------------------------------ */
/* Time zones                                                                */
/* ------------------------------------------------------------------------ */

function isZone(tz: string | undefined): tz is string {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** A zone's offset from UTC, in ms, at an instant. */
function offsetMs(at: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(at))
  const p: Record<string, number> = {}
  for (const { type, value } of parts) if (type !== 'literal') p[type] = Number(value)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - at
}

/**
 * A wall-clock time in `tz` as an instant. The offset is read twice, the second
 * time at the corrected instant, which settles times near a DST change (the same
 * approach as `utcStamp` in dates.ts).
 */
export function zonedTime(y: number, mo: number, d: number, h = 0, mi = 0, s = 0, tz = SITE_TZ): Date {
  const naive = Date.UTC(y, mo - 1, d, h, mi, s)
  let ts = naive - offsetMs(naive, tz)
  ts = naive - offsetMs(ts, tz)
  return new Date(ts)
}

/** Miami midnight at the start of a YYYY-MM-DD day. */
export function miamiMidnight(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return zonedTime(y, m, d)
}

/** The Miami calendar day of an instant, YYYY-MM-DD. */
function miamiDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SITE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/** The TZID ical.js keeps from parsing. It is set at runtime but missing from its types. */
const tzOf = (t: ICAL.Time | undefined): string | undefined =>
  (t as (ICAL.Time & { timezone?: string }) | undefined)?.timezone || undefined

const ymd = (t: ICAL.Time) =>
  `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`

/** Whole days from one date to another, both read as calendar dates. */
const dayDiff = (a: ICAL.Time, b: ICAL.Time) =>
  Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000)

/**
 * The instant an ICAL time means. `tzid` is the zone the event was written in:
 * occurrences that ical.js expands from a rule lose it, so the caller passes the
 * master event's.
 *
 * - UTC (`...Z`) is taken as is.
 * - An IANA TZID, which is what Google writes, goes through Intl.
 * - Any other TZID uses the file's own VTIMEZONE, when it has one.
 * - Floating time, with no zone at all, is read as Miami time.
 */
function instant(t: ICAL.Time, tzid: string | undefined, zones: Map<string, ICAL.Timezone>): Date {
  if (t.zone === ICAL.Timezone.utcTimezone) {
    return new Date(Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second))
  }
  const tz = tzOf(t) || tzid
  if (isZone(tz)) return zonedTime(t.year, t.month, t.day, t.hour, t.minute, t.second, tz)
  const vtz = tz ? zones.get(tz) : undefined
  if (vtz) {
    const c = t.clone()
    c.zone = vtz
    return new Date(c.toUnixTime() * 1000)
  }
  return zonedTime(t.year, t.month, t.day, t.hour, t.minute, t.second)
}

/* ------------------------------------------------------------------------ */
/* Parsing                                                                   */
/* ------------------------------------------------------------------------ */

type Occurrence = { title: string; start: ICAL.Time; end: ICAL.Time; tzid?: string }

const cancelled = (e: ICAL.Event) =>
  String(e.component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED'

const titleOf = (e: ICAL.Event) => (e.summary || '').trim() || '(no title)'

const tzidOf = (e: ICAL.Event): string | undefined => {
  const p = e.component.getFirstProperty('dtstart')?.getParameter('tzid')
  return (Array.isArray(p) ? p[0] : p) || tzOf(e.startDate)
}

/**
 * Put one occurrence on the Miami days it belongs to.
 *
 * An all-day item is on every date from its start up to, not including, its
 * end. A timed item is on the day it starts, so 11:30 PM stays on its own
 * evening rather than spilling into tomorrow; one lasting a day or more also
 * shows on the later days it covers, marked as continuing.
 */
function place(
  o: Occurrence,
  days: string[],
  out: Record<string, CalendarItem[]>,
  zones: Map<string, ICAL.Timezone>,
) {
  if (o.start.isDate) {
    const first = ymd(o.start)
    const n = Math.max(1, dayDiff(o.start, o.end))
    const last = addDays(first, n - 1)
    for (const day of days) {
      if (day >= first && day <= last) {
        out[day].push({
          title: o.title,
          allDay: true,
          start: miamiMidnight(first),
          end: miamiMidnight(addDays(last, 1)),
        })
      }
    }
    return
  }
  const start = instant(o.start, o.tzid, zones)
  const endRaw = instant(o.end, o.tzid, zones)
  const end = endRaw > start ? endRaw : start
  const startDay = miamiDay(start)
  const long = end.getTime() - start.getTime() >= 86_400_000
  for (const day of days) {
    if (day === startDay) out[day].push({ title: o.title, allDay: false, start, end })
    else if (long && day > startDay && miamiMidnight(day) < end) {
      out[day].push({ title: o.title, allDay: false, start, end, continues: true })
    }
  }
}

/**
 * The items on each of `days` (Miami dates, YYYY-MM-DD), sorted with all-day
 * items first and then by start time. Cancelled events and cancelled single
 * occurrences are left out. A moved occurrence (a RECURRENCE-ID override) shows
 * at its new time, wherever it was moved from.
 */
export function agendaFromIcs(ics: string, days: string[]): Record<string, CalendarItem[]> {
  const out: Record<string, CalendarItem[]> = Object.fromEntries(days.map((d) => [d, []]))
  if (!days.length) return out
  const root = new ICAL.Component(ICAL.parse(ics))

  const zones = new Map<string, ICAL.Timezone>()
  for (const vtz of root.getAllSubcomponents('vtimezone')) {
    const tz = new ICAL.Timezone(vtz)
    if (tz.tzid) zones.set(tz.tzid, tz)
  }

  const events = root.getAllSubcomponents('vevent').map((v) => new ICAL.Event(v))
  // Overrides, by UID, keyed by the occurrence they replace.
  const overrides = new Map<string, Set<string>>()
  for (const e of events) {
    if (!e.isRecurrenceException()) continue
    const set = overrides.get(e.uid) ?? new Set<string>()
    set.add(e.recurrenceId.toString())
    overrides.set(e.uid, set)
  }

  // Expansion stops at the day after the last one asked for, in wall-clock
  // terms; the extra day covers any zone a TZID could put an event in.
  const last = [...days].sort().at(-1)!
  const stopAt = addDays(last, 2)

  for (const e of events) {
    if (!e.startDate) continue
    const tzid = tzidOf(e)
    if (e.isRecurrenceException() || !e.isRecurring()) {
      if (!cancelled(e)) place({ title: titleOf(e), start: e.startDate, end: e.endDate, tzid }, days, out, zones)
      continue
    }
    if (cancelled(e)) continue
    const skip = overrides.get(e.uid)
    const duration = e.duration
    const it = e.iterator()
    let next: ICAL.Time | null
    for (let i = 0; i < MAX_OCCURRENCES && (next = it.next()); i++) {
      if (ymd(next) > stopAt) break
      if (skip?.has(next.toString())) continue
      const end = next.clone()
      end.addDuration(duration)
      place({ title: titleOf(e), start: next, end, tzid }, days, out, zones)
    }
  }

  for (const day of days) {
    out[day].sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime())
  }
  return out
}

/* ------------------------------------------------------------------------ */
/* Fetching                                                                  */
/* ------------------------------------------------------------------------ */

/** Why a read failed, in words safe to log and to show: never the URL. */
function reasonFor(err: unknown): string {
  const name = (err as { name?: string })?.name
  if (name === 'TimeoutError' || name === 'AbortError') return 'timed out'
  if (err instanceof TypeError) return 'unreachable'
  return 'unreadable'
}

/**
 * Read the calendar for some Miami days. With `GOOGLE_CALENDAR_ICS_URL` unset
 * this returns `off` without touching the network. A failure (timeout, HTTP
 * error, a file that will not parse) comes back as `error` with a short reason
 * rather than throwing, so a calendar problem never stops a brief.
 */
export async function readAgenda(days: string[]): Promise<Agenda> {
  const raw = process.env.GOOGLE_CALENDAR_ICS_URL?.trim()
  if (!raw) return { status: 'off' }
  // Google offers the same address as webcal:// in some places.
  const url = raw.replace(/^webcal:\/\//i, 'https://')
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: 'text/calendar' },
      cache: 'no-store',
    })
    if (!res.ok) {
      console.warn(`[calendar] read failed: HTTP ${res.status}`)
      return { status: 'error', reason: `HTTP ${res.status}` }
    }
    return { status: 'ok', days: agendaFromIcs(await res.text(), days) }
  } catch (err) {
    const reason = reasonFor(err)
    console.warn(`[calendar] read failed: ${reason}`)
    return { status: 'error', reason }
  }
}

/* ------------------------------------------------------------------------ */
/* Telegram lines                                                            */
/* ------------------------------------------------------------------------ */

const clock = (d: Date) =>
  new Intl.DateTimeFormat('en-US', { timeZone: SITE_TZ, hour: 'numeric', minute: '2-digit' }).format(d)

/** "• 9:00 AM — Standup", "• All day — Flamingo Fest", "• Until 5:00 PM — Conference". */
export function itemLine(item: CalendarItem): string {
  const when = item.allDay ? 'All day' : item.continues ? `Until ${clock(item.end)}` : clock(item.start)
  return `• ${esc(when)} — ${esc(item.title)}`
}

/**
 * A titled calendar section as Telegram HTML lines. Nothing at all when the calendar is not set up; one line of explanation when
 * it could not be read.
 */
export function agendaSection(heading: string, agenda: Agenda, day: string): string[] {
  if (agenda.status === 'off') return []
  const out = [`<b>${esc(heading)}</b>`]
  if (agenda.status === 'error') {
    out.push(`<i>Calendar unavailable (${esc(agenda.reason)}).</i>`)
    return out
  }
  const items = agenda.days[day] ?? []
  if (!items.length) out.push('Nothing on the calendar.')
  for (const item of items.slice(0, MAX_LINES)) out.push(itemLine(item))
  if (items.length > MAX_LINES) out.push(`<i>…and ${items.length - MAX_LINES} more</i>`)
  return out
}
