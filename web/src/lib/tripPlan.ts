import { meters, miamiClock, walkMinutes, type LatLng } from './transitMath'

/**
 * "How do I get there?" over every route in Miami-Dade, together: Metrobus,
 * Metrorail, Metromover, the cities' trolleys and Hialeah's free lines.
 * Worked out in the browser, so the visitor's location never leaves it (the
 * popular-trip pages run the same code on the server).
 *
 * A trip is up to three rides: walk to a stop, ride, change (a short walk
 * across a corner, then the wait), ride, …, walk to the door.
 * - One ride: for each route and direction, the stop to board and the stop
 *   to get off that make walk + ride shortest (the best one per route).
 * - Changes: rounds over the stop patterns, the way RAPTOR does it, each
 *   round one more ride, keeping a stop's label only if it's better than
 *   any with fewer rides. A change is offered only when it saves real time
 *   over fewer rides.
 *
 * Only what's running is offered: each route carries its hours for each kind
 * of day, and a route outside them is skipped (at night, when nothing runs,
 * the plan is made with everything and the steps say when the next one
 * comes). The wait for a change is about half the time between buses, so a
 * change onto a trolley that comes every 40 minutes costs what it does. The
 * wait for the first ride ranks the trips the same way, but isn't added to
 * the total shown: that comes from the live arrivals once a trip is shown.
 *
 * Walks are straight-line distance scaled for streets (transitMath.walkMinutes),
 * as everywhere else on the site.
 */

export type DayKind = 'weekday' | 'saturday' | 'sunday'
export type Fare = 'free' | 'paid' | null
export type RouteKind = 'bus' | 'trolley' | 'rail' | 'mover'

export type NetworkStation = {
  id: string
  name: string
  at: LatLng
  min: number
  /** Hialeah's free lines: the ETA SPOT stop numbers for the live arrivals. */
  eta?: number[]
}
export type NetworkDirection = {
  /** Unique within the route: the feed's direction, and which of its patterns ("0", "0.1"). */
  id: string
  /** The feed's direction id, which the live data is keyed by. Defaults to `id`. */
  dir?: string
  toward: string
  /** The line comes back to its first stop: a ride can go round past it. */
  loop?: boolean
  stations: NetworkStation[]
  /** The street path, when there is one; otherwise a ride is drawn through its stops. */
  path?: LatLng[]
}
export type NetworkRoute = {
  slug: string
  number: string | null
  short: string
  /** What a rider calls it when it has no number: "Metrorail", "Flamingo". */
  name?: string | null
  kind: RouteKind
  fare?: Fare
  /** Where its live arrivals come from: the county's feed, or the City of Hialeah's ETA SPOT. */
  live?: 'county' | 'eta' | null
  /** The site's page for it: a county route (/bus/54), a free line (/bus/flamingo), or none. */
  page?: 'bus' | 'free' | null
  serviceEnds: string | null
  /** First and last trip of each kind of day, minutes after midnight (past 1440 is after midnight); null: no service. */
  hours?: Record<DayKind, [number, number] | null>
  /** Typical minutes between buses on each kind of day. */
  headway?: Record<DayKind, number | null>
  directions: NetworkDirection[]
}
export type Network = { routes: NetworkRoute[] }

/** One ride of a trip: where it's boarded, where it's left, and the ride between. */
export type Leg = {
  slug: string
  number: string | null
  name: string | null
  kind: RouteKind
  fare: Fare
  live: 'county' | 'eta' | null
  page: 'bus' | 'free' | null
  /** The pattern ridden (NetworkDirection.id), and the feed's direction for the live data. */
  dir: string
  feedDir: string
  toward: string
  board: { index: number; id: string; name: string; at: LatLng; walk: number; eta?: number[] }
  alight: { index: number; id: string; name: string; at: LatLng; walk: number }
  /** Ride minutes, from the operator's stop-to-stop times. */
  ride: number
  stops: number
  /** Typical minutes between buses today, when known. */
  headway: number | null
  /** The stretch ridden, for the map. */
  path: LatLng[]
  /** Every stop from the one boarded to the one to get off at, in order: for "N stops to go". */
  between: LatLng[]
}

