import type { Lang } from '../i18n'
import type { Category, City, Listing } from '../payload-types'
import { getListings, rel } from './data'
import { routes } from './routes'
import { geocode } from './geocode'
import { nearestCountyStop, type CountyRoute, type CountyStation } from './county'
import { walkMinutes } from './transit'
import type { LatLng } from './transitMath'

/**
 * Joins the directory to a county route: which listings are a short walk from
 * one of its stops. The same geocoder and walk as the free lines (lib/rides.ts).
 */
export type PlaceOnRoute = {
  listing: Listing
  citySlug: string
  station: CountyStation
  walk: number
  /** Where the listing is, from its address. */
  at: LatLng
}

export async function placesOnRoute(route: CountyRoute, lang: Lang): Promise<PlaceOnRoute[]> {
  // Unsourced records are design placeholders: no URL, so no place on a route.
  const listings = (await getListings(lang)).filter((l) => l.publicationStatus !== 'unsourced')
  const located = await Promise.all(
    listings.map(async (l) => ({ l, at: await geocode(l.detail?.address) })),
  )
  const out: (PlaceOnRoute & { meters: number })[] = []
  for (const { l, at } of located) {
    const citySlug = rel<City>(l.city)?.slug
    if (!at || !citySlug) continue
    const near = nearestCountyStop(route, at)
    if (near)
      out.push({
        listing: l,
        citySlug,
        station: near.station,
        walk: walkMinutes(near.meters),
        at,
        meters: near.meters,
      })
  }
  return out.sort((a, b) => a.meters - b.meters)
}

/** What the full map needs of a place: where it is, what it is, and how far it is from which stop. */
export type MapPlaceCard = {
  id: number
  name: string
  at: LatLng
  category: string | null
  href: string
  stop: string
  walk: number
}

export function placeCards(
  places: PlaceOnRoute[],
  href: (p: PlaceOnRoute) => string,
): MapPlaceCard[] {
  return places.map((p) => ({
    id: p.listing.id,
    name: p.listing.name,
    at: p.at,
    category: rel<Category>(p.listing.category)?.label ?? null,
    href: href(p),
    stop: p.station.name,
    walk: p.walk,
  }))
}

/** Every listing with a place on the map, for the trip planner's "where are you going?". */
export type DirectoryPoint = {
  id: number
  name: string
  at: LatLng
  category: string | null
  city: string | null
  href: string
}

export async function directoryPoints(lang: Lang): Promise<DirectoryPoint[]> {
  const listings = (await getListings(lang)).filter((l) => l.publicationStatus !== 'unsourced')
  const located = await Promise.all(
    listings.map(async (l) => ({ l, at: await geocode(l.detail?.address) })),
  )
  const out: DirectoryPoint[] = []
  for (const { l, at } of located) {
    const city = rel<City>(l.city)
    if (!at || !city?.slug) continue
    out.push({
      id: l.id,
      name: l.name,
      at,
      category: rel<Category>(l.category)?.label ?? null,
      // Stored in caps (a proper noun on the nav tabs); a card reads it in title case.
      city: city.name ? city.name.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : null,
      href: routes.business(lang, city.slug, l.slug),
    })
  }
  return out
}
