import type { Payload } from 'payload'
import sharp from 'sharp'

import type { City, Event, HqSocialDraft } from '../payload-types'
import { MIN_LEAD_MS, eventIsAhead, fact, pickPostTime, postDeadline } from './autoDraft'
import { dateOnly, eventDateLine, miamiInstant, todayISO } from './dates'
import { cardFonts, renderEventCard } from './eventCard'
import { EVENT_CARD_SIZES } from './eventCardUrl'
import { eventVenue } from './eventVenue'
import { HQ_INTERNAL, recordEvent, sendDraftPreview } from './hq'
import { renderOgPng } from './ogImage'
import type { Platform } from './postiz'
import { routes } from './routes'
import { SITE_URL } from './site'
import { isAnnounceable, unshout } from './week'

/**
 * An event's Instagram story, drafted the moment the event goes live.
 *
 * Events never get a feed post of their own (the owner's call, 2026-10-11):
 * they go out together in a carousel. Each event gets a story instead. When an
 * event moves from draft to published, HQ writes one pending
 * `hq-social-drafts` entry for it, `format: 'story'`, Instagram only:
 *
 * - the picture: the event's Spanish card on a 1080×1920 story (`storyImage`);
 * - the caption: the Spanish title, the day, the city and the page's address.
 *   Instagram doesn't show a story's caption; it is there because the field is
 *   required, and it is what the owner reads in Telegram;
 * - set for 9 AM Miami on the event's first day, or sooner if that has
 *   passed (`storyTime`).
 *
 * It then goes through the normal Approve / Reject preview: nothing is posted
 * from here. `dedupeKey` makes the database refuse a second story for the same
 * event, so a republish, a retry or a second process all end at one.
 */

export const STORY_SOURCE = 'event-story'
/** When a story goes up on the event's first day, Miami time: early enough to plan the day around it. */
export const STORY_TIME = '09:00'

export function storyKey(eventId: number | string): string {
  return `${STORY_SOURCE}:${eventId}`
}

