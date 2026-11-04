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

/** One bus of a trip: where it's boarded, where it's left, and the ride between. */
export type Leg = {
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
  /** The stretch of the route's line ridden, for the map. */
  path: LatLng[]
  /** Every stop from the one boarded to the one to get off at, in order: for "N stops to go". */
  between: LatLng[]
}

/**
 * A trip: the first bus, and with a change, the second (`then`). On a one-bus
 * trip `alight.walk` is the walk to the door; with a change it's the walk to
 * the second bus's stop, and `then.alight.walk` is the walk to the door.
 */
export type Trip = Leg & {
  /** Walk + ride (+ change + ride) + walk, minutes; the wait for the first bus comes on top. */
  total: number
  then?: Leg
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
        between: st.slice(i, j + 1).map((x) => x.at),
      })
    }
  }
  // One trip per route: its two directions can't both be the way there.
  const byRoute = new Map<string, Trip>()
  for (const t of trips.sort((a, b) => a.total - b.total))
    if (!byRoute.has(t.slug)) byRoute.set(t.slug, t)
  const direct1 = [...byRoute.values()]
  // Trips with a change: when no bus goes straight there, or one saves real time over the best that does.
  const bestDirect = direct1[0]?.total ?? Infinity
  const changes = planChanges(net, from, to).filter((t) => t.total + CHANGE_WORTH_MIN <= bestDirect)
  const ranked = [...direct1, ...changes]
    .sort((a, b) => a.total - b.total)
    // A bus that saves no time over walking isn't worth the wait.
    .filter((t) => t.total < direct)
  // Other ways are offered only when they're close to the best: not a two-hour detour.
  const shown = ranked.filter((t) => t.total <= ranked[0].total * 1.4 + 5).slice(0, max)
  return { walkOnly: direct <= WALK_ONLY_MIN || !shown.length ? direct : null, trips: shown }
}

/** How far apart two stops can be to change between them: a short walk across a corner. */
export const CHANGE_M = 400
/** What a change of bus costs on top of the walk: the wait for the second bus, on average. */
export const CHANGE_WAIT_MIN = 8
/** A change is offered next to a straight bus only if it gets there this much sooner. */
const CHANGE_WORTH_MIN = 10

type Dir = { r: NetworkRoute; d: NetworkDirection }

const leg = (
  r: NetworkRoute,
  d: NetworkDirection,
  i: number,
  j: number,
  walkIn: number,
  walkOut: number,
): Leg => {
  const st = d.stations
  return {
    slug: r.slug,
    number: r.number,
    kind: r.kind,
    dir: d.id,
    toward: d.toward,
    board: { index: i, id: st[i].id, name: st[i].name, at: st[i].at, walk: walkIn },
    alight: { index: j, id: st[j].id, name: st[j].name, at: st[j].at, walk: walkOut },
    ride: Math.max(1, st[j].min - st[i].min),
    stops: j - i,
    path: slicePath(d.path, st[i].at, st[j].at),
    between: st.slice(i, j + 1).map((x) => x.at),
  }
}

/**
 * Trips with one change: the first bus from a route the visitor can walk to,
 * the second from one that reaches near the destination, changing at stops
 * within CHANGE_M of each other. Each side is reduced first (the best stop
 * to have boarded by each stop of the first bus; the best stop to get off
 * after each stop of the second), so only the corners where the two lines
 * meet are compared. The best change per pair of routes, sorted by total.
 */
