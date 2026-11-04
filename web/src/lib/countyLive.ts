import GtfsRealtimeBindings from 'gtfs-realtime-bindings'
import { COUNTY, getCountyRoute } from './county'

/**
 * Miami-Dade Transit's buses, live.
 *
 * The county's real-time data comes from Swiftly, the vendor behind its Bus
 * Tracker and the arrivals Google Maps shows. Swiftly gave the site its own
 * key (Nov 3, 2026, agency `miami`): GTFS-realtime trip updates (a predicted
 * time at each stop still ahead of every trip) and vehicle positions.
 *
 * The key allows 180 requests per 15 minutes, for the whole site. So the
 * server reads the two feeds at most once per TTL and every visitor shares
 * that copy; the browser never sees the key or calls Swiftly. Two feeds every
 * 15 s is 120 requests per 15 minutes.
 *
 * License terms (agreed Nov 2): the data is "as is", Swiftly can revoke the key
 * at any time, the site's terms carry a line saying so, and none of it is
 * handed to an ad network. Everything here degrades to "no live data" and the
 * pages fall back to the county's schedule.
 */

const BASE = 'https://api.goswift.ly/real-time/miami'
const TTL_MS = 15_000
const TIMEOUT_MS = 5000
/** A bus that hasn't reported for this long is switched off or lost, not in traffic. */
export const STALE_S = 300
/** A feed whose header is older than this is stuck: don't quote it as live. */
export const FEED_STALE_S = 120

/** The feed's route ids for our routes. They change with the county's feed edition (see `transit:county`). */
const ROUTE_IDS = new Map(COUNTY.routes.filter((r) => r.routeId).map((r) => [r.routeId!, r.slug]))

export type CountyVehicle = {
  id: string
  slug: string
  dir: string
  tripId: string
  lat: number
  lng: number
  bearing: number
  ts: number
}

/** One predicted stop: when trip `tripId` (bus `vehicleId`) leaves `stopId`, unix seconds. */
export type Prediction = { tripId: string; vehicleId: string | null; at: number }

export type CountyFeed = {
  /** The trip-updates header: when Swiftly made this snapshot. */
  headerTs: number
  vehicles: CountyVehicle[]
  /** `slug|dir|stopId` → the predicted departures there, soonest first. */
  stops: Map<string, Prediction[]>
  /** Trips the county has canceled today, per `slug|dir`. */
  canceled: Map<string, number>
  /** Entities on any route in the feed vs. on ours: none of ours means our route ids are out of date. */
  seen: { any: number; ours: number }
}

const T = GtfsRealtimeBindings.transit_realtime
const { ScheduleRelationship: TripRel } = T.TripDescriptor
const { ScheduleRelationship: StopRel } = T.TripUpdate.StopTimeUpdate

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0))
export const stopKey = (slug: string, dir: string, stopId: string) => `${slug}|${dir}|${stopId}`

