import type { Lang } from '../i18n'

/**
 * The generated event card: what an event with no photo shows instead of one.
 * The image itself is drawn by `lib/eventCard.tsx` and served by
 * `app/api/og/event/[slug]`. This file holds only what pages need to point at
 * it, so they don't load the renderer.
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
export const EVENT_CARD_VERSION = '2'

/**
 * The card's path. `v` is a cache key only: the route always draws the event
 * as it is now, but a changed event gets a new URL, so a long cache is safe.
 */
export function eventCardUrl(
  ev: { slug: string; updatedAt?: string | null },
  lang: Lang,
  size: EventCardSize,
): string {
  const stamp = ev.updatedAt ? Date.parse(ev.updatedAt) : 0
  const v = `${EVENT_CARD_VERSION}.${Number.isFinite(stamp) ? stamp.toString(36) : '0'}`
  return `/api/og/event/${encodeURIComponent(ev.slug)}?lang=${lang}&size=${size}&v=${v}`
}
