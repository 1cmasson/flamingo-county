import GtfsRealtimeBindings from 'gtfs-realtime-bindings'
import eta from '../data/transit/hialeah-eta.json'
import { TRANSIT, getRoute, meters, miamiClock, serviceStatus, type TransitRoute } from './transit'

/**
 * Hialeah's buses, live.
 *
 * ETA Transit Systems — the vendor behind the city's ETA SPOT tracker —
 * publishes the city's live data as standard GTFS-realtime next to its
 * schedule: `position_updates.pb` (where each bus is) and `trip_updates.pb`
 * (how late each trip is running). They refresh every few seconds.
 *
 * The server reads them, never the browser: the bucket sends no CORS headers,
 * and one fetch per 15 seconds for the whole site is the polite load on a feed
 * nobody asked us to lean on. Everything here degrades to "no live data" — the
 * pages then say so and fall back to the city's hours and typical frequency.
 *
 * Arrival maths: ETA's live trip updates carry a delay, not a time. So the
 * next bus at a stop is that trip's scheduled time at the stop (from ETA's own
 * schedule, `pnpm transit:sync` → hialeah-eta.json) plus its current delay.
 * Trips that haven't left yet are offered as "scheduled", never as live.
 */

const BASE = 'https://s3.amazonaws.com/etatransit.gtfs/hialeahtransit.etaspot.net'
const TTL_MS = 15_000
const TIMEOUT_MS = 4000
/** A position older than this is a bus that's been switched off, not one in traffic. */
const STALE_S = 300
/** Don't offer a scheduled trip further out than this. */
const HORIZON_MIN = 180

type EtaTrip = { route: TransitRoute['slug']; service: string; seq0: number; stops: number[]; secs: number[] }
const ETA = eta as unknown as {
  services: { weekday: string[]; saturday: string[] }
  stops: Record<string, string>
  trips: Record<string, EtaTrip>
}

export type RawVehicle = { id: string; tripId: string; lat: number; lng: number; bearing: number; seq: number; stopId: string; ts: number }
export type Feed = { headerTs: number; vehicles: RawVehicle[]; delays: Map<string, { seq: number; delay: number }[]> }

let cached: { at: number; feed: Promise<Feed | null> } | null = null

const T = GtfsRealtimeBindings.transit_realtime

async function fetchPb(name: string) {
  const res = await fetch(`${BASE}/${name}`, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
  if (!res.ok) throw new Error(`${name} ${res.status}`)
  return T.FeedMessage.decode(new Uint8Array(await res.arrayBuffer()))
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0))

async function load(): Promise<Feed | null> {
  try {
    const [pos, upd] = await Promise.all([fetchPb('position_updates.pb'), fetchPb('trip_updates.pb')])
    const vehicles: RawVehicle[] = []
    for (const e of pos.entity) {
      const v = e.vehicle
      if (!v?.position || !v.trip?.tripId) continue
      vehicles.push({
        id: String(v.vehicle?.id ?? e.id),
        tripId: v.trip.tripId,
        lat: v.position.latitude,
        lng: v.position.longitude,
        bearing: v.position.bearing ?? 0,
        seq: v.currentStopSequence ?? 0,
        stopId: String(v.stopId ?? ''),
        ts: num(v.timestamp),
      })
    }
    const delays = new Map<string, { seq: number; delay: number }[]>()
    for (const e of upd.entity) {
      const tu = e.tripUpdate
      if (!tu?.trip?.tripId) continue
      delays.set(
        tu.trip.tripId,
        (tu.stopTimeUpdate ?? []).map((s) => ({ seq: s.stopSequence ?? 0, delay: s.arrival?.delay ?? s.departure?.delay ?? 0 })),
      )
    }
    return { headerTs: num(pos.header?.timestamp), vehicles, delays }
  } catch {
    return null
  }
}

/** The feed, at most one fetch per 15s for the whole server. A failure is cached as long. */
export function liveFeed(now: number = Date.now()): Promise<Feed | null> {
  if (!cached || now - cached.at > TTL_MS) cached = { at: now, feed: load() }
  return cached.feed
}

/**
 * Which way a bus is going, as one of our line's two ends. ETA's trips are
 * mostly loops (out and back as one trip), so a trip's last stop says nothing;
 * what does is the next of OUR stations the trip reaches after this point —
 * further down our strip means toward its end, back up means toward its start.
 */
export type Toward = 'start' | 'end'

/** ETA stop number → index of our station on each line. */
const STATION_OF: Record<string, Map<number, number>> = Object.fromEntries(
  TRANSIT.routes.map((r) => {
    const m = new Map<number, number>()
    r.stations.forEach((st, i) => (st.eta ?? []).forEach((id) => id !== null && m.set(id, i)))
    return [r.slug, m]
  }),
)

/** The furthest of our stations ETA serves, per line — its end, for this purpose. */
const LAST_STATION: Record<string, number> = Object.fromEntries(
  Object.entries(STATION_OF).map(([slug, m]) => [slug, Math.max(-1, ...m.values())]),
)