async function fetchPb(name: string, key: string) {
  const res = await fetch(`${BASE}/${name}`, {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`swiftly ${name} ${res.status}`)
  return T.FeedMessage.decode(new Uint8Array(await res.arrayBuffer()))
}

type Message = ReturnType<typeof T.FeedMessage.decode>

/** The two feeds, reduced to our routes. Exported for the tests, which feed it fixtures. */
export function reduceFeeds(pos: Message, upd: Message): CountyFeed {
  const vehicles: CountyVehicle[] = []
  for (const e of pos.entity) {
    const v = e.vehicle
    const slug = v?.trip?.routeId ? ROUTE_IDS.get(v.trip.routeId) : undefined
    if (!v?.position || !v.trip?.tripId || !slug) continue
    vehicles.push({
      id: String(v.vehicle?.id ?? e.id),
      slug,
      dir: String(v.trip.directionId ?? ''),
      tripId: v.trip.tripId,
      lat: v.position.latitude,
      lng: v.position.longitude,
      bearing: v.position.bearing ?? 0,
      ts: num(v.timestamp),
    })
  }

  const stops = new Map<string, Prediction[]>()
  const canceled = new Map<string, number>()
  const seen = { any: 0, ours: 0 }
  for (const e of upd.entity) {
    const tu = e.tripUpdate
    if (!tu?.trip?.tripId) continue
    seen.any++
    const slug = tu.trip.routeId ? ROUTE_IDS.get(tu.trip.routeId) : undefined
    if (!slug) continue
    seen.ours++
    const dir = String(tu.trip.directionId ?? '')
    if (tu.trip.scheduleRelationship === TripRel.CANCELED) {
      const k = `${slug}|${dir}`
      canceled.set(k, (canceled.get(k) ?? 0) + 1)
      continue
    }
    const list = tu.stopTimeUpdate ?? []
    // The trip's last stop is where it ends: nobody boards there.
    list.slice(0, -1).forEach((s) => {
      if (
        !s.stopId ||
        s.scheduleRelationship === StopRel.SKIPPED ||
        s.scheduleRelationship === StopRel.NO_DATA
      )
        return
      const at = num(s.departure?.time ?? s.arrival?.time)
      if (!at) return
      const k = stopKey(slug, dir, s.stopId)
      const here = stops.get(k) ?? []
      here.push({
        tripId: tu.trip.tripId!,
        vehicleId: tu.vehicle?.id ? String(tu.vehicle.id) : null,
        at,
      })
      stops.set(k, here)
    })
  }
  for (const list of stops.values()) list.sort((a, b) => a.at - b.at)
  return { headerTs: num(upd.header?.timestamp), vehicles, stops, canceled, seen }
}

async function load(): Promise<CountyFeed | null> {
  const key = process.env.SWIFTLY_API_KEY
  if (!key) return null
  try {
    const [pos, upd] = await Promise.all([
      fetchPb('gtfs-rt-vehicle-positions', key),
      fetchPb('gtfs-rt-trip-updates', key),
    ])
    const feed = reduceFeeds(pos, upd)
    if (feed.seen.any > 0 && feed.seen.ours === 0)
      console.warn(
        '[countyLive] Swiftly has trips but none on our route ids: re-run pnpm transit:county',
      )
    return feed
  } catch (err) {
    console.warn('[countyLive]', err instanceof Error ? err.message : err)
    return null
  }
}

let cached: { at: number; feed: Promise<CountyFeed | null> } | null = null

/** The feeds, at most one read per TTL for the whole server. A failure is cached as long. */
export function countyFeed(now: number = Date.now()): Promise<CountyFeed | null> {
  if (!cached || now - cached.at > TTL_MS) cached = { at: now, feed: load() }
  return cached.feed
}

export type LiveDeparture = {
  /** Unix seconds the bus is predicted to leave the stop. */
  at: number
  /** The bus behind the prediction is reporting its position right now. */
  tracked: boolean
}

export type StopLive = {
  /** When Swiftly made the snapshot, unix seconds. */
  asOf: number
  departures: LiveDeparture[]
  /** Trips canceled today in this direction, so a gap in the times can be explained. */
  canceled: number
}

/**
 * The next buses at a stop from the live feed: only predictions backed by a
 * bus that is reporting, so "live" means a bus someone could see on a map.
 * Null when there's no live data to stand on (no key, feed down or stuck):
 * the page then shows the schedule alone.
 */
export function stopDepartures(
  feed: CountyFeed | null,
  slug: string,
  dir: string,
  stopId: string,
  nowS: number = Date.now() / 1000,
  count = 3,
): StopLive | null {
  if (!feed || nowS - feed.headerTs > FEED_STALE_S) return null
  const fresh = new Set(feed.vehicles.filter((v) => nowS - v.ts <= STALE_S).map((v) => v.id))
  const departures = (feed.stops.get(stopKey(slug, dir, stopId)) ?? [])
    .filter((p) => p.at >= nowS - 30 && p.vehicleId !== null && fresh.has(p.vehicleId))
    .slice(0, count)
    .map((p) => ({ at: p.at, tracked: true }))
  return { asOf: feed.headerTs, departures, canceled: feed.canceled.get(`${slug}|${dir}`) ?? 0 }
}

/** Is `stopId` one of the route's stops in direction `dir`? The API only answers for those. */
export function isRouteStop(slug: string, dir: string, stopId: string): boolean {
  const route = getCountyRoute(slug)
  return !!route?.directions.find((d) => d.id === dir)?.stations.some((s) => s.id === stopId)
}