/**
 * A trip: its rides in order. `board.walk` of the first is the walk to it; on
 * every ride `alight.walk` is the walk to the next ride's stop, or on the
 * last, to the door.
 */
export type Trip = {
  legs: Leg[]
  /** Walk + rides + changes (their walks and waits) + walk, minutes; the wait for the first ride comes on top. */
  total: number
  /** What the trips are ranked by: the total and the likely wait for the first ride. */
  rank: number
}

/** A walk longer than this at either end isn't a trip worth offering. */
export const MAX_WALK_M = 1300
/** Closer than this, walking is the answer. */
export const WALK_ONLY_MIN = 12
/** How far apart two stops can be to change between them: a short walk across a corner. */
export const CHANGE_M = 400
/** The wait for a change when how often the route comes isn't known. */
export const CHANGE_WAIT_MIN = 8
/** A trip with one more change is offered only if it gets there this much sooner. */
const CHANGE_WORTH_MIN = 10
/** At most this many rides. */
const MAX_RIDES = 3

export type Plan = { walkOnly: number | null; trips: Trip[] }

/* ----------------------------------------------------------- the clock */

const KIND_OF_DOW: DayKind[] = ['sunday', 'weekday', 'weekday', 'weekday', 'weekday', 'weekday', 'saturday']

/** Is the route running at this moment (Miami time)? A route with no hours always is. */
export function runningAt(r: NetworkRoute, when: Date): boolean {
  if (!r.hours) return true
  const { dow, min } = miamiClock(when)
  const today = r.hours[KIND_OF_DOW[dow]]
  if (today && min >= today[0] - 10 && min <= today[1]) return true
  // Last night's buses that run past midnight.
  const last = r.hours[KIND_OF_DOW[(dow + 6) % 7]]
  return !!last && last[1] > 1440 && min + 1440 <= last[1]
}

/** Typical minutes between buses today, when known. */
export function headwayAt(r: NetworkRoute, when: Date): number | null {
  return r.headway?.[KIND_OF_DOW[miamiClock(when).dow]] ?? null
}

/** The likely wait for a route: half the time between buses, within reason. */
const waitFor = (headway: number | null) =>
  headway === null ? CHANGE_WAIT_MIN : Math.min(20, Math.max(2, Math.round(headway / 2)))

/* ------------------------------------------------------ the prepared net */

type Pat = {
  r: NetworkRoute
  d: NetworkDirection
  /** Global stop index of each station, and its minutes; a loop's are doubled so a ride can go round. */
  ks: number[]
  mins: number[]
  /** Real stations (a loop's doubled sequence is twice this, less the repeated first stop). */
  n: number
  /** On a loop whose last stop repeats the first: 1 (the second lap skips it). */
  back: number
  /** Every stop's point, shared by the network (for the stops a ride passes). */
  pts: LatLng[]
}
type Prepared = {
  at: LatLng[]
  pats: Pat[]
  /** Patterns stopping at each stop, and where in them. */
  byStop: { p: number; i: number }[][]
  /** A coarse grid for "stops near here": ~1.1 km cells. */
  grid: Map<string, number[]>
  near: Map<number, { k: number; m: number }[]>
}

const CELL = 0.01
const cellOf = (p: LatLng) => `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`

const prepared = new WeakMap<Network, Prepared>()
function prepare(net: Network): Prepared {
  const hit = prepared.get(net)
  if (hit) return hit
  const index = new Map<string, number>()
  const at: LatLng[] = []
  const kOf = (s: NetworkStation) => {
    const key = `${s.id}@${s.at[0].toFixed(5)},${s.at[1].toFixed(5)}`
    let k = index.get(key)
    if (k === undefined) {
      k = at.length
      at.push(s.at)
      index.set(key, k)
    }
    return k
  }
  const pats: Pat[] = []
  for (const r of net.routes)
    for (const d of r.directions) {
      const st = d.stations
      if (st.length < 2) continue
      let ks = st.map(kOf)
      let mins = st.map((s) => s.min)
      let back = 0
      if (d.loop) {
        // Round again past the first stop (which is also the last): the minutes go on.
        const lap = mins[mins.length - 1]
        back = ks[ks.length - 1] === ks[0] ? 1 : 0
        ks = [...ks, ...ks.slice(back)]
        mins = [...mins, ...mins.slice(back).map((m) => m + lap + (back ? 0 : 1))]
      }
      pats.push({ r, d, ks, mins, n: st.length, back, pts: at })
    }
  const byStop: Prepared['byStop'] = at.map(() => [])
  pats.forEach((pt, p) => pt.ks.forEach((k, i) => i < pt.n && byStop[k].push({ p, i })))
  const grid = new Map<string, number[]>()
  at.forEach((p, k) => {
    const c = cellOf(p)
    const list = grid.get(c) ?? []
    list.push(k)
    grid.set(c, list)
  })
  const out = { at, pats, byStop, grid, near: new Map() }
  prepared.set(net, out)
  return out
}

