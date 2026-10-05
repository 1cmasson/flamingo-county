import { describe, it, expect } from 'vitest'
import { ETA_SCHEDULE, arrivalsFrom, snapshotFrom, type Feed } from '@/lib/live'
import { TRANSIT, etaIdsFor } from '@/lib/transit'

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
    expect(first).toEqual({ route: 'flamingo', minutes: 16, live: true, delayMin: 6 })
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
