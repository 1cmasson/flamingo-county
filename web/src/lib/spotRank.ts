import { meters, walkMinutes, type LatLng } from './transit'

/**
 * Which listed businesses are close to a point, closest first: the ranking
 * behind "spots near you" on the address report and "near this event".
 *
 * Pure, so it can be tested without Payload; `lib/nearbySpots.ts` does the
 * fetching and geocoding.
 *
 * A hard cap, not "the nearest three wherever they are": the listings are all
 * in Hialeah and Miami Lakes, and a Homestead address told that its nearest
 * spot is a ceviche bar 40 km away is a worse tool, not a better ad.
 */
export const SPOT_MAX_METERS = 4000
export const SPOT_LIMIT = 3

export type Located<T> = { item: T; at: LatLng | null }
export type RankedSpot<T> = { item: T; meters: number; walk: number }

export function rankSpots<T>(
  located: Located<T>[],
  from: LatLng,
  { limit = SPOT_LIMIT, maxMeters = SPOT_MAX_METERS }: { limit?: number; maxMeters?: number } = {},
): RankedSpot<T>[] {
  const out: RankedSpot<T>[] = []
  for (const { item, at } of located) {
    if (!at) continue
    const m = meters(from, at)
    if (m <= maxMeters) out.push({ item, meters: m, walk: walkMinutes(m) })
  }
  return out.sort((a, b) => a.meters - b.meters).slice(0, limit)
}
