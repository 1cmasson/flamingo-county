import { describe, it, expect } from 'vitest'
import {
  COUNTY,
  COUNTY_SLUGS,
  allNight,
  formatBusTime,
  getCountyRoute,
  lineHref,
  lineLabel,
  nearestCountyStop,
  rankTransfers,
  routeEnds,
  routeName,
  routeNameInline,
  routeVia,
  scheduleCurrent,
  typicalHeadway,
} from '@/lib/county'
import { busCopy } from '@/lib/busCopy'
import { keyStops } from '@/components/Bus'

describe('county.json — every route', () => {
  it('has a page for every route in the feed but Hialeah’s own two', () => {
    expect(COUNTY.routes.length).toBeGreaterThan(100)
    expect(new Set(COUNTY_SLUGS).size).toBe(COUNTY_SLUGS.length)
    for (const slug of ['metrorail', 'metromover-inner', 'metromover-outer', 'mia-mover', '9', '77'])
      expect(COUNTY_SLUGS).toContain(slug)
    expect(COUNTY_SLUGS).not.toContain('hiafla')
    for (const r of COUNTY.routes) {
      expect(r.directions.length).toBeGreaterThan(0)
      for (const d of r.directions) {
        expect(d.stations.length).toBeGreaterThan(1)
        expect(d.stations[0].min).toBe(0)
      }
    }
  })

  it('marks what each costs: Metromover and the City of Miami trolleys free, Metrobus and Metrorail paid', () => {
    expect(getCountyRoute('metromover-inner')!.fare).toBe('free')
    expect(getCountyRoute('mia-mover')!.fare).toBe('free')
    expect(getCountyRoute('miawynw')!.fare).toBe('free')
    expect(getCountyRoute('metrorail')!.fare).toBe('paid')
    expect(getCountyRoute('9')!.fare).toBe('paid')
    // Another city's trolley stays unmarked until its own page is checked.
    expect(getCountyRoute('dloop1')!.fare).toBeNull()
  })

  it('gives Metrorail both lines, each way', () => {
    const rail = getCountyRoute('metrorail')!
    expect(rail.directions.map((d) => d.id).sort()).toEqual([
      '0-green',
      '0-orange',
      '1-green',
      '1-orange',
    ])
    const airport = rail.directions.find((d) => d.id === '1-orange')!
    expect(airport.stations.some((s) => /Airport/.test(s.name))).toBe(true)
    expect(routeEnds(rail)).toEqual(['Palmetto Station / Airport Station', 'Dadeland South'])
    expect(routeName(rail, 'es')).toBe('Metrorail')
  })

  it('has the featured routes, each with two directions of stops', () => {
    expect(COUNTY.routes.filter((r) => r.featured).map((r) => r.slug).sort()).toEqual([
      '54',
      '37',
      '42',
      '183',
      '32',
      '27',
      '17',
      '8',
      '11',
      'little-havana-trolley',
    ].sort())
    for (const r of COUNTY.routes.filter((x) => x.featured)) {
      expect(r.directions).toHaveLength(2)
      for (const d of r.directions) {
        expect(d.stations.length).toBeGreaterThan(10)
        expect(d.stations[0].min).toBe(0)
        // Ride minutes only grow along a direction.
        d.stations.forEach(
          (s, i) => i && expect(s.min).toBeGreaterThanOrEqual(d.stations[i - 1].min),
        )
      }
    }
  })

  it('names Metrorail at the stations where it meets a route', () => {
    const r54 = getCountyRoute('54')!
    const brownsville = r54.directions[0].stations.find((s) => /Brownsville/.test(s.name))!
    expect(brownsville.transfers.map((t) => lineLabel(t, 'en'))).toContain('Metrorail')
  })

  it('returns null for a route it has no page for', () => {
    expect(getCountyRoute('flamingo')).toBeNull()
  })
})

