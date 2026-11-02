import type { Lang } from '../i18n'
import type { Listing } from '../payload-types'
import { getListings } from './data'
import { geocode } from './geocode'
import { listable } from './rides'
import { rankSpots, type RankedSpot } from './spotRank'
import type { LatLng } from './transit'

/**
 * The listed businesses closest to a point (an address, an event's venue),
 * within the cap in `spotRank.ts`. Each listing's address goes through the
 * same cached geocoder the free-ride pages use, so after the first page in a
 * process this costs one query. A listing whose address has no street number
 * ("Hialeah, FL") is never placed, so it never shows here.
 */
export async function spotsNear(
  lang: Lang,
  at: LatLng | null,
  { exclude, limit }: { exclude?: number | string; limit?: number } = {},
): Promise<RankedSpot<Listing>[]> {
  if (!at) return []
  const listings = (await getListings(lang)).filter((l) => listable(l) && l.id !== exclude)
  const located = await Promise.all(listings.map(async (l) => ({ item: l, at: await geocode(l.detail?.address) })))
  return rankSpots(located, at, { limit })
}