/** Stops within `maxM` of a point, with the distance. */
function stopsNear(P: Prepared, p: LatLng, maxM: number): { k: number; m: number }[] {
  const span = Math.ceil(maxM / 1000)
  const [cy, cx] = [Math.floor(p[0] / CELL), Math.floor(p[1] / CELL)]
  const out: { k: number; m: number }[] = []
  for (let y = cy - span; y <= cy + span; y++)
    for (let x = cx - span; x <= cx + span; x++)
      for (const k of P.grid.get(`${y},${x}`) ?? []) {
        const m = meters(p, P.at[k])
        if (m <= maxM) out.push({ k, m })
      }
  return out
}

/** The stops a change can walk to from a stop (itself included), cached. */
function changesFrom(P: Prepared, k: number) {
  let list = P.near.get(k)
  if (!list) {
    list = stopsNear(P, P.at[k], CHANGE_M)
    P.near.set(k, list)
  }
  return list
}

/* ------------------------------------------------------------- the legs */

function makeLeg(pt: Pat, i: number, j: number, walkIn: number, walkOut: number, when: Date): Leg {
  const { r, d, n } = pt
  // A position on a loop's second lap is a station of the first.
  const index = (x: number) => (x < n ? x : x - n + pt.back)
  const a = d.stations[index(i)]
  const b = d.stations[index(j)]
  const between = pt.ks.slice(i, j + 1).map((k) => pt.pts[k])
  return {
    slug: r.slug,
    number: r.number,
    name: r.name ?? null,
    kind: r.kind,
    fare: r.fare ?? null,
    live: r.live ?? null,
    page: r.page ?? null,
    dir: d.id,
    feedDir: d.dir ?? d.id,
    toward: d.toward,
    board: { index: index(i), id: a.id, name: a.name, at: a.at, walk: walkIn, ...(a.eta ? { eta: a.eta } : {}) },
    alight: { index: index(j), id: b.id, name: b.name, at: b.at, walk: walkOut },
    ride: Math.max(1, Math.round(pt.mins[j] - pt.mins[i])),
    stops: j - i,
    headway: headwayAt(r, when),
    path: d.path && !d.loop ? slicePath(d.path, a.at, b.at) : between,
    between,
  }
}

/* ------------------------------------------------------------- planning */

export function planTrips(
  net: Network,
  from: LatLng,
  to: LatLng,
  max = 3,
  when: Date = new Date(),
): Plan {
  const direct = walkMinutes(meters(from, to))
  let trips = planWith(net, from, to, when, true)
  // Nothing running right now (the middle of the night): plan with everything,
  // and the steps say when the first one comes.
  if (!trips.length) trips = planWith(net, from, to, when, false)
  const ranked = trips.filter((t) => t.total < direct).sort((a, b) => a.rank - b.rank)
  // Other ways only when they're close to the best: not a two-hour detour.
  const shown = ranked.length
    ? ranked.filter((t) => t.rank <= ranked[0].rank * 1.4 + 5).slice(0, max)
    : []
  return { walkOnly: direct <= WALK_ONLY_MIN || !shown.length ? direct : null, trips: shown }
}

