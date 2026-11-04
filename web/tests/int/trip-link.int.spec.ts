import { describe, expect, it } from 'vitest'
import { pickByBuses, readTripLink, tripLinkPath } from '../../src/lib/tripLink'

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
})
