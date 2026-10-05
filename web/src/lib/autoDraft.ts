import { readFile } from 'fs/promises'
import path from 'path'
import type { CollectionAfterChangeHook, Payload } from 'payload'
import sharp from 'sharp'

import { noPrice } from '../fields/shared'
import type { City, Event, HqSocialDraft, Listing, Media, Story } from '../payload-types'
import { addDays, dateOnly, eventEndDay, eventRunEnd, miamiInstant, parseISO, todayISO } from './dates'
import { HQ_INTERNAL, POST_GAP_MS, recordEvent, sendDraftPreview } from './hq'
import { photoCredit } from './photoLicense'
import type { Platform } from './postiz'
import { routes } from './routes'
import { SITE_URL } from './site'

/**
 * A social draft for a page the moment it goes live.
 *
 * When an event or story moves from draft to published (the owner's Publish
 * tap in Telegram, or Publish in the admin), HQ writes one pending
 * `hq-social-drafts` entry for it. That draft then goes through the normal
 * Approve / Reject preview: nothing is posted or scheduled from here.
 *
 * The caption is a template over the record's own fields, Spanish first, then
 * English. It adds no facts, and a field that names a price is left out.
 */

export type AutoDraftSource = 'events' | 'stories'
type Lang = 'es' | 'en'

/** TikTok's limit, the tightest of the three platforms. */
const CAPTION_MAX = 2000
/** A long event note or story dek is cut to this, at a word boundary. */
const EXCERPT_MAX = 280

/** Two publishes of one page at the same moment must not both draft it. */
const drafting = new Set<string>()

/**
 * Drafts are written one at a time, so that pages published together each see
 * the others' times when picking their own slot (see `pickPostTime`).
 */
let queue: Promise<unknown> = Promise.resolve()
function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => undefined)
  return run
}

/** The `afterChange` hook for Events and Stories. It never fails the publish. */
export function autoDraftHook(collection: AutoDraftSource): CollectionAfterChangeHook {
  return async ({ doc, previousDoc, operation, req }) => {
    // Only the draft → published transition. A draft save, a published page
    // saved again, and a page created already published (the seed, test
    // fixtures) leave social alone.
    const was = (previousDoc as { _status?: string } | undefined)?._status
    const now = (doc as { _status?: string })._status
    if (operation !== 'update' || was !== 'draft' || now !== 'published') return doc
    try {
      // `req` is not passed on: the draft writes carry HQ's own context, which
      // would otherwise be merged into this publish request's.
      await draftForPublished(req.payload, collection, doc.id as number)
    } catch (err) {
      console.error('[hq] auto-draft failed:', err instanceof Error ? err.message : err)
    }
    return doc
  }
}

/**
 * Create the pending social draft for a page that just went live. Returns it,
 * or null when there was nothing to draft: the page already has a draft (a
 * republish), or it is an event that is over, cancelled or postponed.
 */
export async function draftForPublished(
  payload: Payload,
  collection: AutoDraftSource,
  id: number,
  now: Date = new Date(),
): Promise<HqSocialDraft | null> {
  const key = `${collection}:${id}`
  if (drafting.has(key)) return null
  drafting.add(key)
  try {
    return await oneAtATime(() => create(payload, collection, id, now))
  } finally {
    drafting.delete(key)
  }
}

