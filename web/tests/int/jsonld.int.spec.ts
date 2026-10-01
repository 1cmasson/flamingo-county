import { describe, expect, it } from 'vitest'
import { clean, titleCase, eventJsonLd, eventStart, listingJsonLd, miamiOffset, postalAddress } from '../../src/lib/jsonld'
import type { City, Event, Listing } from '../../src/payload-types'

describe('postalAddress', () => {
  it('splits the importer shape', () => {
    expect(postalAddress('6743 Main St, Miami Lakes, FL, 33014')).toMatchObject({
      streetAddress: '6743 Main St',
      addressLocality: 'Miami Lakes',
      addressRegion: 'FL',
      postalCode: '33014',
    })
  })
  it('keeps a suite in the street, and the city before the state', () => {
    expect(postalAddress('4410 West 16th Ave., Suite 40, Hialeah, FL, 33012')).toMatchObject({
      streetAddress: '4410 West 16th Ave., Suite 40',
      addressLocality: 'Hialeah',
      postalCode: '33012',
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

describe('listing sameAs', () => {
  it('gives the bare-host website a scheme', () => {
    const ld = listingJsonLd(
      'en',
      {
        id: 1,
        slug: 'x',
        name: 'X',
        city: { id: 1, slug: 'hialeah', name: 'HIALEAH' },
        category: { id: 1, slug: 'food' },
        detail: { site: 'molinasranch.com', instagram: 'https://www.instagram.com/x/' },
      } as unknown as Listing,
      'hialeah',
    )
    expect(ld.sameAs).toEqual(['https://molinasranch.com', 'https://www.instagram.com/x/'])
  })
})

describe('eventJsonLd', () => {
  const hialeah = { id: 1, slug: 'hialeah', name: 'HIALEAH' } as unknown as City
  const club = {
    id: 9,
    slug: 'el-club-de-la-amistad',
    name: 'Club de la Amistad por un Hialeah Mejor',
    city: hialeah,
    category: { id: 3, slug: 'nonprofit' },
  } as unknown as Listing
  const gala = {
    id: 2,
    slug: 'gala',
    title: 'Friendship & Recognition Gala',
    date: '2026-10-06T12:00:00.000Z',
    startTime: '17:00',
    endTime: '22:00',
    venueType: 'place',
    place: 'Sapphire',
    placeAddress: '4410 West 16th Ave., Suite 40, Hialeah, FL, 33012',
    organizer: club,
    eventStatus: 'scheduled',
  } as unknown as Event
  const venue = { listing: null, city: hialeah, name: 'Sapphire' }

  it('gives a place venue its street address and the named organizer', () => {
    const ld = eventJsonLd('en', gala, venue) as any
    expect(ld.location.address).toMatchObject({ streetAddress: '4410 West 16th Ave., Suite 40', postalCode: '33012' })
    expect(ld.organizer).toMatchObject({ '@type': 'NGO', name: 'Club de la Amistad por un Hialeah Mejor' })
    expect(ld.organizer.url).toMatch(/\/en\/hialeah\/el-club-de-la-amistad$/)
    expect(ld.eventStatus).toBe('https://schema.org/EventScheduled')
    expect(ld.endDate).toBe('2026-10-06T22:00:00-04:00')
    expect(ld).not.toHaveProperty('offers')
  })
  it('ends a night that runs past midnight on the next day', () => {
    const ld = eventJsonLd('en', { ...gala, startTime: '21:00', endTime: '01:00' } as Event, venue)
    expect(ld.startDate).toBe('2026-10-06T21:00:00-04:00')
    expect(ld.endDate).toBe('2026-10-07T01:00:00-04:00')
  })
  it('ends a date-only festival on its last day', () => {
    const ld = eventJsonLd(
      'en',
      { ...gala, startTime: null, endTime: null, endDate: '2026-10-08T12:00:00.000Z' } as Event,
      venue,
    )
    expect(ld.startDate).toBe('2026-10-06')
    expect(ld.endDate).toBe('2026-10-08')
  })
  it('says cancelled when it is', () => {
    const ld = eventJsonLd('en', { ...gala, eventStatus: 'cancelled' } as Event, venue)
    expect(ld.eventStatus).toBe('https://schema.org/EventCancelled')
  })
  it('falls back to a named organizer, then to the venue listing', () => {
    const named = eventJsonLd(
      'en',
      { ...gala, organizer: null, organizerName: 'City of Hialeah', organizerUrl: 'https://www.hialeahfl.gov' } as Event,
      venue,
    ) as any
    expect(named.organizer).toEqual({ '@type': 'Organization', name: 'City of Hialeah', url: 'https://www.hialeahfl.gov' })
    const atVenue = eventJsonLd(
      'en',
      { ...gala, organizer: null, venueType: 'listing' } as Event,
      { listing: club, city: hialeah, name: club.name },
    ) as any
    expect(atVenue.organizer.name).toBe(club.name)
  })
})
