import { describe, it, expect } from 'vitest'
import {
  TRANSIT,
  diagram,
  formatClock,
  formatHeadway,
  getRoute,
  headwayToday,
  nearestServing,
  nearestStops,
  rideBetween,
  serviceStatus,
  walkMinutes,
} from '@/lib/transit'
import { hasStreetNumber } from '@/lib/geocode'

/** A wall-clock time in Miami. October is EDT, UTC−4. */
const miami = (iso: string) => new Date(`${iso}-04:00`)

describe('serviceStatus — the city’s hours, on Miami’s clock', () => {
  it('is running on a weekday afternoon', () => {
    expect(serviceStatus(miami('2026-10-07T14:00:00'))).toEqual({ state: 'running', closes: 19 * 60 + 30 })
  })

  it('says “starts at 6” before dawn on a weekday', () => {
    expect(serviceStatus(miami('2026-10-07T05:10:00'))).toEqual({ state: 'later', opens: 360, day: 'today' })
  })

  it('stops at 7:30 PM, not at the feed’s 8:45 PM', () => {
    expect(serviceStatus(miami('2026-10-07T19:45:00'))).toEqual({ state: 'later', opens: 360, day: 'tomorrow' })
  })

  it('runs the short Saturday and sends Friday night to Saturday at 9', () => {
    expect(serviceStatus(miami('2026-10-09T21:00:00'))).toEqual({ state: 'later', opens: 540, day: 'tomorrow' })
    expect(serviceStatus(miami('2026-10-10T15:00:00'))).toEqual({ state: 'running', closes: 15 * 60 + 30 })
  })

  it('never claims Sunday service — the feed runs Marlin on Sundays, the city does not', () => {
    expect(serviceStatus(miami('2026-10-10T16:00:00'))).toEqual({ state: 'later', opens: 360, day: 'monday' })
    expect(serviceStatus(miami('2026-10-11T12:00:00'))).toEqual({ state: 'later', opens: 360, day: 'tomorrow' })
  })

  it('uses Miami’s date, not UTC’s: 9 PM Saturday is already Sunday in UTC', () => {
    // 2026-10-11T01:00Z is Saturday 9 PM in Miami.
    expect(serviceStatus(new Date('2026-10-11T01:00:00Z')).state).toBe('later')
    expect(serviceStatus(new Date('2026-10-11T01:00:00Z'))).toMatchObject({ day: 'monday' })
  })
})

describe('headwayToday', () => {
  const flamingo = getRoute('flamingo')!

  it('quotes a frequency on service days and none on Sunday', () => {
    expect(headwayToday(flamingo, miami('2026-10-07T12:00:00'))).toBe(flamingo.headwayMin.weekday)
    expect(headwayToday(flamingo, miami('2026-10-11T12:00:00'))).toBeNull()
  })

  it('stops quoting once the feed’s service period has ended', () => {
    const after = new Date(`${TRANSIT.source.serviceEnds}T12:00:00-05:00`)
    after.setUTCDate(after.getUTCDate() + 2)
    expect(headwayToday(flamingo, after)).toBeNull()
  })
})

describe('formatting', () => {
  it('writes clock times the way each language does', () => {
    expect(formatClock(19 * 60 + 30, 'en')).toBe('7:30 PM')
    expect(formatClock(360, 'en')).toBe('6 AM')
    expect(formatClock(19 * 60 + 30, 'es')).toBe('7:30 p. m.')
    expect(formatClock(12 * 60, 'en')).toBe('12 PM')
  })

  it('turns long gaps into hours', () => {
    expect(formatHeadway(40, 'en')).toBe('every ~40 min')
    expect(formatHeadway(110, 'en')).toBe('every ~2 hours')
    expect(formatHeadway(95, 'es')).toBe('cada ~1.5 horas')
  })

  it('never promises a zero-minute walk', () => {
    expect(walkMinutes(0)).toBe(1)
    expect(walkMinutes(400)).toBe(7)
  })
})

describe('the generated data', () => {
  it('has both lines, each with a Metrorail transfer at Hialeah', () => {
    expect(TRANSIT.routes.map((r) => r.slug)).toEqual(['flamingo', 'marlin'])
    for (const r of TRANSIT.routes) {
      expect(r.stations.length).toBeGreaterThan(50)
      expect(r.stations.flatMap((s) => s.transfers)).toContain('Metrorail · Hialeah')
      // Ride minutes only ever go forward along the line.
      r.stations.forEach((s, i) => i && expect(s.min).toBeGreaterThanOrEqual(r.stations[i - 1].min))
    }
  })
})