function planWith(net: Network, from: LatLng, to: LatLng, when: Date, onlyRunning: boolean): Trip[] {
  const P = prepare(net)
  const live = (r: NetworkRoute) => !onlyRunning || runningAt(r, when)
  const wait = new Map<NetworkRoute, number>()
  const waitOf = (r: NetworkRoute) => {
    let w = wait.get(r)
    if (w === undefined) {
      w = waitFor(headwayAt(r, when))
      wait.set(r, w)
    }
    return w
  }

  const origin = stopsNear(P, from, MAX_WALK_M)
  const dest = stopsNear(P, to, MAX_WALK_M)
  if (!origin.length || !dest.length) return []
  const toDoor = new Map(dest.map(({ k, m }) => [k, walkMinutes(m)]))

  /* One ride: the best board/alight pair on each pattern, then the best per route. */
  const one: Trip[] = []
  const fromWalk = new Map(origin.map(({ k, m }) => [k, walkMinutes(m)]))
  for (const pt of P.pats) {
    if (!live(pt.r)) continue
    let best: { i: number; j: number; cost: number } | null = null
    let board = { cost: Infinity, i: -1 }
    for (let x = 0; x < pt.ks.length; x++) {
      const k = pt.ks[x]
      if (board.i >= 0) {
        const out = toDoor.get(k)
        if (out !== undefined) {
          const cost = board.cost + pt.mins[x] + out
          if (!best || cost < best.cost) best = { i: board.i, j: x, cost }
        }
      }
      // Board up to the last real station (a loop's second lap is only for riding on).
      const w = x < pt.n - (pt.d.loop ? 0 : 1) ? fromWalk.get(k) : undefined
      if (w !== undefined && w - pt.mins[x] < board.cost) board = { cost: w - pt.mins[x], i: x }
    }
    if (!best) continue
    const leg = makeLeg(pt, best.i, best.j, fromWalk.get(pt.ks[best.i])!, toDoor.get(pt.ks[best.j])!, when)
    const total = leg.board.walk + leg.ride + leg.alight.walk
    one.push({ legs: [leg], total, rank: total + waitOf(pt.r) })
  }
  const perRoute = new Map<string, Trip>()
  for (const t of one.sort((a, b) => a.rank - b.rank))
    if (!perRoute.has(t.legs[0].slug)) perRoute.set(t.legs[0].slug, t)
  const singles = [...perRoute.values()]

  /* Changes: rounds, one more ride each. */
  const N = P.at.length
  // reach[k]: the best cost to be standing at stop k, ready to board, after `round` rides.
  // how[round][k]: how — walked from the origin (-2), off a ride here (-1), or walked from stop s (s).
  const best = new Float64Array(N).fill(Infinity)
  let reach = new Float64Array(N).fill(Infinity)
  let marked: number[] = []
  for (const { k, m } of origin) {
    reach[k] = walkMinutes(m)
    best[k] = reach[k]
    marked.push(k)
  }
  type Round = {
    ride: Float64Array
    rideBy: Int32Array
    rideFrom: Int32Array
    rideAt: Int32Array
    reach: Float64Array
    reachFrom: Int32Array
  }
  const rounds: Round[] = []
  const lastRoute: (NetworkRoute | null)[] = new Array(N).fill(null)
  for (let round = 1; round <= MAX_RIDES && marked.length; round++) {
    const prevReach = reach
    const ride = new Float64Array(N).fill(Infinity)
    const rideBy = new Int32Array(N).fill(-1)
    const rideFrom = new Int32Array(N).fill(-1)
    const rideAt = new Int32Array(N).fill(-1)
    const queue = new Map<number, number>()
    for (const k of marked)
      for (const { p, i } of P.byStop[k]) if (i < (queue.get(p) ?? Infinity)) queue.set(p, i)
    const prevRoute = lastRoute.slice()
    for (const [p, i0] of queue) {
      const pt = P.pats[p]
      if (!live(pt.r)) continue
      const w = round === 1 ? 0 : waitOf(pt.r)
      let board = { cost: Infinity, i: -1 }
      for (let x = i0; x < pt.ks.length; x++) {
        const k = pt.ks[x]
        if (board.i >= 0) {
          const c = board.cost + pt.mins[x]
          if (c < ride[k] && c < best[k] + 0.001) {
            ride[k] = c
            rideBy[k] = p
            rideFrom[k] = board.i
            rideAt[k] = x
          }
        }
        if (x >= pt.n - (pt.d.loop ? 0 : 1)) continue
        const r0 = prevReach[k]
        // Never the same route twice in a row: that's staying on.
        if (r0 === Infinity || prevRoute[k] === pt.r) continue
        const cb = r0 + w - pt.mins[x]
        if (cb < board.cost) board = { cost: cb, i: x }
      }
    }
    // Off the ride, and the short walks across corners to the next one.
    const nextReach = new Float64Array(N).fill(Infinity)
    const reachFrom = new Int32Array(N).fill(-3)
    const next: number[] = []
    for (let k = 0; k < N; k++) {
      if (ride[k] === Infinity) continue
      for (const { k: k2, m } of changesFrom(P, k)) {
        const c = ride[k] + (k2 === k ? 0 : walkMinutes(m))
        if (c < nextReach[k2] && c < best[k2]) {
          nextReach[k2] = c
          reachFrom[k2] = k2 === k ? -1 : k
          lastRoute[k2] = P.pats[rideBy[k]].r
        }
      }
    }
    for (let k = 0; k < N; k++)
      if (nextReach[k] < best[k]) {
        best[k] = nextReach[k]
        next.push(k)
      }
    rounds.push({ ride, rideBy, rideFrom, rideAt, reach: nextReach, reachFrom })
    reach = nextReach
    marked = next
  }

  /** The trip that ends with a ride to stop k in round `round` (1-based), rebuilt backwards. */
  const rebuild = (round: number, k: number): Leg[] | null => {
    const legs: Leg[] = []
    let stop = k
    let walkOut = toDoor.get(k)!
    for (let rd = round; rd >= 1; rd--) {
      const R = rounds[rd - 1]
      const p = R.rideBy[stop]
      if (p < 0) return null
      const pt = P.pats[p]
      const i = R.rideFrom[stop]
      const j = R.rideAt[stop]
      const boardK = pt.ks[i]
      let walkIn: number
      let prevStop = boardK
      if (rd === 1) walkIn = fromWalk.get(boardK) ?? Infinity
      else {
        const how = rounds[rd - 2].reachFrom[boardK]
        if (how === -3) return null
        prevStop = how === -1 ? boardK : how
        walkIn = how === -1 ? 0 : walkMinutes(meters(P.at[how], P.at[boardK]))
      }
      legs.unshift(makeLeg(pt, i, j, walkIn, walkOut, when))
      walkOut = walkIn
      stop = prevStop
    }
    return legs
  }

  const multi: Trip[] = []
  const seen = new Set<string>()
  for (let round = 2; round <= rounds.length; round++) {
    const R = rounds[round - 1]
    const ends = dest
      .filter(({ k }) => R.ride[k] < Infinity)
      .map(({ k }) => ({ k, cost: R.ride[k] + toDoor.get(k)! }))
      .sort((a, b) => a.cost - b.cost)
      .slice(0, 6)
    for (const { k } of ends) {
      const legs = rebuild(round, k)
      if (!legs || legs.length !== round) continue
      const key = legs.map((l) => l.slug).join('>')
      if (seen.has(key)) continue
      seen.add(key)
      const total =
        legs[0].board.walk +
        legs.reduce((n, l, x) => n + l.ride + l.alight.walk + (x > 0 ? waitOf(routeOf(net, l.slug)) : 0), 0)
      multi.push({ legs, total: Math.round(total), rank: Math.round(total) + waitOf(routeOf(net, legs[0].slug)) })
    }
  }

  // A change only when it saves real time over fewer rides.
  const out: Trip[] = [...singles]
  for (let n = 2; n <= MAX_RIDES; n++) {
    const fewer = Math.min(...out.map((t) => t.rank))
    out.push(...multi.filter((t) => t.legs.length === n && t.rank + CHANGE_WORTH_MIN <= fewer))
  }
  return out
}

