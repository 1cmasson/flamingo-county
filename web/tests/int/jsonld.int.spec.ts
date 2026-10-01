import { describe, expect, it } from 'vitest'
import { clean, titleCase, eventStart, listingJsonLd, miamiOffset, postalAddress } from '../../src/lib/jsonld'
import type { Listing } from '../../src/payload-types'

describe('postalAddress', () => {
  it('splits the importer shape', () => {
    expect(postalAddress('6743 Main St, Miami Lakes, FL, 33014')).toMatchObject({
      streetAddress: '6743 Main St',
      addressLocality: 'Miami Lakes',
      addressRegion: 'FL',
      postalCode: '33014',
    })
  })
  it('keeps unparseable text whole and adds nothing invented', () => {
    const a = postalAddress('SW 8th St at 12th Ave')!
    expect(a.streetAddress).toBe('SW 8th St at 12th Ave')
    expect(a).not.toHaveProperty('postalCode')
  })
  it('is absent for empty input', () => {
    expect(postalAddress('  ')).toBeUndefined()
    expect(postalAddress(null)).toBeUndefined()
  })
})

describe('Miami time', () => {
  it('uses EDT in summer and EST in winter', () => {
    expect(miamiOffset('2026-07-04')).toBe('-04:00')
    expect(miamiOffset('2026-01-15')).toBe('-05:00')
  })
  it('builds an ISO start, date-only when no clock time is known', () => {
    expect(eventStart({ date: '2026-07-04', startTime: '21:00' })).toBe('2026-07-04T21:00:00-04:00')
    expect(eventStart({ date: '2026-07-04', startTime: null })).toBe('2026-07-04')
  })
})

describe('listingJsonLd', () => {
  const base = {
    id: 1,
    slug: 'x',
    name: 'X Cafe',
    city: { id: 1, slug: 'hialeah', name: 'Hialeah' },
    category: { id: 1, slug: 'food', label: 'Restaurant' },
  } as unknown as Listing

  it('emits only fields the record holds — no rating, hours or price', () => {
    const ld = listingJsonLd('en', { ...base, rating: 4.9, reviews: 300 } as Listing, 'hialeah')
    expect(ld['@type']).toBe('Restaurant')
    expect(ld).not.toHaveProperty('telephone')
    expect(ld).not.toHaveProperty('aggregateRating')
    expect(ld).not.toHaveProperty('openingHoursSpecification')
    expect(ld).not.toHaveProperty('priceRange')
  })
  const hours = {
    openingHours: [
      { days: ['Monday', 'Tuesday'], opens: '11:30', closes: '22:00' },
      { days: ['Friday'], opens: '17:00', closes: '02:00' },
    ],
  }
  it('emits structured hours at high confidence, past-midnight closes intact', () => {
    const ld = listingJsonLd(
      'en',
      { ...base, detail: { ...hours, hoursConfidence: 'high' } } as Listing,
      'hialeah',
    )
    expect(ld.openingHoursSpecification).toEqual([
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday'],
        opens: '11:30',
        closes: '22:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Friday'],
        opens: '17:00',
        closes: '02:00',
      },
    ])
  })
  it('withholds hours below high confidence, or with no confidence recorded', () => {
    for (const hoursConfidence of ['medium', 'low', 'none', null] as const) {
      const ld = listingJsonLd(
        'en',
        { ...base, detail: { ...hours, hoursConfidence } } as Listing,
        'hialeah',
      )
      expect(ld).not.toHaveProperty('openingHoursSpecification')
    }
  })
  it('includes phone and cuisine when present', () => {
    const ld = listingJsonLd(
      'es',
      { ...base, detail: { phone: '(305) 555-0100' }, research: { cuisine: ['Cuban'] } } as Listing,
      'hialeah',
    )
    expect(ld.telephone).toBe('(305) 555-0100')
    expect(ld.servesCuisine).toEqual(['Cuban'])
  })
})

describe('titleCase', () => {
  it('turns display caps into names', () => {
    expect(titleCase('MIAMI LAKES')).toBe('Miami Lakes')
    expect(titleCase('LITTLE HAVANA')).toBe('Little Havana')
    expect(titleCase(null)).toBeUndefined()
  })
})

describe('clean', () => {
  it('drops empties', () => {
    expect(clean({ a: '', b: null, c: undefined, d: [], e: 0, f: 'x' })).toEqual({ e: 0, f: 'x' })
  })
})