export function planChanges(net: Network, from: LatLng, to: LatLng, max = 3): Trip[] {
  const dirs: Dir[] = net.routes.flatMap((r) => r.directions.map((d) => ({ r, d })))
  const firsts = dirs.filter(({ d }) =>
    d.stations.slice(0, -1).some((s) => meters(from, s.at) <= MAX_WALK_M),
  )
  const seconds = dirs.filter(({ d }) =>
    d.stations.slice(1).some((s) => meters(s.at, to) <= MAX_WALK_M),
  )
  const out: Trip[] = []
  for (const A of firsts) {
    const a = A.d.stations
    // reachA[j]: the least walk + ride to be on bus A at its stop j, and where that was boarded.
    const reachA: { cost: number; i: number }[] = []
    let best = { cost: Infinity, i: -1 }
    for (let j = 0; j < a.length; j++) {
      reachA.push(
        best.i >= 0 ? { cost: best.cost + a[j].min, i: best.i } : { cost: Infinity, i: -1 },
      )
      const m = meters(from, a[j].at)
      if (j < a.length - 1 && m <= MAX_WALK_M) {
        const c = walkMinutes(m) - a[j].min
        if (c < best.cost) best = { cost: c, i: j }
      }
    }
    for (const B of seconds) {
      if (B.r.slug === A.r.slug) continue
      const bs = B.d.stations
      // restB[k]: the least ride + walk from boarding bus B at its stop k, and where to get off.
      const restB: { cost: number; l: number }[] = Array(bs.length)
      let after = { cost: Infinity, l: -1 }
      for (let k = bs.length - 1; k >= 0; k--) {
        restB[k] =
          after.l >= 0 ? { cost: after.cost - bs[k].min, l: after.l } : { cost: Infinity, l: -1 }
        const m = meters(bs[k].at, to)
        if (k > 0 && m <= MAX_WALK_M) {
          const c = bs[k].min + walkMinutes(m)
          if (c < after.cost) after = { cost: c, l: k }
        }
      }
      let pick: { total: number; j: number; k: number; walk: number } | null = null
      for (let j = 1; j < a.length; j++) {
        if (!Number.isFinite(reachA[j].cost)) continue
        for (let k = 0; k < bs.length - 1; k++) {
          if (!Number.isFinite(restB[k].cost)) continue
          // A cheap box before the real distance: 400 m is about 0.0036° of latitude.
          if (
            Math.abs(a[j].at[0] - bs[k].at[0]) > 0.004 ||
            Math.abs(a[j].at[1] - bs[k].at[1]) > 0.0045
          )
            continue
          const m = meters(a[j].at, bs[k].at)
          if (m > CHANGE_M) continue
          const walk = walkMinutes(m)
          const total = reachA[j].cost + walk + CHANGE_WAIT_MIN + restB[k].cost
          if (!pick || total < pick.total) pick = { total, j, k, walk }
        }
      }
      if (!pick) continue
      const i = reachA[pick.j].i
      const l = restB[pick.k].l
      const first = leg(A.r, A.d, i, pick.j, walkMinutes(meters(from, a[i].at)), pick.walk)
      const second = leg(B.r, B.d, pick.k, l, pick.walk, walkMinutes(meters(bs[l].at, to)))
      out.push({ ...first, total: Math.round(pick.total), then: second })
    }
  }
  // The best change per pair of routes.
  const byPair = new Map<string, Trip>()
  for (const t of out.sort((x, y) => x.total - y.total)) {
    const k = `${t.slug}>${t.then!.slug}`
    if (!byPair.has(k)) byPair.set(k, t)
  }
  return [...byPair.values()].slice(0, max)
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

export type NearbyRoute = {
  slug: string
  number: string | null
  kind: NetworkRoute['kind']
  /** Minutes on foot to the route's nearest stop, either way. */
  walk: number
  /** Each direction's nearest stop to board, by index (none at the end of the line). */
  dirs: { dir: string; toward: string; index: number; id: string; name: string; walk: number }[]
}

/** "Which buses can I catch from here?": every route with a stop within a walk, nearest first. */
export function nearbyRoutes(net: Network, from: LatLng, maxM = MAX_WALK_M): NearbyRoute[] {
  const out: NearbyRoute[] = []
  for (const r of net.routes) {
    const dirs: NearbyRoute['dirs'] = []
    for (const d of r.directions) {
      let best = { k: -1, m: Infinity }
      // The last stop is where the bus ends: not one to board.
      d.stations.slice(0, -1).forEach((st, k) => {
        const m = meters(from, st.at)
        if (m < best.m) best = { k, m }
      })
      if (best.k < 0 || best.m > maxM) continue
      const st = d.stations[best.k]
      dirs.push({
        dir: d.id,
        toward: d.toward,
        index: best.k,
        id: st.id,
        name: st.name,
        walk: walkMinutes(best.m),
      })
    }
    if (dirs.length)
      out.push({
        slug: r.slug,
        number: r.number,
        kind: r.kind,
        walk: Math.min(...dirs.map((x) => x.walk)),
        dirs,
      })
  }
  return out.sort((a, b) => a.walk - b.walk)
}

/** Close enough to a stop to say the visitor is at it (or the bus is). */
const AT_STOP_M = 120

export type Progress =
  | { kind: 'atStop'; leg: 1 | 2 }
  | { kind: 'riding'; leg: 1 | 2; left: number }
  | { kind: 'getOff'; leg: 1 | 2 }
  | null

/**
 * Where the visitor is along a trip, from where the phone says they are: at a
 * stop to board, on a bus with N stops to go, or at the stop to get off (on a
 * trip with a change, which bus). Null when they're nowhere near the ride
 * (still walking to it, or past it).
 */
export function tripProgress(
  trip: Pick<Trip, 'between'> & { then?: Pick<Leg, 'between'> },
  here: LatLng,
): Progress {
  const legs = trip.then ? [trip.between, trip.then.between] : [trip.between]
  let found: { leg: 1 | 2; k: number; m: number; last: number } | null = null
  legs.forEach((between, n) => {
    between.forEach((p, k) => {
      const m = meters(here, p)
      // Ties go to the first bus: at the corner where they change, "get off" comes before "board".
      if (m <= AT_STOP_M && (!found || m < found.m))
        found = { leg: (n + 1) as 1 | 2, k, m, last: between.length - 1 }
    })
  })
  if (!found) return null
  const f = found as { leg: 1 | 2; k: number; m: number; last: number }
  if (f.k === 0) return { kind: 'atStop', leg: f.leg }
  if (f.k === f.last) return { kind: 'getOff', leg: f.leg }
  return { kind: 'riding', leg: f.leg, left: f.last - f.k }
}
