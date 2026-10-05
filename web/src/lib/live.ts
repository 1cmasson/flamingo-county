import GtfsRealtimeBindings from 'gtfs-realtime-bindings'
import eta from '../data/transit/hialeah-eta.json'
import { getRoute, meters, miamiClock, type TransitRoute } from './transit'

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
export function snapshotFrom(feed: Feed | null, now: number): LiveSnapshot {
  if (!feed) return { ok: false, updatedAt: null, vehicles: [] }
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
}

/**
 * The next buses at any of these ETA stops (both sides of a street are two
 * stops), soonest first. Live trips count from where the bus actually is;
 * trips that haven't started yet are the timetable. Sundays have neither.
 */
export async function nextArrivals(stopIds: number[], nowDate: Date = new Date(), limit = 3): Promise<Arrival[]> {
  if (!stopIds.length) return []
  return arrivalsFrom(await liveFeed(nowDate.getTime()), stopIds, nowDate, limit)
}

/** ETA's schedule, for tests and the sync script's sanity checks. */
export const ETA_SCHEDULE = ETA

/** The pure half of nextArrivals, for tests: works with no feed at all (timetable only). */
export function arrivalsFrom(feed: Feed | null, stopIds: number[], nowDate: Date, limit = 3): Arrival[] {
  const want = new Set(stopIds)
  const { dow, min } = miamiClock(nowDate)
  const nowS = min * 60 + nowDate.getUTCSeconds()
  const out: Arrival[] = []

  const liveTrips = new Set<string>()
  if (feed) {
    for (const v of feed.vehicles) {
      const trip = ETA.trips[v.tripId]
      if (!trip || nowDate.getTime() / 1000 - v.ts > STALE_S) continue
      liveTrips.add(v.tripId)
      for (let i = Math.max(0, v.seq - trip.seq0); i < trip.stops.length; i++) {
        if (!want.has(trip.stops[i])) continue
        const delay = delayFor(v.tripId, trip.seq0 + i, feed) ?? 0
        const minutes = Math.round((trip.secs[i] + delay - nowS) / 60)
        if (minutes >= 0 && minutes <= HORIZON_MIN) {
          out.push({ route: trip.route, minutes, live: true, delayMin: Math.round(delay / 60) })
          break
        }
      }
    }
  }

  const services = new Set(dow === 0 ? [] : dow === 6 ? ETA.services.saturday : ETA.services.weekday)
  for (const [id, trip] of Object.entries(ETA.trips)) {
    // Only trips that haven't left: one that's out without a live position is
    // a bus we can't vouch for, so it isn't promised.
    if (!services.has(trip.service) || liveTrips.has(id) || trip.secs[0] <= nowS) continue
    const i = trip.stops.findIndex((s) => want.has(s))
    if (i < 0) continue
    const minutes = Math.round((trip.secs[i] - nowS) / 60)
    if (minutes <= HORIZON_MIN) out.push({ route: trip.route, minutes, live: false, delayMin: 0 })
  }

  return out.sort((a, b) => a.minutes - b.minutes).slice(0, limit)
}