async function create(
  payload: Payload,
  collection: AutoDraftSource,
  id: number,
  now: Date,
): Promise<HqSocialDraft | null> {
  // Each language on its own, with no fallback, so a missing translation is
  // left out instead of repeating the English under the Spanish.
  // Depth 2 reaches a listing venue's city, which the event card draws.
  const read = (locale: Lang) =>
    payload.findByID({ collection, id, locale, fallbackLocale: false, depth: 2, overrideAccess: true })
  const [es, en] = await Promise.all([read('es'), read('en')])

  // A draft already written for this page means a republish. Only drafts made
  // since the page was created count: SQLite hands a deleted row's id to the
  // next one, and a page that reuses it is still a new page.
  const existing = await payload.find({
    collection: 'hq-social-drafts',
    where: {
      and: [
        { sourceCollection: { equals: collection } },
        { sourceId: { equals: String(id) } },
        { createdAt: { greater_than_equal: en.createdAt } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existing.docs.length) return null

  let body: (excerpts: boolean) => string
  let pagePath: string
  let cover: Media | number | null | undefined
  let deadline: Date | null = null
  let notBefore: Date | null = null
  let event: Event | null = null
  let eventEn: Event | null = null

  if (collection === 'events') {
    const ev = { es: es as Event, en: en as Event }
    if (!eventIsAhead(ev.en, now)) return null
    body = (excerpts) => bilingual((l) => eventLines(ev[l], l, excerpts))
    pagePath = routes.event('es', ev.en.slug)
    cover = ev.en.image
    deadline = postDeadline(ev.en, now)
    notBefore = postWindowStart(ev.en, now)
    // Two cards, a carousel: Spanish first (the audience is Spanish-first),
    // then English. Unlike the caption, each card falls back to the other
    // language for a field with no translation: a card with no title is worse
    // than one with a borrowed title.
    ;[event, eventEn] = (await Promise.all(
      (['es', 'en'] as const).map((locale) =>
        payload.findByID({ collection, id, locale, depth: 2, overrideAccess: true }),
      ),
    )) as [Event, Event]
  } else {
    const st = { es: es as Story, en: en as Story }
    body = (excerpts) => bilingual((l) => storyLines(st[l], excerpts))
    pagePath = routes.story('es', st.en.slug)
    cover = st.en.cover
  }

  // Every title named a price: there is nothing left to say but the link.
  if (!body(false)) return null

  const title = (en as { title?: string }).title ?? ''
  const slug = (en as { slug: string }).slug
  // An event's generated card, which frames its photo when it has one (with
  // the credit printed on it); a story's cover photo. A card that cannot be
  // drawn falls back to the photo itself.
  const label = `${collection} #${id}`
  // Spanish card, then English card; the English one only when the Spanish
  // one was drawn, so a carousel never opens in English.
  const cards: number[] = []
  if (event) {
    const es = await cardImage(payload, event, 'es', label, slug)
    if (es) {
      cards.push(es)
      const enCard = eventEn ? await cardImage(payload, eventEn, 'en', label, slug) : null
      if (enCard) cards.push(enCard)
    }
  }
  if (!cards.length) {
    const photo = await copyCover(payload, cover, label, slug)
    if (photo) cards.push(photo)
  }
  const media = cards[0] ?? null
  // The photo's credit goes in the caption wherever the photo is in the post.
  const coverDoc: Media | null =
    cover && typeof cover !== 'object'
      ? await payload.findByID({ collection: 'media', id: cover, depth: 0, overrideAccess: true }).catch(() => null)
      : ((cover as Media | null | undefined) ?? null)
  const credit = media ? creditLine(coverDoc) : null
  // Instagram and TikTok need media; a still goes to Facebook and Instagram.
  // TikTok is left to the owner, since it wants video.
  const platforms: Platform[] = media ? ['facebook', 'instagram'] : ['facebook']
  const scheduledFor = pickPostTime(now, await busyTimes(payload, now), deadline, notBefore)

  const draft = await payload.create({
    collection: 'hq-social-drafts',
    data: {
      status: 'pending',
      caption: caption(body, '', credit),
      platforms,
      media: cards,
      scheduledFor: scheduledFor.toISOString(),
      pillar: collection === 'events' ? 'event' : 'story',
      language: 'both',
      sourceCollection: collection,
      sourceId: String(id),
    },
    overrideAccess: true,
    // The preview waits until the caption carries its own tracking link.
    context: { [HQ_INTERNAL]: true },
  })

  // The link names the draft, so it is written once the id exists.
  const link = `${SITE_URL}/go/fb/${draft.id}?to=${pagePath}`
  const final = await payload.update({
    collection: 'hq-social-drafts',
    id: draft.id,
    data: { caption: caption(body, link, credit) },
    overrideAccess: true,
    context: { [HQ_INTERNAL]: true },
  })

  await recordEvent(payload, {
    type: 'social.draft_created',
    summary: `Social draft #${final.id} for ${platforms.join(', ')}, from the newly published ${collection === 'events' ? 'event' : 'story'} "${title}"`,
    refCollection: 'hq-social-drafts',
    refId: final.id,
  })
  // Not awaited, as for any new draft: a publish should not wait on Telegram.
  void sendDraftPreview(payload, final).catch((err) =>
    console.error('[hq] draft preview failed:', err instanceof Error ? err.message : err),
  )
  return final
}

/* ------------------------------------------------------------------------ */
/* Captions                                                                  */
/* ------------------------------------------------------------------------ */

/** A field's text, or nothing if it is empty or names a price. */
function fact(value: string | null | undefined): string {
  const text = (value ?? '').trim()
  return text && noPrice(text) === true ? text : ''
}

function excerpt(value: string | null | undefined): string {
  const text = fact(value).replace(/\s+/g, ' ')
  if (text.length <= EXCERPT_MAX) return text
  const cut = text.slice(0, EXCERPT_MAX - 1)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), EXCERPT_MAX / 2)).trimEnd()}…`
}

/** "HIALEAH" → "Hialeah". City names are stored in caps for the design. */
function unshout(s: string): string {
  return s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : s
}

function longDate(iso: string, lang: Lang): string {
  const s = new Intl.DateTimeFormat(lang === 'es' ? 'es' : 'en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(parseISO(iso))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function eventLines(ev: Event, lang: Lang, excerpts: boolean): string[] {
  const title = fact(ev.title)
  if (!title) return []
  const start = dateOnly(ev.date)
  const end = dateOnly(ev.endDate)
  const when = [end && end > start ? `${longDate(start, lang)} – ${longDate(end, lang)}` : longDate(start, lang), fact(ev.timeLabel)]
    .filter(Boolean)
    .join(' · ')

  const listing = typeof ev.listing === 'object' ? (ev.listing as Listing | null) : null
  const city = typeof ev.city === 'object' ? (ev.city as City | null) : null
  const where =
    ev.venueType === 'listing'
      ? fact(listing?.name)
      : [fact(ev.place), city ? unshout(fact(city.name)) : ''].filter(Boolean).join(', ')

  return [
    ev.eventStatus === 'rescheduled' ? (lang === 'es' ? 'NUEVA FECHA' : 'NEW DATE') : '',
    title,
    `🗓 ${when}`,
    where ? `📍 ${where}` : '',
    fact(ev.freeLabel),
    excerpts ? excerpt(ev.note) : '',
  ].filter(Boolean)
}

function storyLines(st: Story, excerpts: boolean): string[] {
  const title = fact(st.title)
  if (!title) return []
  return [title, excerpts ? excerpt(st.dek) : ''].filter(Boolean)
}

function bilingual(lines: (lang: Lang) => string[]): string {
  return (['es', 'en'] as const)
    .map((l) => lines(l).join('\n'))
    .filter(Boolean)
    .join('\n\n')
}

/**
 * The photo's credit line, for a post whose picture is a credited photo (or
 * a card drawn from one): Creative Commons asks for attribution wherever the
 * photo is used. Null when the photo carries no credit.
 */
export function creditLine(media: Media | null | undefined): string | null {
  const c = photoCredit(media, 'es')
  if (!c) return null
  const license = c.license ? `, ${c.license}${c.licenseUrl ? ` (${c.licenseUrl})` : ''}` : ''
  return `📷 ${c.lead}: ${c.credit}${license}`
}

/**
 * The body plus the link and the photo's credit, within the limit: excerpts
 * go first, then the tail of the body. The link and the credit are never cut.
 */
function caption(body: (excerpts: boolean) => string, link: string, credit: string | null = null): string {
  const tail = [link ? `👉 ${link}` : '', credit ?? ''].filter(Boolean).join('\n\n')
  const join = (text: string) => (tail ? `${text}\n\n${tail}` : text)
  const full = join(body(true))
  if (full.length <= CAPTION_MAX) return full
  const short = body(false)
  const room = CAPTION_MAX - (join('').length + 1)
  return join(short.length <= room ? short : `${short.slice(0, room - 1).trimEnd()}…`)
}

/* ------------------------------------------------------------------------ */
/* When and what                                                             */
/* ------------------------------------------------------------------------ */

/** The two times of day a post goes out, Miami time: late morning and evening. */
export const POST_SLOTS = ['11:30', '19:00'] as const
/** A slot this close to now is skipped: the owner needs time to see the draft. */
const MIN_LEAD_MS = 30 * 60_000
/** Two posts closer together than this would bury each other. */
const MIN_GAP_MS = POST_GAP_MS
/** How far ahead slots are looked for, at least: further when an event's window is later. */
const HORIZON_DAYS = 21
/** An event is announced in the days just before it, not as soon as it is published. */
export const EVENT_LEAD_MS = 72 * 60 * 60_000
const DAY_MS = 24 * 60 * 60_000
/** The most days of slots ever listed at once: an event years out must not list them all. */
const MAX_SPAN_DAYS = 120
/** How far back from an event's window a full window may spill. */
const SPILL_DAYS = 14

/**
 * Every posting slot at least 30 minutes after `now` (and not before `from`),
 * in order: three weeks of them, or through `until` when that is later, but
 * never more than 120 days.
 */
export function postSlots(now: Date, until?: Date | null, from?: Date | null): Date[] {
  const earliest = Math.max(now.getTime() + MIN_LEAD_MS, from?.getTime() ?? 0)
  const wanted = until ? Math.ceil((until.getTime() - earliest) / DAY_MS) + 1 : 0
  const days = Math.min(MAX_SPAN_DAYS, Math.max(from ? wanted : HORIZON_DAYS, wanted))
  const out: Date[] = []
  // Day by day in Miami's calendar, each slot through `miamiInstant`, so a DST
  // change moves the UTC instant and never the wall-clock time.
  for (let i = 0, day = todayISO(new Date(earliest)); i <= days; i++, day = addDays(day, 1)) {
    for (const at of POST_SLOTS) {
      const slot = miamiInstant(day, at)
      if (slot.getTime() >= earliest && (!from || !until || slot.getTime() <= until.getTime())) out.push(slot)
    }
  }
  return out
}

/**
 * When a new draft should go out, once approved.
 *
 * The first 11:30 or 19:00 Miami slot at least 30 minutes away that is not
 * within 3 hours of another draft already waiting (pending, approved or
 * scheduled). For an event, never after `deadline` (see `postDeadline`): if
 * the first free slot is too late, the first slot at all, spacing or not; if
 * even that is too late, now, which posts as soon as it is approved.
 *
 * With `notBefore` (an event's window, see `postWindowStart`) the free slot is
 * looked for from there to the deadline first, then backwards from it, so a
 * post for the 31st published on the 5th goes out the week of the 31st, and
 * events published together each get their own week instead of the far ones
 * taking the near slots.
 */
export function pickPostTime(now: Date, busy: Date[], deadline: Date | null, notBefore?: Date | null): Date {
  const isFree = (s: Date) => busy.every((b) => Math.abs(b.getTime() - s.getTime()) >= MIN_GAP_MS)
  const inTime = (s: Date | undefined): s is Date => !!s && (!deadline || s.getTime() <= deadline.getTime())
  if (notBefore && notBefore.getTime() > now.getTime()) {
    const inWindow = postSlots(now, deadline, notBefore).find((s) => inTime(s) && isFree(s))
    if (inWindow) return inWindow
    const spill = new Date(notBefore.getTime() - SPILL_DAYS * DAY_MS)
    const before = postSlots(now, notBefore, spill)
      .filter((s) => s.getTime() < notBefore.getTime())
      .reverse()
      .find(isFree)
    if (before) return before
  }
  const slots = postSlots(now, deadline)
  const free = slots.find(isFree)
  if (inTime(free)) return free
  if (inTime(slots[0])) return slots[0]
  return now
}

/**
 * The latest an event's post may go out: when it starts. That is its
 * `startTime` on its first day, or 11:30 that day when it has no clock, so the
 * morning slot of the day itself still counts. A run that has already started
 * (an exhibit up for weeks) is still worth announcing while it lasts, so its
 * limit is the evening slot of its last day instead.
 */
export function postDeadline(ev: Pick<Event, 'date' | 'endDate' | 'startTime'>, now: Date): Date {
  const first = dateOnly(ev.date)
  const starts = miamiInstant(first, ev.startTime || POST_SLOTS[0])
  if (starts.getTime() > now.getTime()) return starts
  const last = eventRunEnd({ date: ev.date, endDate: ev.endDate })
  return last > first ? miamiInstant(last, POST_SLOTS[1]) : starts
}

/**
 * Where an event's posting window opens: 72 hours before it starts. Null for
 * one already under way (an exhibit), which is worth posting about straight
 * away, and for one starting sooner than that.
 */
export function postWindowStart(ev: Pick<Event, 'date' | 'startTime'>, now: Date): Date | null {
  const starts = miamiInstant(dateOnly(ev.date), ev.startTime || POST_SLOTS[0])
  const opens = new Date(starts.getTime() - EVENT_LEAD_MS)
  return opens.getTime() > now.getTime() ? opens : null
}

/** The times of drafts already waiting to go out, near enough to matter. */
async function busyTimes(payload: Payload, now: Date): Promise<Date[]> {
  const { docs } = await payload.find({
    collection: 'hq-social-drafts',
    where: {
      and: [
        { status: { in: ['pending', 'approved', 'scheduled'] } },
        { scheduledFor: { greater_than_equal: new Date(now.getTime() - MIN_GAP_MS).toISOString() } },
      ],
    },
    select: { scheduledFor: true },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  return docs.map((d) => new Date(d.scheduledFor))
}

/** An event worth announcing: not over, cancelled or postponed. */
function eventIsAhead(ev: Event, now: Date): boolean {
  if (ev.eventStatus === 'cancelled' || ev.eventStatus === 'postponed') return false
  return eventEndDay(ev) >= todayISO(now)
}

/**
 * The page's photo, re-encoded as a JPEG into `hq-media`, which is the only
 * place drafts read from. The public `media` stores WebP, which Instagram
 * rejects. Returns null when there is no usable photo; the draft then goes to
 * Facebook as text.
 */
async function copyCover(
  payload: Payload,
  cover: Media | number | null | undefined,
  label: string,
  slug: string,
): Promise<number | null> {
  if (!cover) return null
  try {
    const doc =
      typeof cover === 'object'
        ? cover
        : await payload.findByID({ collection: 'media', id: cover, depth: 0, overrideAccess: true })
    const filename = doc.sizes?.hero?.filename ?? doc.filename
    if (!filename || !doc.mimeType?.startsWith('image/')) return null
    const dir = path.resolve(payload.collections.media.config.upload.staticDir || 'media')
    const jpeg = await sharp(await readFile(path.join(dir, filename)))
      .rotate()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer()
    const created = await payload.create({
      collection: 'hq-media',
      data: { note: `Photo of ${label}, copied when it was published` },
      file: { data: jpeg, mimetype: 'image/jpeg', name: `${slug.slice(0, 60)}-${Date.now()}.jpg`, size: jpeg.length },
      overrideAccess: true,
    })
    return created.id
  } catch (err) {
    console.error(`[hq] auto-draft: no usable photo for ${label}:`, err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * An event's generated card, Instagram's 4:5, in one language (the draft takes
 * the Spanish one, then the English one, as a carousel), stored in `hq-media`
 * as a JPEG the same way as a copied photo. Drawn from the published event's own fields only, with its photo
 * framed on it when it has one. Null if it cannot be drawn; the draft then
 * takes the bare photo, or goes to Facebook as text.
 */
async function cardImage(
  payload: Payload,
  ev: Event,
  lang: 'es' | 'en',
  label: string,
  slug: string,
): Promise<number | null> {
  try {
    // Loaded on demand: the renderer pulls in next/og, which the Payload CLI
    // (migrations, the seed) has no use for.
    const { renderEventCard } = await import('./eventCard')
    const png = await renderEventCard(ev, lang, 'social')
    const jpeg = await sharp(Buffer.from(png)).flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer()
    const created = await payload.create({
      collection: 'hq-media',
      data: {
        note: `Generated ${lang.toUpperCase()} card for ${label} (${ev.image ? 'with its photo' : 'no photo'}), made when it was published`,
      },
      file: {
        data: jpeg,
        mimetype: 'image/jpeg',
        name: `${slug.slice(0, 60)}-card-${lang}-${Date.now()}.jpg`,
        size: jpeg.length,
      },
      overrideAccess: true,
    })
    return created.id
  } catch (err) {
    console.error(`[hq] auto-draft: no card for ${label}:`, err instanceof Error ? err.message : err)
    return null
  }
}
