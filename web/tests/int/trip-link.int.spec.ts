import { describe, expect, it } from 'vitest'
import {
  hubDestQuery,
  pickByBuses,
  readHubDest,
  readTripAsk,
  readTripLink,
  tripLinkPath,
} from '../../src/lib/tripLink'

const link = {
  from: { name: 'Palm Ave & W 49 St', at: [25.8664, -80.2795] as [number, number] },
  to: { name: 'Palmetto General Hospital', at: [25.8762, -80.3266] as [number, number] },
  buses: ['37', '54'],
}

describe('trip links', () => {
  it('reads back what it writes', () => {
    const path = tripLinkPath('es', link)
    expect(path.startsWith('/es/bus/trip?')).toBe(true)
    expect(readTripLink(new URLSearchParams(path.split('?')[1]))).toEqual(link)
  })

  it('holds only the two ends: names and points, nothing else', () => {
    const q = new URLSearchParams(tripLinkPath('en', link).split('?')[1])
    expect([...q.keys()].sort()).toEqual(['a', 'ac', 'dc', 'de', 'r'])
  })

  it('turns away points outside Miami-Dade and broken values', () => {
    const q = (o: Record<string, string>) =>
      readTripLink({ de: 'A', dc: '25.8,-80.3', a: 'B', ac: '25.9,-80.2', ...o })
    expect(q({})).not.toBeNull()
    expect(q({ dc: '40.7,-74.0' })).toBeNull()
    expect(q({ ac: 'nope' })).toBeNull()
    expect(q({ de: '   ' })).toBeNull()
    expect(q({ r: '37,<script>,54' })?.buses).toEqual(['37', '54'])
  })

  it('picks the trip the link chose, or the first', () => {
    const trips = [{ slug: '54' }, { slug: '37', then: { slug: '54' } }]
    expect(pickByBuses(trips, ['37', '54'])).toBe(1)
    expect(pickByBuses(trips, ['8'])).toBe(0)
    expect(pickByBuses(trips, [])).toBe(0)
  })

  it('reads a link written by hand with names only, as an assistant writes one', () => {
    const q = new URLSearchParams('from=Hialeah+Park&to=Palmetto+General+Hospital&r=37')
    expect(readTripLink(q)).toBeNull()
    expect(readTripAsk(q)).toEqual({
      from: { name: 'Hialeah Park', at: null },
      to: { name: 'Palmetto General Hospital', at: null },
      buses: ['37'],
    })
    // The site's own keys work too, and a point that's given is kept.
    expect(readTripAsk({ de: 'A', dc: '25.8,-80.3', a: 'B' })?.from).toEqual({
      name: 'A',
      at: [25.8, -80.3],
    })
    // A point outside Miami-Dade is dropped, not trusted.
    expect(readTripAsk({ to: 'B', ac: '40.7,-74.0' })?.to).toEqual({ name: 'B', at: null })
    expect(readTripAsk({ to: 'Dadeland Mall' })?.from).toBeNull()
    expect(readTripAsk({})).toBeNull()
  })

  it('hands the hub a destination, and only a destination', () => {
    const to = { name: 'Jackson Memorial Hospital', at: [25.7917, -80.2126] as [number, number] }
    const q = new URLSearchParams(hubDestQuery(to))
    expect([...q.keys()].sort()).toEqual(['a', 'ac'])
    expect(readHubDest(q)).toEqual(to)
    expect(readHubDest({ a: 'X' })).toBeNull()
  })
})
