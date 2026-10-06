import type { Lang } from '../i18n'
import { TRANSIT, type TransitRoute } from './transit'

/**
 * The free-rides link cards, the hub's and each line's: drawn by `lib/freeRidesCard.tsx`, served by
 * `app/api/og/free-rides`. Apart from eventCardUrl.ts because it reads the
 * line data, which the event pages have no use for.
 */
export const FREE_RIDES_CARD_SIZE = { width: 1200, height: 630 } as const

/** Bump when the card's design or copy changes. */
export const FREE_RIDES_CARD_VERSION = '1'

/**
 * The route draws the lines as they are now. `v` carries the design version
 * and the date of the last `pnpm transit:sync`, so a re-synced map gets a new
 * URL and the apps that cache previews by URL fetch it again.
 */
export function freeRidesCardUrl(lang: Lang, route?: TransitRoute['slug']): string {
  const line = route ? `&route=${route}` : ''
  return `/api/og/free-rides?lang=${lang}${line}&v=${FREE_RIDES_CARD_VERSION}.${TRANSIT.source.fetchedAt}`
}
