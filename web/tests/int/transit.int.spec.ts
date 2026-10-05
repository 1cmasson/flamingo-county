import { describe, it, expect } from 'vitest'
import {
  TRANSIT,
  diagram,
  formatClock,
  formatHeadway,
  getRoute,
  headwayToday,
  nearestStops,
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
    // Drawn at the outbound station, but the pole a rider walks to is the one
    // across Palm Ave — and that is the name the panel must print.
    expect(first.station.name).toBe('Palm Ave & W 41 St')
    expect(first.stopName).toBe('Palm Ave & E 41 St')
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