describe('the schedule', () => {
  it('stops being quoted once its end date passes', () => {
    const r = getCountyRoute('54')!
    expect(scheduleCurrent(r, new Date(`${r.serviceEnds}T12:00:00-05:00`))).toBe(true)
    expect(scheduleCurrent(r, new Date('2099-01-01T12:00:00-05:00'))).toBe(false)
  })

  it('writes times past midnight as the next morning', () => {
    expect(formatBusTime(25 * 60 + 10, 'en')).toBe('1:10 AM')
    expect(formatBusTime(5 * 60 + 19, 'es')).toBe('5:19 a. m.')
  })

  it('calls a route that never stops "all night"', () => {
    expect(
      allNight({
        trips: 100,
        first: 258,
        last: 1687,
        headway: { morning: 10, midday: 10, evening: 15 },
      }),
    ).toBe(true)
    expect(
      allNight({
        trips: 37,
        first: 319,
        last: 1430,
        headway: { morning: 31, midday: 29, evening: 33 },
      }),
    ).toBe(false)
  })

  it('uses the midday gap, then the rush hour one', () => {
    expect(
      typicalHeadway({
        trips: 1,
        first: 0,
        last: 0,
        headway: { morning: 20, midday: 30, evening: null },
      }),
    ).toBe(30)
    expect(
      typicalHeadway({
        trips: 1,
        first: 0,
        last: 0,
        headway: { morning: 20, midday: null, evening: null },
      }),
    ).toBe(20)
  })
})

describe('names and links', () => {
  it('says the route the way each language does', () => {
    const r = getCountyRoute('54')!
    expect(routeName(r, 'en')).toBe('Route 54')
    expect(routeNameInline(r, 'es')).toBe('la Ruta 54')
    expect(routeVia(r, 'es')).toBe('NW 54 St y W 21 St')
    expect(routeVia(getCountyRoute('little-havana-trolley')!, 'es')).toBe('la Pequeña Habana')
    expect(routeNameInline(getCountyRoute('little-havana-trolley')!, 'es')).toBe(
      'el Trolley de la Pequeña Habana',
    )
  })

  it('keeps Spanish contractions right with a trolley', () => {
    const c = busCopy('es')
    expect(c.scheduleCaption('el Trolley de la Pequeña Habana')).toBe(
      'Horario del Trolley de la Pequeña Habana, por día',
    )
  })

  it('links the lines the site has pages for, and only those', () => {
    expect(lineHref('HIAMAR', 'es')).toBe('/es/bus/marlin')
    expect(lineHref('37', 'en')).toBe('/en/bus/37')
    expect(lineHref('MIAHAVA', 'en')).toBe('/en/bus/little-havana-trolley')
    expect(lineHref('9', 'en')).toBe('/en/bus/9')
    expect(lineHref('2600', 'es')).toBe('/es/bus/metrorail')
    expect(lineHref('NOPE', 'en')).toBeNull()
  })

  it('puts Metrorail first and folds the rest past six', () => {
    const { shown, more } = rankTransfers(['9', '10', '16', '2600', '37', '3', '93', '95'])
    expect(lineLabel(shown[0], 'en')).toBe('Metrorail')
    expect(shown[1]).toBe('37')
    expect(shown).toHaveLength(6)
    expect(more).toBe(2)
  })

  it('reads the two ends off the head signs', () => {
    const [a, z] = routeEnds(getCountyRoute('8')!)
    expect([a, z]).toContain('Brickell Station')
  })
})

describe('headways', () => {
  // The featured routes run all day; an express (301, 837) bunches its buses at rush hour.
  it('never claims a bus more often than the day’s trips allow', () => {
    for (const r of COUNTY.routes.filter((x) => x.featured)) {
      for (const d of r.directions) {
        for (const day of Object.values(d.schedule)) {
          if (!day) continue
          const average = (day.last - day.first) / day.trips
          for (const gap of Object.values(day.headway))
            if (gap) expect(gap).toBeGreaterThanOrEqual(average / 2)
        }
      }
    }
  })
})

describe('stops', () => {
  it('keeps the ends and every timed stop on the short list', () => {
    const d = getCountyRoute('54')!.directions[0]
    const key = keyStops(d)
    expect(key[0]).toBe(d.stations[0])
    expect(key[key.length - 1]).toBe(d.stations[d.stations.length - 1])
    expect(key.length).toBeLessThan(d.stations.length)
    for (const s of d.stations.filter((s) => s.timepoint)) expect(key).toContain(s)
  })

  it('finds the nearest stop within a walk, and nothing beyond it', () => {
    const r = getCountyRoute('54')!
    const stop = r.directions[0].stations[5]
    expect(nearestCountyStop(r, stop.at)?.station.at).toEqual(stop.at)
    expect(nearestCountyStop(r, [25.0, -80.0])).toBeNull()
  })
})