/** The event's story draft, whatever its status, or null if it has none. */
export async function storyFor(payload: Payload, eventId: number): Promise<HqSocialDraft | null> {
  const { docs } = await payload.find({
    collection: 'hq-social-drafts',
    where: { dedupeKey: { equals: storyKey(eventId) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs[0] ?? null
}

/* ------------------------------------------------------------------------ */
/* When and what                                                             */
/* ------------------------------------------------------------------------ */

/**
 * When the story should go up: 9 AM Miami on the event's first day, while that
 * is at least 30 minutes away. Otherwise (the event is on today, or already
 * running) the next posting slot, never after it starts; if no slot is left in
 * time, as soon as it is approved (`pickPostTime`).
 *
 * No busy times are passed: a story stays out of the 3-hour spacing both ways
 * (`NOT_A_STORY` in lib/hq.ts). It doesn't touch the grid, so it can't bury a
 * post or be buried by one. Two events on the same day both go up at 9; on
 * Instagram that is two frames in a row, which is how stories are watched.
 */
export function storyTime(ev: Pick<Event, 'date' | 'endDate' | 'startTime'>, now: Date): Date {
  const morning = miamiInstant(dateOnly(ev.date), STORY_TIME)
  if (morning.getTime() >= now.getTime() + MIN_LEAD_MS) return morning
  return pickPostTime(now, [], postDeadline(ev, now))
}

/**
 * The caption, Spanish only, from the event's own fields: its title, its day
 * (as the card writes it, on the day the story goes up), its city and its page.
 * No prices and no description. Empty when the title names a price.
 */
export function storyCaption(ev: Event, day: string): string {
  const title = fact(ev.title)
  if (!title) return ''
  const city = eventVenue(ev).city as City | null
  const where = city ? unshout(fact(city.name)) : ''
  return [
    title,
    `🗓 ${eventDateLine(ev, 'es', day)}`,
    where ? `📍 ${where}` : '',
    `👉 ${SITE_URL}${routes.event('es', ev.slug)}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/* ------------------------------------------------------------------------ */
/* The picture                                                               */
/* ------------------------------------------------------------------------ */

const INK = '#0c0f14'
const CREAM = '#fff6e5'
const PINK = '#ff4fa0'
const YELLOW = '#ffd400'

/** Instagram's story frame. */
export const STORY_SIZE = { width: 1080, height: 1920 } as const
const { width: W, height: H } = STORY_SIZE

// The card keeps its 4:5 and sits centred, with the address box under it. The
// whole stack stays clear of the top ~250px and bottom ~300px, where
// Instagram lays its own header and reply bar over a story.
const CARD_W = 880
const CARD_H = Math.round((CARD_W * EVENT_CARD_SIZES.social.height) / EVENT_CARD_SIZES.social.width)
const BORDER = 14
const FRAME_W = CARD_W + 2 * BORDER
const FRAME_H = CARD_H + 2 * BORDER
const GAP = 40
const LABEL_H = 112
const LEFT = Math.round((W - FRAME_W) / 2)
const TOP = Math.round((H - (FRAME_H + GAP + LABEL_H)) / 2)

/** The story's ground: the brand's pink-to-yellow, with the address in an ink box where it goes under the card. */
function Ground() {
  return (
    <div
      style={{
        width: W,
        height: H,
        display: 'flex',
        position: 'relative',
        background: `linear-gradient(180deg, ${PINK} 0%, ${YELLOW} 100%)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: LEFT,
          top: TOP + FRAME_H + GAP,
          width: FRAME_W,
          height: LABEL_H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: INK,
          color: CREAM,
          fontFamily: 'Luckiest Guy',
          fontSize: 62,
          letterSpacing: '0.03em',
          paddingTop: 10,
        }}
      >
        FLAMINGOCOUNTY.COM
      </div>
    </div>
  )
}

/**
 * An event card (the 1080×1350 `social` PNG) set on a 1080×1920 story, as a
 * JPEG. The ground is drawn by next/og with the cards' own fonts; sharp only
 * ever reads rasters here, never SVG, which Next's image optimizer blocks in
 * libvips for the whole process (lib/ogImage.ts).
 */
export async function storyImage(card: ArrayBuffer | Buffer): Promise<Buffer> {
  const ground = await renderOgPng(<Ground />, { width: W, height: H, fonts: await cardFonts() })
  const framed = await sharp(Buffer.from(card as ArrayBuffer))
    .flatten({ background: '#ffffff' })
    .resize({ width: CARD_W, height: CARD_H, fit: 'cover' })
    .extend({ top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, background: INK })
    .png()
    .toBuffer()
  return sharp(Buffer.from(ground))
    .composite([{ input: framed, left: LEFT, top: TOP }])
    .flatten({ background: YELLOW })
    .jpeg({ quality: 88 })
    .toBuffer()
}

/* ------------------------------------------------------------------------ */
/* The draft                                                                 */
/* ------------------------------------------------------------------------ */

/** An event whose story is being drafted in this process. The database's unique key covers every other process. */
const drafting = new Set<number>()

/**
 * Draft the Instagram story for an event that just went live. Returns it, or
 * null when there is nothing to do: the event already has one (a republish),
 * it is over, cancelled or postponed, its title names a price, or its card
 * could not be drawn.
 *
 * Not in the feed drafts' queue (`oneAtATime`): that queue exists so drafts see
 * each other's slots, and a story takes no slot.
 */
export async function draftEventStory(payload: Payload, id: number, now: Date = new Date()): Promise<HqSocialDraft | null> {
  if (drafting.has(id)) return null
  drafting.add(id)
  try {
    return await create(payload, id, now)
  } finally {
    drafting.delete(id)
  }
}

async function create(payload: Payload, id: number, now: Date): Promise<HqSocialDraft | null> {
  // Spanish, because the audience is Spanish-first. Each field falls back to
  // English when it has no translation, as the event's own card does: a story
  // with a borrowed title beats no story.
  const read = (locale: 'es' | 'en') => payload.findByID({ collection: 'events', id, locale, depth: 2, overrideAccess: true })
  const [es, en] = (await Promise.all([read('es'), read('en')])) as [Event, Event]

  // Over, cancelled or postponed, or a title that names a price in either
  // language: no story, as no carousel would show it.
  if (!eventIsAhead(es, now) || !isAnnounceable(es) || !isAnnounceable(en)) return null

  const existing = await storyFor(payload, id)
  if (existing) {
    // A republish. Unless the story is older than the event: SQLite hands a
    // deleted row's id to the next one, so that story was for the deleted
    // event. It gives up the key, and this event gets a story of its own.
    if (new Date(existing.createdAt).getTime() >= new Date(es.createdAt).getTime()) return null
    await payload.update({
      collection: 'hq-social-drafts',
      id: existing.id,
      data: { dedupeKey: null },
      overrideAccess: true,
      context: { [HQ_INTERNAL]: true },
    })
  }

  const scheduledFor = storyTime(es, now)
  // The card and the caption read as they will on the day the story goes up:
  // a run already under way says "Hasta el 19 de octubre".
  const day = todayISO(scheduledFor.getTime() > now.getTime() ? scheduledFor : now)
  const caption = storyCaption(es, day)
  if (!caption) return null

  const label = `event #${id}`
  let media: number
  try {
    const jpeg = await storyImage(await renderEventCard(es, 'es', 'social', day))
    media = (
      await payload.create({
        collection: 'hq-media',
        data: { note: `Instagram story for ${label} (${es.image ? 'with its photo' : 'no photo'}), made when it was published` },
        file: { data: jpeg, mimetype: 'image/jpeg', name: `${es.slug.slice(0, 60)}-story-${Date.now()}.jpg`, size: jpeg.length },
        overrideAccess: true,
      })
    ).id
  } catch (err) {
    console.error(`[hq] event story: no picture for ${label}:`, err instanceof Error ? err.message : err)
    return null
  }

  const platforms: Platform[] = ['instagram']
  let draft: HqSocialDraft
  try {
    draft = await payload.create({
      collection: 'hq-social-drafts',
      data: {
        status: 'pending',
        format: 'story',
        caption,
        platforms,
        media: [media],
        scheduledFor: scheduledFor.toISOString(),
        pillar: 'event',
        language: 'es',
        sourceCollection: 'events',
        sourceId: String(id),
        dedupeKey: storyKey(id),
      },
      overrideAccess: true,
      // Logged and previewed below, with a fuller summary than the collection's own.
      context: { [HQ_INTERNAL]: true },
    })
  } catch (err) {
    // Another process drafted the story first: the unique key refused this one.
    await payload.delete({ collection: 'hq-media', id: media, overrideAccess: true }).catch(() => undefined)
    if (await storyFor(payload, id)) return null
    throw err
  }

  await recordEvent(payload, {
    type: 'social.draft_created',
    summary: `Social draft #${draft.id}, an Instagram story for the newly published event "${en.title ?? es.title}"`,
    refCollection: 'hq-social-drafts',
    refId: draft.id,
  })
  // Not awaited, as for any new draft: a publish should not wait on Telegram.
  void sendDraftPreview(payload, draft).catch((err) =>
    console.error('[hq] draft preview failed:', err instanceof Error ? err.message : err),
  )
  return draft
}