const routeOf = (net: Network, slug: string) => net.routes.find((r) => r.slug === slug)!

/* ---------------------------------------------------------------- helpers */

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



export type NearbyRoute = {
  slug: string
  number: string | null
  name: string | null
  kind: NetworkRoute['kind']
  fare: Fare
  page: 'bus' | 'free' | null
  live: 'county' | 'eta' | null
  /** Minutes on foot to the route's nearest stop, either way. */
  walk: number
  /** Each direction's nearest stop to board, by index (none at the end of the line). */
  dirs: {
    dir: string
    feedDir: string
    toward: string
    index: number
    id: string
    name: string
    walk: number
    eta?: number[]
  }[]
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
      // A route's extra patterns (a branch) are one more way to board it, not another direction.
      const dup = dirs.find((x) => x.toward === d.toward)
      if (dup && dup.walk <= walkMinutes(best.m)) continue
      if (dup) dirs.splice(dirs.indexOf(dup), 1)
      dirs.push({
        dir: d.id,
        feedDir: d.dir ?? d.id,
        toward: d.toward,
        index: best.k,
        id: st.id,
        name: st.name,
        walk: walkMinutes(best.m),
        ...(st.eta ? { eta: st.eta } : {}),
      })
    }
    if (dirs.length)
      out.push({
        slug: r.slug,
        number: r.number,
        name: r.name ?? null,
        kind: r.kind,
        fare: r.fare ?? null,
        page: r.page ?? null,
        live: r.live ?? null,
        walk: Math.min(...dirs.map((x) => x.walk)),
        dirs,
      })
  }
  return out.sort((a, b) => a.walk - b.walk)
}

