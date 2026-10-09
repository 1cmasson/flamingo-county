import { noPrice } from '../fields/shared'
import type { Lang } from '../i18n'
import type { City, Event } from '../payload-types'
import { addDays, boardDayIn, eventDaysIn, eventRunEnd, todayISO, weekday, type EventDates } from './dates'
import type { EventSetting } from './eventSetting'
import { eventVenue } from './eventVenue'

/**
 * "This week" as the weekly page (/es/this-week) and the Monday roundup post
 * (lib/weeklyRoundup.ts) both mean it: Monday to Sunday on Miami's calendar.
 *
 * Plain date strings throughout, as in lib/dates.ts, and no Payload here, so
 * the page, the cover card and the job can all import it.
 */

/** The Monday of the week holding `iso`, YYYY-MM-DD. Sunday belongs to the week before it. */
export function weekMonday(iso: string = todayISO()): string {
  const dow = weekday(iso)
  return addDays(iso, dow === 0 ? -6 : 1 - dow)
}

/** Monday's date for a `YYYY-MM-DD` that names any day of a week, or null if it is not a date. */
export function parseWeek(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const t = Date.parse(`${value}T12:00:00Z`)
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== value) return null
  return weekMonday(value)
}

/** The week's seven days, Monday first. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

export type WeekDay<E> = { iso: string; items: E[] }

/**
 * The week's events under the day each is shown on: the first day of its run
 * that falls in the week, and not before `today`, so a finished event drops
 * off midweek as on the board and an exhibit running all month is listed
 * once. Days with nothing on are left out. Events keep their input order
 * within a day.
 *
 * Unlike the board, a past-midnight night is not carried into the next
 * morning: last Sunday's 9PM–1AM is not this Monday's event.
 */
export function weekEvents<E extends EventDates>(events: E[], monday: string, today: string = monday): WeekDay<E>[] {
  const sunday = addDays(monday, 6)
  const from = today > monday ? today : monday
  const placed = events
    .filter((ev) => eventRunEnd(ev) >= from)
    .map((ev) => ({ ev, day: boardDayIn(ev, from, sunday, from) }))
    .filter((p): p is { ev: E; day: string } => p.day !== null)
  return weekDays(monday)
    .map((iso) => ({ iso, items: placed.filter((p) => p.day === iso).map((p) => p.ev) }))
    .filter((d) => d.items.length)
}

/**
 * An event the roundup announces and its cover counts: not cancelled or
 * postponed, and with a title that names no price (the site prints none).
 */
export function isAnnounceable(ev: Pick<Event, 'eventStatus' | 'title'>): boolean {
  const title = (ev.title ?? '').trim()
  return ev.eventStatus !== 'cancelled' && ev.eventStatus !== 'postponed' && Boolean(title) && noPrice(title) === true
}

/** How many of `events` are on each of the week's seven days, a run counted on every day it covers. */
export function eventsPerDay(events: EventDates[], monday: string): number[] {
  const sunday = addDays(monday, 6)
  const counts = [0, 0, 0, 0, 0, 0, 0]
  for (const ev of events) {
    for (const d of eventDaysIn(ev, monday, sunday)) counts[weekDays(monday).indexOf(d)]++
  }
  return counts
}

/* ------------------------------------------------------------------------ */
/* Words                                                                     */
/* ------------------------------------------------------------------------ */

const MONTH: Record<Lang, string[]> = {
  es: ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'],
  en: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
}

/** "OCT" / "OCT", "AGO" / "AUG": the month of `iso`, in capitals. */
export function monthShort(iso: string, lang: Lang): string {
  return MONTH[lang][Number(iso.slice(5, 7)) - 1]
}

/** "12–18 OCT", or "28 SEP – 4 OCT" across a month. Written out, not Intl: the card must not change with the ICU build. */
export function weekRange(monday: string, lang: Lang): string {
  const sunday = addDays(monday, 6)
  const d = (iso: string) => Number(iso.slice(8, 10))
  const m = (iso: string) => monthShort(iso, lang)
  return monday.slice(0, 7) === sunday.slice(0, 7)
    ? `${d(monday)}–${d(sunday)} ${m(sunday)}`
    : `${d(monday)} ${m(monday)} – ${d(sunday)} ${m(sunday)}`
}

/** "HIALEAH" → "Hialeah". City names are stored in caps for the design. */
export function unshout(s: string): string {
  return s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : s
}

/** The cities a week's events are in, in order of how many each has, as stored (caps). */
export function weekCities(events: Event[]): City[] {
  const count = new Map<number, { city: City; n: number }>()
  for (const ev of events) {
    const city = eventVenue(ev).city
    if (!city) continue
    const c = count.get(city.id) ?? { city, n: 0 }
    c.n++
    count.set(city.id, c)
  }
  return [...count.values()].sort((a, b) => b.n - a.n).map((c) => c.city)
}

/* ------------------------------------------------------------------------ */
/* The cover's scene                                                         */
/* ------------------------------------------------------------------------ */

/**
 * The drawn scenes the weekly cover turns through, one a week, so the grid
 * reads as one series with some variety: Miami Lakes' Main Street plaza and
 * the Hialeah gateway, the cities' own scenes (lib/eventSetting.ts). A week
 * whose events are all in one of those cities stands on that city's scene.
 * Little Havana's Calle Ocho is left out of the cover for now, at the owner's
 * word: it stays the scene of Little Havana's own event cards.
 */
export const COVER_SCENES = ['main-street-lakes', 'hialeah-gateway'] as const satisfies readonly EventSetting[]
export type CoverScene = (typeof COVER_SCENES)[number]

const CITY_SCENE: Record<string, CoverScene> = {
  lakes: 'main-street-lakes',
  hialeah: 'hialeah-gateway',
}

/** Weeks since Monday 2026-01-05, so the rotation is the same on every machine. */
function weekIndex(monday: string): number {
  return Math.round((Date.parse(`${monday}T12:00:00Z`) - Date.parse('2026-01-05T12:00:00Z')) / (7 * 86_400_000))
}

export function coverScene(monday: string, citySlugs: string[]): CoverScene {
  const only = new Set(citySlugs)
  if (only.size === 1) {
    const scene = CITY_SCENE[[...only][0]]
    if (scene) return scene
  }
  const n = COVER_SCENES.length
  return COVER_SCENES[((weekIndex(monday) % n) + n) % n]
}
