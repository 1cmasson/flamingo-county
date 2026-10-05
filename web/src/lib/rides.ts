import type { Lang } from '../i18n'
import type { City, Listing } from '../payload-types'
import { getListings, rel } from './data'
import { geocode } from './geocode'
import { nearestStops, type NearestStop } from './transit'

/**
 * Joins the directory to the free lines: which listings sit a short walk from
 * a Flamingo or Marlin stop, and what the free way to reach the rest is.
 */

/** Cities with a free on-demand Freebee service run by the city or town. */
const FREEBEE_CITIES = new Set(['hialeah', 'lakes'])

export type Ride =
  | { kind: 'bus'; stops: NearestStop[] }
  | { kind: 'freebee'; city: string }

/** Unsourced records are design placeholders: no URL, so no place on a line. */
const listable = (l: Listing) => l.publicationStatus !== 'unsourced'

export async function rideForListing(listing: Listing): Promise<Ride | null> {
  const city = rel<City>(listing.city)?.slug
  if (!city || !listable(listing)) return null
  if (city === 'hialeah') {
    const at = await geocode(listing.detail?.address)
    const stops = at ? nearestStops(at) : []
    if (stops.length) return { kind: 'bus', stops }
  }
  return FREEBEE_CITIES.has(city) ? { kind: 'freebee', city } : null
}

export type PlaceOnLine = { listing: Listing; citySlug: string; stop: NearestStop }

/** Every listing within walking distance of a free line, closest walk first. */
export async function placesOnLines(lang: Lang): Promise<PlaceOnLine[]> {
  const listings = (await getListings(lang, { city: 'hialeah' })).filter(listable)
  const located = await Promise.all(listings.map(async (l) => ({ l, at: await geocode(l.detail?.address) })))
  const out: PlaceOnLine[] = []
  for (const { l, at } of located) {
    if (!at) continue
    const citySlug = rel<City>(l.city)?.slug ?? 'hialeah'
    for (const stop of nearestStops(at)) out.push({ listing: l, citySlug, stop })
  }
  return out.sort((a, b) => a.stop.meters - b.stop.meters)
}