/** Close enough to a stop to say the visitor is at it (or the bus is). */
const AT_STOP_M = 120

export type Progress =
  | { kind: 'atStop'; leg: number }
  | { kind: 'riding'; leg: number; left: number }
  | { kind: 'getOff'; leg: number }
  | null

/**
 * Where the visitor is along a trip, from where the phone says they are: at a
 * stop to board, on a ride with N stops to go, or at the stop to get off (and
 * on which ride, counting from 1). Null when they're nowhere near the ride
 * (still walking to it, or past it).
 */
export function tripProgress(trip: { legs: Pick<Leg, 'between'>[] }, here: LatLng): Progress {
  let found: { leg: number; k: number; m: number; last: number } | null = null
  trip.legs.forEach(({ between }, n) => {
    between.forEach((p, k) => {
      const m = meters(here, p)
      // Ties go to the earlier ride: at the corner where they change, "get off" comes before "board".
      if (m <= AT_STOP_M && (!found || m < found.m))
        found = { leg: n + 1, k, m, last: between.length - 1 }
    })
  })
  if (!found) return null
  const f = found as { leg: number; k: number; m: number; last: number }
  if (f.k === 0) return { kind: 'atStop', leg: f.leg }
  if (f.k === f.last) return { kind: 'getOff', leg: f.leg }
  return { kind: 'riding', leg: f.leg, left: f.last - f.k }
}

/* ------------------------------------------------- the network on the wire */

/**
 * The network as it travels to the browser (lib/networkData.ts builds it):
 * one table of stops, `[lat, lng, name, id]`, and per pattern the stop
 * indexes and ride minutes. About 130 KB gzipped for every route in the county.
 */
export type WireRoute = Omit<NetworkRoute, 'directions'> & {
  patterns: {
    dir: string
    toward: string
    loop: boolean
    s: number[]
    m: number[]
    /** ETA SPOT stop numbers per stop (Hialeah's free lines). */
    e?: number[][]
    path?: LatLng[]
  }[]
}
export type WireNetwork = {
  source: { fetchedAt: string; serviceEnds: string | null; feedHash?: string }
  stops: [number, number, string, string][]
  routes: WireRoute[]
}

export function expandNetwork(w: WireNetwork): Network {
  return {
    routes: w.routes.map(({ patterns, ...r }) => {
      const count = new Map<string, number>()
      return {
        ...r,
        directions: patterns.map((p) => {
          const n = count.get(p.dir) ?? 0
          count.set(p.dir, n + 1)
          return {
            id: n ? `${p.dir}.${n}` : p.dir,
            dir: p.dir,
            toward: p.toward,
            loop: p.loop,
            ...(p.path ? { path: p.path } : {}),
            stations: p.s.map((k, x) => {
              const [lat, lng, name, id] = w.stops[k]
              return {
                id,
                name,
                at: [lat, lng] as LatLng,
                min: p.m[x],
                ...(p.e ? { eta: p.e[x] } : {}),
              }
            }),
          }
        }),
      }
    }),
  }
}