export function towardAt(trip: Pick<EtaTrip, 'route' | 'stops'>, i: number): Toward | null {
  const of = STATION_OF[trip.route]
  if (!of) return null
  // Where the bus is: this stop if it's one of ours, else the last of ours behind it.
  let here: number | undefined
  for (let k = i; k >= 0 && here === undefined; k--) here = of.get(trip.stops[k])
  // At either end of the line there's only one way left to go.
  const last = LAST_STATION[trip.route]
  if (here === 0) return 'end'
  if (here !== undefined && here === last) return 'start'
  for (let k = i + 1; k < trip.stops.length; k++) {
    const next = of.get(trip.stops[k])
    if (next === undefined || next === here) continue
    if (here === undefined) here = next
    else return next > here ? 'end' : 'start'
  }
  // The trip's last stretch: compare with where it came from instead.
  for (let k = i - 1; k >= 0; k--) {
    const prev = of.get(trip.stops[k])
    if (prev !== undefined && here !== undefined && prev !== here) return here > prev ? 'end' : 'start'
  }
  return null
}

export type LiveVehicle = {
  id: string
  route: TransitRoute['slug']
  lat: number
  lng: number
  bearing: number
  /** Minutes behind schedule, rounded; negative is early. */
  delayMin: number
  next: string | null
  /** The station on our strip the bus is nearest, so a line page can mark it. */
  stationId: string | null
  toward: Toward | null
}

/** Our nearest station to a bus, on its own line, if it's close enough to say so. */
function nearestStation(route: TransitRoute['slug'], lat: number, lng: number): string | null {
  const r = getRoute(route)
  if (!r) return null
  let best: string | null = null
  let bestD = 500
  for (const st of r.stations) {
    for (const p of st.points) {
      const d = meters([lat, lng], p)
      if (d < bestD) {
        bestD = d
        best = st.id
      }
    }
  }
  return best
}

export type LiveSnapshot = { ok: boolean; updatedAt: number | null; vehicles: LiveVehicle[] }

function delayFor(tripId: string, seq: number, feed: Feed): number | null {
  const list = feed.delays.get(tripId)
  if (!list?.length) return null
  // The update for this stop, or the last one before it — delay carries forward.
  let best: number | null = null
  for (const u of list) if (u.seq <= seq || best === null) best = u.delay
  const exact = list.find((u) => u.seq === seq)
  return exact ? exact.delay : best
}

export async function liveSnapshot(now: number = Date.now()): Promise<LiveSnapshot> {
  return snapshotFrom(await liveFeed(now), now)
}

/** The pure half of liveSnapshot, for tests: a decoded feed → what the map shows. */
/**
 * Whether the feed can be believed right now. Three ways it can't, each of
 * which would otherwise turn into a confident "no buses on the road":
 *
 * - **Frozen.** The file is still served but stopped updating.
 * - **Out of step with our schedule.** ETA reissues trip numbers when it
 *   republishes its timetable (its schedule file already says it ended on
 *   2026-09-11). Fresh buses on trips we can't look up mean
 *   hialeah-eta.json is stale — rerun `pnpm transit:sync`.
 * - **Empty in service hours.** The city runs buses from 6 AM; a feed with
 *   none on the road then is broken, not quiet.
 */
const warned = new WeakSet<Feed>()

export function feedHealthy(feed: Feed | null, now: number): boolean {
  if (!feed) return false
  if (feed.headerTs && now / 1000 - feed.headerTs > STALE_S) return false
  const fresh = feed.vehicles.filter((v) => now / 1000 - v.ts <= STALE_S)
  const known = fresh.filter((v) => ETA.trips[v.tripId])
  if (fresh.length && known.length / fresh.length < 0.5) {
    // Once per fetched feed, not once per request: every page view asks.
    if (!warned.has(feed)) {
      warned.add(feed)
      console.warn(`[live] ${fresh.length - known.length} of ${fresh.length} live buses are on trips missing from hialeah-eta.json — run pnpm transit:sync`)
    }
    return false
  }
  if (!fresh.length && serviceStatus(new Date(now)).state === 'running') return false
  return true
}

export function snapshotFrom(feed: Feed | null, now: number): LiveSnapshot {
  if (!feed || !feedHealthy(feed, now)) return { ok: false, updatedAt: feed?.headerTs ? feed.headerTs * 1000 : null, vehicles: [] }
  const vehicles = feed.vehicles.flatMap((v): LiveVehicle[] => {
    const trip = ETA.trips[v.tripId]
    if (!trip || now / 1000 - v.ts > STALE_S) return []
    const delay = delayFor(v.tripId, v.seq, feed)
    const nextStop = trip.stops[v.seq - trip.seq0]
    return [
      {
        id: v.id,
        route: trip.route,
        lat: Number(v.lat.toFixed(5)),
        lng: Number(v.lng.toFixed(5)),
        bearing: Math.round(v.bearing),
        delayMin: delay === null ? 0 : Math.round(delay / 60),
        next: nextStop ? (ETA.stops[String(nextStop)] ?? null) : null,
        stationId: nearestStation(trip.route, v.lat, v.lng),
        toward: towardAt(trip, Math.max(0, v.seq - trip.seq0)),
      },
    ]
  })
  return { ok: true, updatedAt: feed.headerTs ? feed.headerTs * 1000 : null, vehicles }
}

