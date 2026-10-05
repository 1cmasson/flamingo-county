import { describe, it, expect } from 'vitest'
import { ETA_SCHEDULE, arrivalsFrom, feedHealthy, snapshotFrom, towardAt, type Feed } from '@/lib/live'
import { TRANSIT, etaIdsFor, towardName } from '@/lib/transit'

/** A wall-clock time in Miami. October is EDT, UTC−4. */
const miami = (iso: string) => new Date(`${iso}-04:00`)

/** A weekday Flamingo trip from ETA's real schedule, and a stop well into it. */
const [tripId, trip] = Object.entries(ETA_SCHEDULE.trips).find(
  ([, t]) => t.route === 'flamingo' && ETA_SCHEDULE.services.weekday.includes(t.service) && t.secs[0] >= 9 * 3600,
)!
const STOP_INDEX = 20
const stop = trip.stops[STOP_INDEX]
const at = (secs: number) => {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  // ETA's times carry seconds (06:00:51); keep them or the minutes drift by one.
  const sec = secs % 60
  return `2026-10-05T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function feedWith(opts: { seqIndex: number; delay: number; ts: number }): Feed {
  return {
    headerTs: opts.ts,
    vehicles: [
      { id: 'bus-1', tripId, lat: 25.86, lng: -80.3, bearing: 90, seq: trip.seq0 + opts.seqIndex, stopId: String(trip.stops[opts.seqIndex]), ts: opts.ts },
    ],
    delays: new Map([[tripId, [{ seq: trip.seq0 + opts.seqIndex, delay: opts.delay }]]]),
  }
}

describe('arrivalsFrom — next bus = schedule + live delay', () => {
  it('adds a running bus’s delay to its scheduled time at the stop', () => {
    // Ten minutes before the bus is due at the stop, with the bus 5 stops back
    // and running 6 minutes late.
    const now = miami(at(trip.secs[STOP_INDEX] - 600))
    const feed = feedWith({ seqIndex: STOP_INDEX - 5, delay: 360, ts: now.getTime() / 1000 })
    const first = arrivalsFrom(feed, [stop], now).find((a) => a.live)
    expect(first).toMatchObject({ route: 'flamingo', minutes: 16, live: true, delayMin: 6 })
  })

  it('ignores a bus that has already passed the stop', () => {
    const now = miami(at(trip.secs[STOP_INDEX] + 120))
    const feed = feedWith({ seqIndex: STOP_INDEX + 3, delay: 0, ts: now.getTime() / 1000 })
    const arrivals = arrivalsFrom(feed, [stop], now)
    expect(arrivals.every((a) => !(a.live && a.minutes < 1))).toBe(true)
  })

  it('treats a bus that has gone quiet for over five minutes as not on the road', () => {
    const now = miami(at(trip.secs[STOP_INDEX] - 600))
    const feed = feedWith({ seqIndex: STOP_INDEX - 5, delay: 0, ts: now.getTime() / 1000 - 900 })
    expect(arrivalsFrom(feed, [stop], now).some((a) => a.live)).toBe(false)
    expect(snapshotFrom(feed, now.getTime()).vehicles).toEqual([])
  })

  it('falls back to the timetable with no feed, marked as scheduled', () => {
    const now = miami(at(trip.secs[0] - 300))
    const arrivals = arrivalsFrom(null, [stop], now)
    expect(arrivals.length).toBeGreaterThan(0)
    expect(arrivals.every((a) => !a.live)).toBe(true)
  })

  it('promises nothing on a Sunday', () => {
    expect(arrivalsFrom(null, [stop], miami('2026-10-11T12:00:00'))).toEqual([])
  })
})

describe('snapshotFrom', () => {
  it('names the line from ETA’s trip and places the bus on our strip', () => {
    const now = Date.now()
    const station = TRANSIT.routes.find((r) => r.slug === 'flamingo')!.stations[30]
    const [lat, lng] = station.points[0]
    const feed: Feed = {
      headerTs: now / 1000,
      vehicles: [{ id: 'x', tripId, lat, lng, bearing: 0, seq: trip.seq0, stopId: '', ts: now / 1000 }],
      delays: new Map(),
    }
    const [v] = snapshotFrom(feed, now).vehicles
    expect(v.route).toBe('flamingo')
    expect(v.stationId).toBe(station.id)
  })

  it('reports no live data when the feed is down', () => {
    expect(snapshotFrom(null, Date.now())).toEqual({ ok: false, updatedAt: null, vehicles: [] })
  })
})

describe('our stops ↔ ETA’s stops', () => {
  it('links the poles beside every Hialeah listing', () => {
    const names = ['Palm Ave & E 41 St', 'E 8 Ave & E 41 St', 'W 29 St & W 5 Ave', 'W 49 St & 8 Ave Hialeah', 'W 29 St & W 4 Ave', 'W 49 St & W 12 Ave']
    for (const name of names) {
      const station = TRANSIT.routes.flatMap((r) => r.stations).find((s) => s.names.includes(name))!
      expect(etaIdsFor(station).length, name).toBeGreaterThan(0)
    }
  })
})

describe('feed health — never a confident "no bus" from bad data', () => {
  const now = miami(at(trip.secs[STOP_INDEX] - 600))
  const t = now.getTime() / 1000

  it('distrusts a frozen feed, however fresh its buses claim to be', () => {
    const feed = { ...feedWith({ seqIndex: STOP_INDEX - 5, delay: 0, ts: t }), headerTs: t - 900 }
    expect(feedHealthy(feed, now.getTime())).toBe(false)
    expect(snapshotFrom(feed, now.getTime()).ok).toBe(false)
  })

  it('distrusts buses on trips our schedule has never heard of (ETA republished)', () => {
    const feed: Feed = {
      headerTs: t,
      vehicles: ['a', 'b', 'c'].map((id) => ({ id, tripId: `new-${id}`, lat: 25.86, lng: -80.3, bearing: 0, seq: 3, stopId: '1', ts: t })),
      delays: new Map(),
    }
    expect(snapshotFrom(feed, now.getTime()).ok).toBe(false)
  })

  it('distrusts an empty feed during service hours', () => {
    expect(feedHealthy({ headerTs: t, vehicles: [], delays: new Map() }, now.getTime())).toBe(false)
  })

  it('with the feed down, still offers a bus that left before now — as scheduled', () => {
    // Trip already under way, due at the stop in ten minutes: a healthy feed
    // would know where it is; without one, the timetable is the best answer.
    const arrivals = arrivalsFrom(null, [stop], now)
    expect(arrivals.some((a) => !a.live && a.minutes === 10)).toBe(true)
  })

  it('names the pole each arrival is at', () => {
    const feed = feedWith({ seqIndex: STOP_INDEX - 5, delay: 0, ts: t })
    const live = arrivalsFrom(feed, [stop], now).find((a) => a.live)!
    expect(live.stop).toBe(ETA_SCHEDULE.stops[String(stop)])
  })
})

describe('which way a bus is going', () => {
  // ETA's trips are loops, so direction comes from the next of our stations
  // the trip reaches, not from where the trip ends.
  for (const route of TRANSIT.routes) {
    const first = route.stations[0]
    const last = route.stations.at(-1)!
    const visits = (station: typeof first) =>
      Object.values(ETA_SCHEDULE.trips)
        .filter((t) => t.route === route.slug)
        .flatMap((t) => t.stops.flatMap((id, i) => ((station.eta ?? []).includes(id) ? [towardAt(t, i)] : [])))

    it(`${route.name}: leaving its first stop, every bus heads for its end`, () => {
      const seen = visits(first)
      expect(seen.length).toBeGreaterThan(0)
      expect(new Set(seen)).toEqual(new Set(['end']))
    })

    it(`${route.name}: at its last stop, the only way left is back`, () => {
      const seen = visits(last)
      if (!seen.length) return // the end pole isn't one ETA serves
      expect(new Set(seen)).toEqual(new Set(['start']))
    })
  }

  it('names each direction by a place a rider knows, translated when asked', () => {
    const flamingo = TRANSIT.routes.find((r) => r.slug === 'flamingo')!
    expect(towardName(flamingo, 'end')).toBe('City Hall')
    expect(towardName(flamingo, 'end', { 'City Hall': 'la Alcaldía' })).toBe('la Alcaldía')
  })

  it('every arrival carries its direction and pole; a live one names its bus', () => {
    const now = miami(at(trip.secs[STOP_INDEX] - 600))
    const feed = feedWith({ seqIndex: STOP_INDEX - 5, delay: 0, ts: now.getTime() / 1000 })
    const arrivals = arrivalsFrom(feed, [stop], now, 8)
    expect(arrivals.length).toBeGreaterThan(0)
    for (const a of arrivals) {
      expect(a.stopId).toBe(stop)
      expect(['start', 'end']).toContain(a.toward)
    }
    expect(arrivals.find((a) => a.live)?.vehicleId).toBe('bus-1')
    expect(arrivals.filter((a) => !a.live).every((a) => a.vehicleId === null)).toBe(true)
  })
})
