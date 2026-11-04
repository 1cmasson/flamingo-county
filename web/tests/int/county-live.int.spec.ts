import { describe, it, expect } from 'vitest'
import GtfsRealtimeBindings from 'gtfs-realtime-bindings'
import { mergeDepartures } from '@/lib/busTime'
import { isRouteStop, reduceFeeds, stopDepartures, stopKey } from '@/lib/countyLive'
import { getCountyRoute } from '@/lib/county'

/**
 * Swiftly's live feeds, reduced for the «Próxima guagua» card. The fixtures are
 * made up here, never a saved copy of the feed (the license keeps its data out
 * of the repo).
 */

const T = GtfsRealtimeBindings.transit_realtime
const r54 = getCountyRoute('54')!
const ROUTE = r54.routeId!
const d0 = r54.directions.find((d) => d.id === '0')!
const [s1, s2, s3] = d0.stations.map((s) => s.id)
const NOW = 1_800_000_000

const msg = (entity: object[]) =>
  T.FeedMessage.decode(
    T.FeedMessage.encode(
      T.FeedMessage.fromObject({ header: { gtfsRealtimeVersion: '2.0', timestamp: NOW }, entity }),
    ).finish(),
  )

const vehicle = (id: string, trip: string, ts: number) => ({
  id,
  vehicle: {
    trip: { tripId: trip, routeId: ROUTE, directionId: 0 },
    position: { latitude: 25.86, longitude: -80.3 },
    vehicle: { id },
    timestamp: ts,
  },
})
const update = (trip: string, veh: string | null, stops: [string, number][], canceled = false) => ({
  id: trip,
  tripUpdate: {
    trip: { tripId: trip, routeId: ROUTE, directionId: 0, scheduleRelationship: canceled ? 3 : 0 },
    ...(veh ? { vehicle: { id: veh } } : {}),
    stopTimeUpdate: stops.map(([stopId, at], k) => ({
      stopSequence: k + 1,
      stopId,
      arrival: { time: at },
    })),
  },
})

describe('county live feed', () => {
  it('keeps our routes only and lists each stop’s predictions soonest first', () => {
    const feed = reduceFeeds(
      msg([vehicle('b1', 't1', NOW - 20), vehicle('b2', 't2', NOW - 10)]),
      msg([
        update('t2', 'b2', [
          [s1, NOW + 900],
          [s2, NOW + 1000],
          [s3, NOW + 1100],
        ]),
        update('t1', 'b1', [
          [s1, NOW + 300],
          [s2, NOW + 400],
          [s3, NOW + 500],
        ]),
        { id: 'x', tripUpdate: { trip: { tripId: 'x', routeId: 'not-ours' } } },
      ]),
    )
    expect(feed.vehicles.map((v) => v.id)).toEqual(['b1', 'b2'])
    expect(feed.seen).toEqual({ any: 3, ours: 2 })
    expect(feed.stops.get(stopKey('54', '0', s1))!.map((p) => p.tripId)).toEqual(['t1', 't2'])
    // The last stop of a trip is where it ends: no one boards there.
    expect(feed.stops.get(stopKey('54', '0', s3))).toBeUndefined()
  })

  it('calls a time live only when its bus is reporting, and skips canceled trips', () => {
    const feed = reduceFeeds(
      msg([vehicle('b1', 't1', NOW - 20), vehicle('old', 't3', NOW - 900)]),
      msg([
        update('t1', 'b1', [
          [s1, NOW + 300],
          [s2, NOW + 400],
        ]),
        update('t3', 'old', [
          [s1, NOW + 600],
          [s2, NOW + 700],
        ]),
        update('t4', null, [
          [s1, NOW + 650],
          [s2, NOW + 750],
        ]),
        update(
          't5',
          'b1',
          [
            [s1, NOW + 120],
            [s2, NOW + 200],
          ],
          true,
        ),
      ]),
    )
    const live = stopDepartures(feed, '54', '0', s1, NOW)!
    expect(live.departures).toEqual([{ at: NOW + 300, tracked: true }])
    expect(live.canceled).toBe(1)
  })

  it('has nothing to say when the feed is stuck', () => {
    const feed = reduceFeeds(
      msg([vehicle('b1', 't1', NOW)]),
      msg([
        update('t1', 'b1', [
          [s1, NOW + 300],
          [s2, NOW + 400],
        ]),
      ]),
    )
    expect(stopDepartures(feed, '54', '0', s1, NOW + 600)).toBeNull()
    expect(stopDepartures(null, '54', '0', s1, NOW)).toBeNull()
  })

  it('answers only for a route’s own stops', () => {
    expect(isRouteStop('54', '0', s1)).toBe(true)
    expect(isRouteStop('54', '0', 'nope')).toBe(false)
    expect(isRouteStop('nope', '0', s1)).toBe(false)
  })
})

describe('live and scheduled times together', () => {
  const now = new Date('2026-11-03T18:00:00-05:00') // 6:00 PM in Miami = 1080
  const nowS = now.getTime() / 1000
  const sched = [
    { at: 1083, wait: 3 },
    { at: 1095, wait: 15 },
    { at: 1110, wait: 30 },
  ]

  it('puts live buses first and drops the schedule times they stand for', () => {
    const out = mergeDepartures([nowS + 8 * 60], sched, now)
    expect(out).toEqual([
      { at: 1088, wait: 8, live: true },
      { at: 1095, wait: 15, live: false },
      { at: 1110, wait: 30, live: false },
    ])
  })

  it('is the schedule alone with no live buses', () => {
    expect(mergeDepartures([], sched, now).every((x) => !x.live)).toBe(true)
  })

  it('never counts down below zero', () => {
    expect(mergeDepartures([nowS - 20], [], now)[0]).toEqual({ at: 1080, wait: 0, live: true })
  })
})