export type Arrival = {
  route: TransitRoute['slug']
  /** Whole minutes from now; 0 means arriving. */
  minutes: number
  /** True when the time comes from a bus on the road, false when it's the timetable. */
  live: boolean
  delayMin: number
  /** ETA's name for the pole the bus stops at — it carries the direction (EB, NB…). */
  stop: string
  /** ETA's number for that pole, so a page can send the rider to the right side of the street. */
  stopId: number
  toward: Toward | null
  /** The bus on the road, for a live arrival — the same id the map's bus has. */
  vehicleId: string | null
}

/**
 * The next buses at any of these ETA stops (both sides of a street are two
 * stops), soonest first. Live trips count from where the bus actually is;
 * trips that haven't started yet are the timetable. Sundays have neither.
 */
export async function nextArrivals(stopIds: number[], nowDate: Date = new Date(), limit = 3, route?: string): Promise<Arrival[]> {
  if (!stopIds.length) return []
  return arrivalsFrom(await liveFeed(nowDate.getTime()), stopIds, nowDate, limit, route)
}

/** ETA's schedule, for tests and the sync script's sanity checks. */
export const ETA_SCHEDULE = ETA

/** The pure half of nextArrivals, for tests: works with no feed at all (timetable only). */
/** `route`, when given, is applied before `limit`: at a stop both lines share, the other line's buses mustn't use up the answer. */
export function arrivalsFrom(feed: Feed | null, stopIds: number[], nowDate: Date, limit = 3, route?: string): Arrival[] {
  const want = new Set(stopIds)
  const { dow, min } = miamiClock(nowDate)
  const nowS = min * 60 + nowDate.getUTCSeconds()
  const out: Arrival[] = []

  const healthy = feedHealthy(feed, nowDate.getTime())
  const liveTrips = new Set<string>()
  if (feed && healthy) {
    for (const v of feed.vehicles) {
      const trip = ETA.trips[v.tripId]
      if (!trip || nowDate.getTime() / 1000 - v.ts > STALE_S) continue
      liveTrips.add(v.tripId)
      // A loop passes a stop once each way (one pole per side of the street),
      // so a trip can be the next bus in both directions: keep its first pass
      // each way, not just its first pass.
      const ways = new Set<string>()
      for (let i = Math.max(0, v.seq - trip.seq0); i < trip.stops.length; i++) {
        if (!want.has(trip.stops[i])) continue
        const toward = towardAt(trip, i)
        if (ways.has(String(toward))) continue
        const delay = delayFor(v.tripId, trip.seq0 + i, feed) ?? 0
        const minutes = Math.round((trip.secs[i] + delay - nowS) / 60)
        if (minutes < 0) continue
        if (minutes > HORIZON_MIN) break
        ways.add(String(toward))
        out.push({
          route: trip.route,
          minutes,
          live: true,
          delayMin: Math.round(delay / 60),
          stop: ETA.stops[String(trip.stops[i])] ?? '',
          stopId: trip.stops[i],
          toward,
          vehicleId: v.id,
        })
      }
    }
  }

  const services = new Set(dow === 0 ? [] : dow === 6 ? ETA.services.saturday : ETA.services.weekday)
  for (const [id, trip] of Object.entries(ETA.trips)) {
    // With a healthy feed, only trips that haven't left: one that's out with no
    // live position is a bus we can't vouch for. With the feed down, every bus
    // is one we can't see, so the timetable is all there is — labelled as such.
    if (!services.has(trip.service) || liveTrips.has(id)) continue
    if (healthy && trip.secs[0] <= nowS) continue
    // First pass each way, as above.
    const ways = new Set<string>()
    for (let i = 0; i < trip.stops.length; i++) {
      if (!want.has(trip.stops[i]) || trip.secs[i] < nowS) continue
      const toward = towardAt(trip, i)
      if (ways.has(String(toward))) continue
      const minutes = Math.round((trip.secs[i] - nowS) / 60)
      if (minutes > HORIZON_MIN) break
      ways.add(String(toward))
      out.push({
        route: trip.route,
        minutes,
        live: false,
        delayMin: 0,
        stop: ETA.stops[String(trip.stops[i])] ?? '',
        stopId: trip.stops[i],
        toward,
        vehicleId: null,
      })
    }
  }

  return out
    .filter((a) => !route || a.route === route)
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, limit)
}
