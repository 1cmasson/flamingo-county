import { meters, walkMinutes, type LatLng } from './transitMath'

/**
 * "How do I get there by bus?" over the county routes the site covers, worked
 * out in the browser so the visitor's location never leaves it.
 *
 * A trip is one bus: walk to a stop, ride, get off, walk to the door. For each
 * route and direction the best stop to board and the best to get off are the
 * pair that makes the walk + ride shortest, with the boarding stop before the
 * stop to get off at. Trips that change buses aren't planned here; the page
 * offers Google Maps for those (and for anywhere none of the routes reach).
 *
 * The wait for the bus isn't in the ranking: it comes from the live feed once
 * a trip is shown, and a 3-minute wait shouldn't reorder routes the map says
 * are 20 minutes apart. Walks are straight-line distance scaled for streets
 * (transitMath.walkMinutes), as everywhere else on the site.
 */

export type NetworkStation = { id: string; name: string; at: LatLng; min: number }
export type NetworkDirection = {
  id: string
  toward: string
  stations: NetworkStation[]
  path: LatLng[]
}
export type NetworkRoute = {
  slug: string
  number: string | null
  short: string
  kind: 'bus' | 'trolley'
  serviceEnds: string | null
  directions: NetworkDirection[]
}
export type Network = { routes: NetworkRoute[] }

export type Trip = {
  slug: string
  number: string | null
  kind: NetworkRoute['kind']
  dir: string
  toward: string
  board: { index: number; id: string; name: string; at: LatLng; walk: number }
  alight: { index: number; id: string; name: string; at: LatLng; walk: number }
  /** Ride minutes, from the county's stop-to-stop times. */
  ride: number
  stops: number
  /** Walk + ride + walk, minutes; the wait for the bus comes on top. */
  total: number
  /** The stretch of the route's line ridden, for the map. */
  path: LatLng[]
}

/** A walk longer than this at either end isn't a bus trip worth offering. */
export const MAX_WALK_M = 1300
/** Closer than this, walking is the answer. */
export const WALK_ONLY_MIN = 12

export type Plan = { walkOnly: number | null; trips: Trip[] }

export function planTrips(net: Network, from: LatLng, to: LatLng, max = 3): Plan {
  const direct = walkMinutes(meters(from, to))
  const trips: Trip[] = []
  for (const r of net.routes) {
    for (const d of r.directions) {
      const st = d.stations
      // Each stop's walk from the start and to the end, once.
      const mFrom = st.map((s) => meters(from, s.at))
      const mTo = st.map((s) => meters(s.at, to))
      let best: { i: number; j: number; total: number } | null = null
      // The last stop is where the bus ends: no one boards there.
      for (let i = 0; i < st.length - 1; i++) {
        if (mFrom[i] > MAX_WALK_M) continue
        const w1 = walkMinutes(mFrom[i])
        for (let j = i + 1; j < st.length; j++) {
          if (mTo[j] > MAX_WALK_M) continue
          const total = w1 + Math.max(1, st[j].min - st[i].min) + walkMinutes(mTo[j])
          if (!best || total < best.total) best = { i, j, total }
        }
      }
      if (!best) continue
      const { i, j } = best
      trips.push({
        slug: r.slug,
        number: r.number,
        kind: r.kind,
        dir: d.id,
        toward: d.toward,
        board: {
          index: i,
          id: st[i].id,
          name: st[i].name,
          at: st[i].at,
          walk: walkMinutes(mFrom[i]),
        },
        alight: {
          index: j,
          id: st[j].id,
          name: st[j].name,
          at: st[j].at,
          walk: walkMinutes(mTo[j]),
        },
        ride: Math.max(1, st[j].min - st[i].min),
        stops: j - i,
        total: best.total,
        path: slicePath(d.path, st[i].at, st[j].at),
      })
    }
  }
  // One trip per route: its two directions can't both be the way there.
  const byRoute = new Map<string, Trip>()
  for (const t of trips.sort((a, b) => a.total - b.total))
    if (!byRoute.has(t.slug)) byRoute.set(t.slug, t)
  const ranked = [...byRoute.values()]
    // A bus that saves no time over walking isn't worth the wait.
    .filter((t) => t.total < direct)
    .slice(0, max)
  return { walkOnly: direct <= WALK_ONLY_MIN || !ranked.length ? direct : null, trips: ranked }
}

/** The part of a line between two points on it (or near it), in its own order. */
export function slicePath(path: LatLng[], a: LatLng, b: LatLng): LatLng[] {
  if (path.length < 2) return [a, b]
  const near = (p: LatLng) => {
    let k = 0
    let d = Infinity
    path.forEach((q, n) => {
      const m = meters(p, q)
      if (m < d) [k, d] = [n, m]
    })
    return k
  }
  const i = near(a)
  const j = near(b)
  const part = i <= j ? path.slice(i, j + 1) : path.slice(j, i + 1).reverse()
  return [a, ...part, b]
}

/**
 * Google Maps transit directions to a point: for trips with a change of bus,
 * or places none of these routes reach. No origin in the link: Google starts
 * from the phone's own location, and the visitor's never goes into a URL.
 */
export function transitDirectionsHref(to: LatLng): string {
  const q = new URLSearchParams({
    api: '1',
    destination: `${to[0]},${to[1]}`,
    travelmode: 'transit',
  })
  return `https://www.google.com/maps/dir/?${q}`
}
