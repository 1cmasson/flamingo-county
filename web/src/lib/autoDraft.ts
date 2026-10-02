import { readFile } from 'fs/promises'
import path from 'path'
import type { CollectionAfterChangeHook, Payload } from 'payload'
import sharp from 'sharp'

import { noPrice } from '../fields/shared'
import type { City, Event, HqSocialDraft, Listing, Media, Story } from '../payload-types'
import { addDays, dateOnly, eventEndDay, parseISO, todayISO, utcStamp } from './dates'
import { HQ_INTERNAL, recordEvent, sendDraftPreview } from './hq'
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
/** The default posting time: the evening after the page goes live. */
const POST_AT = '19:00'

/** Two publishes of one page at the same moment must not both draft it. */
const drafting = new Set<string>()

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
    return await create(payload, collection, id, now)
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
  const read = (locale: Lang) =>
    payload.findByID({ collection, id, locale, fallbackLocale: false, depth: 1, overrideAccess: true })
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
  let scheduledFor = eveningAfter(now)

  if (collection === 'events') {
    const ev = { es: es as Event, en: en as Event }
    if (!eventIsAhead(ev.en, now)) return null
    body = (excerpts) => bilingual((l) => eventLines(ev[l], l, excerpts))
    pagePath = routes.event('es', ev.en.slug)
    cover = ev.en.image
    // An event on or before the default posting day goes out on approval.
    if (dateOnly(ev.en.date) <= todayISO(scheduledFor)) scheduledFor = now
  } else {
    const st = { es: es as Story, en: en as Story }
    body = (excerpts) => bilingual((l) => storyLines(st[l], excerpts))
    pagePath = routes.story('es', st.en.slug)
    cover = st.en.cover
  }

  // Every title named a price: there is nothing left to say but the link.
  if (!body(false)) return null

  const title = (en as { title?: string }).title ?? ''
  const media = await copyCover(payload, cover, `${collection} #${id}`, (en as { slug: string }).slug)
  // Instagram and TikTok need media; a still goes to Facebook and Instagram.
  // TikTok is left to the owner, since it wants video.
  const platforms: Platform[] = media ? ['facebook', 'instagram'] : ['facebook']

  const draft = await payload.create({
    collection: 'hq-social-drafts',
    data: {
      status: 'pending',
      caption: caption(body, ''),
      platforms,
      media: media ? [media] : [],
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
    data: { caption: caption(body, link) },
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

/** The body plus the link, within the limit: excerpts go first, then the tail. */
function caption(body: (excerpts: boolean) => string, link: string): string {
  const join = (text: string) => (link ? `${text}\n\n👉 ${link}` : text)
  const full = join(body(true))
  if (full.length <= CAPTION_MAX) return full
  const short = body(false)
  const room = CAPTION_MAX - (join('').length + 1)
  return join(short.length <= room ? short : `${short.slice(0, room - 1).trimEnd()}…`)
}

/* ------------------------------------------------------------------------ */
/* When and what                                                             */
/* ------------------------------------------------------------------------ */

/** 7 PM Miami time on the day after `now`. */
export function eveningAfter(now: Date): Date {
  const s = utcStamp(addDays(todayISO(now), 1), POST_AT)
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`)
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
