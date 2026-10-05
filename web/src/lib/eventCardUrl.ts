import type { Lang } from '../i18n'

/**
 * The generated event card. The image itself is drawn by `lib/eventCard.tsx`
 * and served by `app/api/og/event/[slug]`. This file holds only what pages
 * need to point at it, so they don't load the renderer.
 *
 * An event with a photo gets it framed on the `link`, `social` and `card`
 * sizes in place of the mascot's arch, with its credit printed on it; the
 * event page's hero shows the photo itself. An event without one whose venue
 * matches a drawn scene (lib/eventSetting.ts) stands on it at every size: the
 * portrait art on `social`, the wide art on `link`, `page` and `card`.
 *
 * - `link`: Open Graph / X, 1200×630, the full design.
 * - `social`: Instagram's 4:5, 1080×1350, the same design stacked: text on
 *   top, the mascot's arch bottom right. The social auto-draft attaches it.
 * - `page`: the event page's hero, 1200×630, without the mascot and arch,
 *   because the page draws its own mascot over the hero's right side.
 * - `card`: the events board's 4:3 picture slot, the full design. The board's
 *   slot is 4:3 and the 1.9:1 `page` card cannot fill it without cutting text.
 */
export const EVENT_CARD_SIZES = {
  link: { width: 1200, height: 630 },
  social: { width: 1080, height: 1350 },
  page: { width: 1200, height: 630 },
  card: { width: 960, height: 720 },
} as const

export type EventCardSize = keyof typeof EVENT_CARD_SIZES

export function isEventCardSize(v: string | null | undefined): v is EventCardSize {
  return !!v && Object.prototype.hasOwnProperty.call(EVENT_CARD_SIZES, v)
}

/**
 * Bump when the card's design or its art changes (fonts, a mascot), so every
 * cached card is fetched again. The event's own `updatedAt` covers its fields.
 */
export const EVENT_CARD_VERSION = '7'

/**
 * The card's path. `v` is a cache key only: the route always draws the event
 * as it is now, but a changed event gets a new URL, so a long cache is safe.
 * An event's photo is drawn on the card with its credit, and editing that
 * credit changes the photo, not the event, so the newer of the two stamps.
 */
export function eventCardUrl(
  ev: { slug: string; updatedAt?: string | null; image?: unknown },
  lang: Lang,
  size: EventCardSize,
): string {
  const photo = ev.image && typeof ev.image === 'object' ? (ev.image as { updatedAt?: string | null }) : null
  const stamps = [ev.updatedAt, photo?.updatedAt].map((s) => (s ? Date.parse(s) : 0)).filter(Number.isFinite)
  const stamp = Math.max(0, ...stamps)
  const v = `${EVENT_CARD_VERSION}.${stamp.toString(36)}`
  return `/api/og/event/${encodeURIComponent(ev.slug)}?lang=${lang}&size=${size}&v=${v}`
}

/** Bump when a seasonal guide's card changes design or copy (`card` in lib/seasons.ts). */
export const SEASON_CARD_VERSION = '2'

/**
 * A seasonal guide's card: `/api/og/season/<key>`, drawn by the same renderer
 * in the season's palette. The year on its ticket is part of `v`, so the URL
 * changes when the season comes round again.
 */
export function seasonCardUrl(key: string, lang: Lang, size: EventCardSize, year: number): string {
  return `/api/og/season/${encodeURIComponent(key)}?lang=${lang}&size=${size}&v=${SEASON_CARD_VERSION}.${year}`
}