describe('nearestStops', () => {
  const casaMarin: [number, number] = [25.86032, -80.28274] // 4195 Palm Ave, per the Census geocoder

  it('finds the Marlin stop on Palm Ave a block away', () => {
    const [first] = nearestStops(casaMarin)
    expect(first.route.slug).toBe('marlin')
    // Drawn at the station named for one pole, but the pole a rider walks to
    // is its partner up the block — and that is the name the panel must print.
    expect(first.station.name).toBe('Palm Ave & E 41st St')
    expect(first.stopName).toBe('Palm Ave & E 42nd St')
    expect(walkMinutes(first.meters)).toBeLessThanOrEqual(2)
  })

  it('names the pole it measured to, never a merged partner further away', () => {
    for (const r of TRANSIT.routes) {
      for (const st of r.stations) {
        expect(st.names).toHaveLength(st.points.length)
        // Nothing folded into a station from further than the sync's limit.
        for (const p of st.points) expect(nearestStops(p, 1)[0]?.meters ?? 0).toBeLessThanOrEqual(1)
      }
    }
  })

  it('returns nothing for a place nowhere near either line', () => {
    expect(nearestStops([25.7617, -80.1918])).toEqual([]) // downtown Miami
  })
})

describe('diagram', () => {
  for (const route of TRANSIT.routes) {
    it(`${route.name}: every stop appears exactly once, in order`, () => {
      const items = diagram(route, new Set([10, 40]))
      const seen = items.flatMap((it) => (it.kind === 'stop' ? [it.index] : it.stations.map((s) => s.index)))
      expect(seen).toEqual(route.stations.map((_, i) => i))
    })

    it(`${route.name}: ends, transfers and pinned stops are never folded away`, () => {
      const pinned = new Set([10, 40])
      const shown = new Set(diagram(route, pinned).flatMap((it) => (it.kind === 'stop' ? [it.index] : [])))
      expect(shown.has(0)).toBe(true)
      expect(shown.has(route.stations.length - 1)).toBe(true)
      for (const p of pinned) expect(shown.has(p)).toBe(true)
      route.stations.forEach((s, i) => s.transfers.length && expect(shown.has(i)).toBe(true))
    })

    it(`${route.name}: no fold hides more than ~15 minutes of ride`, () => {
      for (const it of diagram(route)) {
        if (it.kind === 'gap') expect(it.minutes).toBeLessThanOrEqual(20)
      }
    })
  }
})

describe('geocoding guard', () => {
  it('refuses addresses with no street number', () => {
    expect(hasStreetNumber('Hialeah, FL')).toBe(false)
    expect(hasStreetNumber('4195 Palm Ave, Hialeah, FL, 33012')).toBe(true)
  })
})

describe('the lines as the city runs them', () => {
  const flamingo = TRANSIT.routes.find((r) => r.slug === 'flamingo')!
  const marlin = TRANSIT.routes.find((r) => r.slug === 'marlin')!

  it('include the stretches the county’s copy missed', () => {
    // Flamingo up NW 97th Ave past Bonterra to Aquabella; Marlin on Red Rd.
    expect(flamingo.stations.some((s) => /Bonterra/.test(s.name))).toBe(true)
    expect(marlin.stations.some((s) => /Red Rd & W 62nd St/.test(s.name))).toBe(true)
  })

  it('draw each line along its street path, not stop to stop', () => {
    for (const r of [flamingo, marlin]) {
      expect(r.path.length).toBeGreaterThan(50)
      // Small enough to ship in the page bundle.
      expect(r.path.length).toBeLessThan(400)
    }
  })

  it('mark the stops served one way only, and never the ends', () => {
    for (const r of [flamingo, marlin]) {
      expect(r.stations.some((s) => s.oneWay === 'start')).toBe(true)
      expect(r.stations.some((s) => s.oneWay === 'end')).toBe(true)
      expect(r.stations[0].oneWay).toBeUndefined()
      expect(r.stations.at(-1)!.oneWay).toBeUndefined()
    }
  })

  it('point a rider at a one-way stop to a pole the other way’s buses really use', () => {
    // Pole by pole: the stop across the street from a one-way stop is often
    // a pole for the same direction, and sending a rider there strands them.
    for (const r of [flamingo, marlin]) {
      for (const st of r.stations.filter((s) => s.oneWay)) {
        const way = st.oneWay === 'start' ? 'end' : 'start'
        for (const p of st.points) {
          const other = nearestServing(r, p, way)!
          expect(['both', way], `${st.name} → ${other.stopName}`).toContain(other.station.poleWays?.[other.pole])
        }
      }
    }
  })

  it('list each stop once, even where the bus rounds a block and passes it again', () => {
    for (const r of [flamingo, marlin]) {
      const ids = r.stations.map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('count a ride from a one-way stop the long way round when it has to be', () => {
    const k = flamingo.stations.findIndex((s) => s.oneWay === 'end')
    const st = flamingo.stations[k]
    // Toward the end: a later stop is a direct ride…
    const later = flamingo.stations.findIndex((s, i) => i > k && s.min > st.min)
    expect(rideBetween(flamingo, k, later)).toBe(flamingo.stations[later].min - st.min)
    // …an earlier one means riding to the end of the line and back.
    const earlier = flamingo.stations.findIndex((s) => s.min < st.min)
    expect(rideBetween(flamingo, k, earlier)).toBeGreaterThan(flamingo.rideMinutes - st.min)
  })
})
