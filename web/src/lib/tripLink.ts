import type { Lang } from '../i18n'
import type { LatLng } from './transitMath'

/**
 * A bus trip as a link anyone can open: `/es/bus/trip?de=…&dc=…&a=…&ac=…`.
 *
 * Only the two ends are in it, each a name and a point, never the plan: the
 * plan is made again when the link is opened, so it follows the county's
 * schedule changes (stop ids and route ids come and go with each edition)
 * and a link shared today still works next month. `r` says which of the
 * trips there was chosen, by its buses ("37,54"), and is only a preference.
 *
 * The visitor's own location never goes in a link. A trip from where they
 * are is shared from the stop they'd board at (a public place, by name);
 * a start they typed, and the place they're going, are theirs to share.
 */

export type TripEnd = { name: string; at: LatLng }
export type TripLink = { from: TripEnd; to: TripEnd; buses: string[] }

/** Miami-Dade, give or take: a point outside isn't a trip this planner can make. */
const BOX = { south: 25.1, north: 26.0, west: -80.9, east: -80.1 }
const NAME_MAX = 100

const point = ([lat, lng]: LatLng) => `${lat.toFixed(5)},${lng.toFixed(5)}`

export function tripLinkPath(lang: Lang, link: TripLink): string {
  const q = new URLSearchParams({
    de: link.from.name.slice(0, NAME_MAX),
    dc: point(link.from.at),
    a: link.to.name.slice(0, NAME_MAX),
    ac: point(link.to.at),
  })
  if (link.buses.length) q.set('r', link.buses.join(','))
  return `/${lang}/bus/trip?${q}`
}

/** The same trip on a route's map (it plans it there and draws it). */
export function tripLinkQuery(link: TripLink): string {
  return tripLinkPath('es', link).split('?')[1]
}

type Query = Record<string, string | string[] | undefined> | URLSearchParams

function get(q: Query, k: string): string | null {
  const v = q instanceof URLSearchParams ? q.get(k) : q[k]
  const one = Array.isArray(v) ? v[0] : v
  return one == null ? null : one
}

function readPoint(v: string | null): LatLng | null {
  const m = v?.match(/^(-?\d{1,2}(?:\.\d{1,7})?),(-?\d{1,3}(?:\.\d{1,7})?)$/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (lat < BOX.south || lat > BOX.north || lng < BOX.west || lng > BOX.east) return null
  return [lat, lng]
}

function readName(v: string | null): string | null {
  const name = v?.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
  return name ? name : null
}

/** A trip link's ends, or null when it isn't one (or points outside Miami-Dade). */
export function readTripLink(q: Query): TripLink | null {
  const fromAt = readPoint(get(q, 'dc'))
  const toAt = readPoint(get(q, 'ac'))
  const fromName = readName(get(q, 'de'))
  const toName = readName(get(q, 'a'))
  if (!fromAt || !toAt || !fromName || !toName) return null
  const buses = (get(q, 'r') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9-]{1,40}$/.test(s))
    .slice(0, 2)
  return { from: { name: fromName, at: fromAt }, to: { name: toName, at: toAt }, buses }
}

/** The buses of a trip, as a link names them: "37" or "37,54". */
export const tripBuses = (t: { slug: string; then?: { slug: string } }) =>
  t.then ? [t.slug, t.then.slug] : [t.slug]

/** Which of the trips a link chose (by its buses), or the first. */
export function pickByBuses(trips: { slug: string; then?: { slug: string } }[], buses: string[]) {
  if (!buses.length) return 0
  const k = trips.findIndex((t) => tripBuses(t).join(',') === buses.join(','))
  return Math.max(0, k)
}
