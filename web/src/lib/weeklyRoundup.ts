import type { Payload } from 'payload'
import sharp from 'sharp'

import type { City, Event, EventKind, HqSocialDraft, Media } from '../payload-types'
import { CAPTION_MAX, busyTimes, cardImage, creditLine, fact, oneAtATime, pickPostTime } from './autoDraft'
import { miamiHour } from './brief'
import { SITE_TZ, addDays, eventRunEnd, miamiInstant, shortWeekday, todayISO, weekday } from './dates'
import { eventVenue } from './eventVenue'
import { HQ_INTERNAL, recordEvent, sendDraftPreview } from './hq'
import type { Platform } from './postiz'
import { routes } from './routes'
import { SITE_URL } from './site'
import { isAnnounceable, monthShort, unshout, weekEvents, weekMonday, weekRange, type WeekDay } from './week'

/**
 * The Monday roundup: one social post a week for the week's events, in place
 * of a post per event (lib/autoDraft.ts, `EVENT_AUTO_DRAFTS`).
 *
 * Every Monday morning, Miami time, the `weeklyRoundup` job (src/jobs) writes
 * one pending `hq-social-drafts` entry for the week, Monday to Sunday:
 *
 * - a carousel: the week's cover (lib/weekCover.tsx), then the Spanish card of
 *   each event, up to nine, so ten pictures at most (Instagram's limit);
 * - a caption, Spanish then English, one line per event, ending with a
 *   tracked link to the week's page (/es/this-week);
 * - set for 11:30 that morning, or the next free slot.
 *
 * It then goes through the normal Approve / Reject preview: nothing is posted
 * from here. A week with nothing on drafts nothing. `dedupeKey` makes the
 * database refuse a second draft for the same week, so the hourly job, a
 * retry, a restart or a second process all end at one.
 */

export const ROUNDUP_SOURCE = 'weekly-roundup'
/** Nine event cards after the cover: Instagram takes ten pictures in a carousel. */
export const ROUNDUP_MAX_EVENTS = 9
/** The job runs hourly; it drafts from this hour on Mondays, before the 7:30 brief lists what is waiting. */
export const ROUNDUP_HOUR = 7

type Lang = 'es' | 'en'

export function roundupKey(monday: string): string {
  return `${ROUNDUP_SOURCE}:${monday}`
}

/** Whether an hourly run should draft: Monday, from 7 AM, on a Miami clock. */
export function isRoundupTime(now: Date = new Date()): boolean {
  const dow = new Intl.DateTimeFormat('en-US', { timeZone: SITE_TZ, weekday: 'short' }).format(now)
  return dow === 'Mon' && miamiHour(now) >= ROUNDUP_HOUR
}

