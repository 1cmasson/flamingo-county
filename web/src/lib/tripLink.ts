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

const readBuses = (q: Query) =>
  (get(q, 'r') ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z0-9-]{1,40}$/.test(s))
    .slice(0, 3)

/** A trip link's ends, or null when it isn't one (or points outside Miami-Dade). */
export function readTripLink(q: Query): TripLink | null {
  const fromAt = readPoint(get(q, 'dc'))
  const toAt = readPoint(get(q, 'ac'))
  const fromName = readName(get(q, 'de'))
  const toName = readName(get(q, 'a'))
  if (!fromAt || !toAt || !fromName || !toName) return null
  return {
    from: { name: fromName, at: fromAt },
    to: { name: toName, at: toAt },
    buses: readBuses(q),
  }
}

/** One end of a trip someone wrote by hand: a name, and its point only if they gave one. */
export type AskedEnd = { name: string; at: LatLng | null }
export type TripAsk = { from: AskedEnd | null; to: AskedEnd | null; buses: string[] }

/**
 * A trip link written by hand, as an assistant (ChatGPT, Claude) writes one
 * for someone: the names are enough, `/en/bus/trip?from=Hialeah+Park&to=Palmetto+General+Hospital`
 * (or de/a, as the site's own links say it). The page finds the places and
 * moves on to the full link (readTripLink). Null when neither end has a name.
 */
export function readTripAsk(q: Query): TripAsk | null {
  const end = (nameKeys: string[], atKey: string): AskedEnd | null => {
    const name = nameKeys.map((k) => readName(get(q, k))).find(Boolean)
    return name ? { name, at: readPoint(get(q, atKey)) } : null
  }
  const from = end(['de', 'from'], 'dc')
  const to = end(['a', 'to'], 'ac')
  if (!from && !to) return null
  return { from, to, buses: readBuses(q) }
}

/** A destination handed to the routes hub (`/es/bus?a=…&ac=…`): it plans from where the visitor is. */
export function readHubDest(q: Query): TripEnd | null {
  const name = readName(get(q, 'a'))
  const at = readPoint(get(q, 'ac'))
  return name && at ? { name, at } : null
}

export function hubDestQuery(to: TripEnd): string {
  return new URLSearchParams({ a: to.name.slice(0, NAME_MAX), ac: point(to.at) }).toString()
}

/** The rides of a trip, as a link names them: "37", "37,54" or "flamingo,metrorail". */
export const tripBuses = (t: { legs: { slug: string }[] }) => t.legs.map((l) => l.slug)

/** Which of the trips a link chose (by its rides), or the first. */
export function pickByBuses(trips: { legs: { slug: string }[] }[], buses: string[]) {
  if (!buses.length) return 0
  const k = trips.findIndex((t) => tripBuses(t).join(',') === buses.join(','))
  return Math.max(0, k)
}