/** The week's roundup draft, whatever its status, or null if it has not been drafted. */
export async function roundupFor(payload: Payload, monday: string): Promise<HqSocialDraft | null> {
  const { docs } = await payload.find({
    collection: 'hq-social-drafts',
    where: { dedupeKey: { equals: roundupKey(monday) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs[0] ?? null
}

/** Whether the week holding `iso` already has its roundup: an event published after it gets no post of its own. */
export async function roundupExists(payload: Payload, iso: string = todayISO()): Promise<boolean> {
  return Boolean(await roundupFor(payload, weekMonday(iso)))
}

/* ------------------------------------------------------------------------ */
/* Which events                                                              */
/* ------------------------------------------------------------------------ */

export type Placed = { ev: Event; day: string }

/**
 * The events the post shows, in date order, and how many the week has in
 * all. With more than nine, the owner's starred ones go first, then the
 * weekend's (shown on a Saturday or Sunday: the owner's call, 2026-10-10, as
 * the days people plan for), then the ones with a photo, then the earliest.
 */
export function pickRoundupEvents(days: WeekDay<Event>[], max: number = ROUNDUP_MAX_EVENTS): { chosen: Placed[]; total: number } {
  const all = days.flatMap((d) => d.items.map((ev) => ({ ev, day: d.iso })))
  const order = new Map(all.map((p, i) => [p, i]))
  const weekend = (p: Placed) => [0, 6].includes(weekday(p.day))
  const rank = (p: Placed) => [p.ev.star ? 0 : 1, weekend(p) ? 0 : 1, p.ev.image ? 0 : 1, order.get(p)!]
  const kept =
    all.length <= max
      ? all
      : [...all]
          .sort((a, b) => {
            const [x, y] = [rank(a), rank(b)]
            return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || x[3] - y[3]
          })
          .slice(0, max)
          .sort((a, b) => order.get(a)! - order.get(b)!)
  return { chosen: kept, total: all.length }
}

/* ------------------------------------------------------------------------ */
/* Caption                                                                   */
/* ------------------------------------------------------------------------ */

/** One emoji per kind of event; anything else gets the calendar. */
const KIND_EMOJI: Record<string, string> = {
  music: '🎵',
  domino: '🎲',
  food: '🍽️',
  family: '👨‍👩‍👧',
  sports: '📺',
  church: '🤝',
  opening: '✂️',
}

function emoji(ev: Event): string {
  if (ev.season === 'halloween') return '🎃'
  const kind = ev.kind && typeof ev.kind === 'object' ? (ev.kind as EventKind) : null
  return (kind?.slug && KIND_EMOJI[kind.slug]) || '🗓'
}

/** "Sáb 17" / "Sat 17". */
function dayLabel(iso: string, lang: Lang): string {
  const wd = shortWeekday(iso, lang).toLowerCase()
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${Number(iso.slice(8, 10))}`
}

/**
 * When, on the event's line: its day; for a run, from its first day in the
 * week to its last ("Sáb 17 – Dom 18"), or "Hasta el lun 19" for one that
 * opened before the week.
 */
function when(p: Placed, monday: string, lang: Lang): string {
  const end = eventRunEnd(p.ev)
  if (end <= p.day) return dayLabel(p.day, lang)
  const started = p.ev.date.slice(0, 10) < monday
  if (started) return lang === 'es' ? `Hasta el ${dayLabel(end, lang).toLowerCase()}` : `Through ${dayLabel(end, lang)}`
  return `${dayLabel(p.day, lang)} – ${dayLabel(end, lang)}`
}

function eventLine(p: Placed, ev: Event, monday: string, lang: Lang): string {
  const title = fact(ev.title)
  if (!title) return ''
  const city = eventVenue(ev).city as City | null
  const where = city ? unshout(fact(city.name)) : ''
  return [`${emoji(ev)} ${when(p, monday, lang)}`, title, where].filter(Boolean).join(' · ')
}

/** "12–18 oct" / "Oct 12–18", for the caption's first line. */
function captionRange(monday: string, lang: Lang): string {
  const sunday = addDays(monday, 6)
  const d = (iso: string) => Number(iso.slice(8, 10))
  const m = (iso: string) => {
    const s = monthShort(iso, lang)
    return lang === 'es' ? s.toLowerCase() : s.charAt(0) + s.slice(1).toLowerCase()
  }
  const same = monday.slice(0, 7) === sunday.slice(0, 7)
  if (lang === 'es') return same ? `${d(monday)}–${d(sunday)} ${m(sunday)}` : `${d(monday)} ${m(monday)} – ${d(sunday)} ${m(sunday)}`
  return same ? `${m(sunday)} ${d(monday)}–${d(sunday)}` : `${m(monday)} ${d(monday)} – ${m(sunday)} ${d(sunday)}`
}

/**
 * The caption: a Spanish block and an English one, each a heading and one
 * line per event drawn from the events' own fields (no prices, no
 * descriptions), then the link and any photo credits. `byLang` holds each
 * event read in that language with no fallback, so a missing translation is
 * left out rather than repeated.
 */
export function roundupCaption(
  monday: string,
  chosen: Placed[],
  total: number,
  byLang: Record<Lang, Map<number, Event>>,
  link: string,
  credits: string[] = [],
): string {
  const more = total - chosen.length
  const block = (lang: Lang, lines: Placed[]) => {
    const events = lines
      .map((p) => {
        const ev = byLang[lang].get(p.ev.id)
        return ev ? eventLine(p, ev, monday, lang) : ''
      })
      .filter(Boolean)
    if (!events.length) return ''
    const heading =
      lang === 'es'
        ? `📅 Esta semana en Flamingo County, ${captionRange(monday, 'es')}:`
        : `📅 This week in Flamingo County, ${captionRange(monday, 'en')}:`
    const rest = more > 0 ? [lang === 'es' ? `…y ${more} más en la web.` : `…and ${more} more on the site.`] : []
    return [heading, '', ...events, ...rest].join('\n')
  }
  const tail = [link ? `👉 ${link}` : '', ...credits].filter(Boolean).join('\n\n')
  const build = (lines: Placed[]) =>
    [block('es', lines), block('en', lines), tail].filter(Boolean).join('\n\n')
  // Nine short lines a language fit with room to spare; should the titles run
  // long, the last events come off the caption (they stay in the carousel).
  let lines = chosen
  let text = build(lines)
  while (text.length > CAPTION_MAX && lines.length > 1) {
    lines = lines.slice(0, -1)
    text = build(lines)
  }
  return text.length > CAPTION_MAX ? `${text.slice(0, CAPTION_MAX - 1)}…` : text
}

/* ------------------------------------------------------------------------ */
/* The draft                                                                 */
/* ------------------------------------------------------------------------ */

/** The week's published events, in one language, at the depth the cards need (event → listing → city). */
async function readWeek(payload: Payload, monday: string, locale: Lang, fallback: boolean): Promise<Event[]> {
  const sunday = addDays(monday, 6)
  const { docs } = await payload.find({
    collection: 'events',
    where: {
      and: [
        { _status: { equals: 'published' } },
        { date: { less_than_equal: `${sunday}T23:59:59.999Z` } },
        {
          or: [
            { date: { greater_than_equal: `${monday}T00:00:00.000Z` } },
            { endDate: { greater_than_equal: `${monday}T00:00:00.000Z` } },
          ],
        },
      ],
    },
    locale,
    ...(fallback ? {} : { fallbackLocale: false as const }),
    sort: 'date',
    limit: 300,
    depth: 2,
    overrideAccess: true,
  })
  return docs as Event[]
}

/** A week being drafted in this process. The database's unique key covers every other process. */
const drafting = new Set<string>()

/**
 * Draft the roundup for the week holding `now` (Miami's calendar). Returns the
 * draft, or null when there is nothing to do: the week already has one, or
 * nothing is on, or the cover could not be drawn (the next hourly run tries
 * again).
 */
export async function draftWeeklyRoundup(payload: Payload, now: Date = new Date()): Promise<HqSocialDraft | null> {
  const monday = weekMonday(todayISO(now))
  const key = roundupKey(monday)
  if (drafting.has(key)) return null
  drafting.add(key)
  try {
    // In the same queue as the per-page drafts, so each sees the other's slot.
    return await oneAtATime(() => create(payload, monday, now))
  } finally {
    drafting.delete(key)
  }
}

async function create(payload: Payload, monday: string, now: Date): Promise<HqSocialDraft | null> {
  if (await roundupFor(payload, monday)) return null

  // Cards draw with each field falling back to the other language, as an
  // event's own card does; the caption takes each language as written.
  const [cardsEs, es, en] = await Promise.all([
    readWeek(payload, monday, 'es', true),
    readWeek(payload, monday, 'es', false),
    readWeek(payload, monday, 'en', false),
  ])
  const live = cardsEs.filter(isAnnounceable)
  const days = weekEvents(live, monday, todayISO(now) > monday ? todayISO(now) : monday)
  const { chosen, total } = pickRoundupEvents(days)
  if (!chosen.length) return null

  const label = `the week of ${monday}`
  const media: number[] = []
  const drop = async () => {
    for (const id of media) await payload.delete({ collection: 'hq-media', id, overrideAccess: true }).catch(() => undefined)
  }

  // The cover first. No cover, no draft: a carousel that opens on one
  // event's card would read as that event's post.
  try {
    const { renderWeekCover, weekCoverData } = await import('./weekCover')
    const png = await renderWeekCover(weekCoverData(monday, live))
    const jpeg = await sharp(Buffer.from(png)).flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer()
    const cover = await payload.create({
      collection: 'hq-media',
      data: { note: `Weekly roundup cover for ${label}` },
      file: { data: jpeg, mimetype: 'image/jpeg', name: `week-${monday}-cover-${Date.now()}.jpg`, size: jpeg.length },
      overrideAccess: true,
    })
    media.push(cover.id)
  } catch (err) {
    console.error(`[hq] weekly roundup: no cover for ${label}:`, err instanceof Error ? err.message : err)
    return null
  }
  for (const p of chosen) {
    const card = await cardImage(payload, p.ev, 'es', `event #${p.ev.id}`, p.ev.slug, `for the roundup of ${label}`)
    if (card) media.push(card)
  }

  // A credited photo is credited wherever it is used: once per photo.
  const credits = [
    ...new Set(
      chosen
        .map((p) => (p.ev.image && typeof p.ev.image === 'object' ? creditLine(p.ev.image as Media) : null))
        .filter((c): c is string => Boolean(c)),
    ),
  ]
  const byLang = {
    es: new Map(es.map((ev) => [ev.id, ev])),
    en: new Map(en.map((ev) => [ev.id, ev])),
  }
  const pagePath = routes.thisWeek('es')
  const platforms: Platform[] = ['facebook', 'instagram']
  // 11:30 on Monday, or the next free slot by Tuesday evening; past that, the
  // first slot whether or not it is crowded (see `pickPostTime`).
  const scheduledFor = pickPostTime(
    now,
    await busyTimes(payload, now),
    miamiInstant(addDays(monday, 1), '19:00'),
    miamiInstant(monday, '11:30'),
  )

  let draft: HqSocialDraft
  try {
    draft = await payload.create({
      collection: 'hq-social-drafts',
      data: {
        status: 'pending',
        caption: roundupCaption(monday, chosen, total, byLang, '', credits),
        platforms,
        media,
        scheduledFor: scheduledFor.toISOString(),
        pillar: 'event',
        language: 'both',
        sourceCollection: ROUNDUP_SOURCE,
        sourceId: monday,
        dedupeKey: roundupKey(monday),
      },
      overrideAccess: true,
      // The preview waits until the caption carries its own tracking link.
      context: { [HQ_INTERNAL]: true },
    })
  } catch (err) {
    // Another process drafted the week first: the unique key refused this one.
    await drop()
    if (await roundupFor(payload, monday)) return null
    throw err
  }

  const link = `${SITE_URL}/go/fb/${draft.id}?to=${pagePath}`
  const final = await payload.update({
    collection: 'hq-social-drafts',
    id: draft.id,
    data: { caption: roundupCaption(monday, chosen, total, byLang, link, credits) },
    overrideAccess: true,
    context: { [HQ_INTERNAL]: true },
  })

  await recordEvent(payload, {
    type: 'social.draft_created',
    summary: `Social draft #${final.id} for ${platforms.join(', ')}: the weekly roundup of ${weekRange(monday, 'en')} (${total} event${total === 1 ? '' : 's'}, ${media.length} picture${media.length === 1 ? '' : 's'})`,
    refCollection: 'hq-social-drafts',
    refId: final.id,
  })
  void sendDraftPreview(payload, final).catch((err) =>
    console.error('[hq] draft preview failed:', err instanceof Error ? err.message : err),
  )
  return final
}
