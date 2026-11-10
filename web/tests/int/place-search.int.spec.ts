import { describe, expect, it } from 'vitest'
import { toPlaces, type Feature } from '../../src/lib/placeSearch'

// Photon's real answer for "Milander Park Hialeah" (Nov 2026): an old point
// among the houses on W 30 St first, the park's outline at 4700 Palm Ave second.
const milanderPoint: Feature = {
  geometry: { coordinates: [-80.2850504, 25.8489855] },
  properties: { osm_type: 'N', osm_id: 358730252, osm_key: 'leisure', name: 'Milander Park', city: 'Hialeah' },
}
const milanderOutline: Feature = {
  geometry: { coordinates: [-80.2849297, 25.865484] },
  properties: { osm_type: 'W', osm_id: 236099865, osm_key: 'leisure', name: 'Milander Park', city: 'Hialeah' },
}
const store = (osm_type: string, osm_id: number, lng: number): Feature => ({
  geometry: { coordinates: [lng, 25.87] },
  properties: { osm_type, osm_id, osm_key: 'shop', name: 'Publix', street: 'W 49th St', housenumber: '1490', city: 'Hialeah' },
})

describe('place search results', () => {
  it('sends a place found as a point and an outline to the outline', () => {
    const places = toPlaces([milanderPoint, milanderOutline], 8)
    expect(places).toHaveLength(1)
    expect(places[0].at).toEqual([25.865484, -80.2849297])
    expect(places[0].id).toBe('oW236099865')
  })

  it('keeps the outline when it comes first', () => {
    const places = toPlaces([milanderOutline, milanderPoint], 8)
    expect(places).toHaveLength(1)
    expect(places[0].at[0]).toBe(25.865484)
  })

  it('keeps the order, and still swaps an outline found past the limit', () => {
    const places = toPlaces([milanderPoint, store('N', 1, -80.3), milanderOutline], 2)
    expect(places.map((p) => p.name)).toEqual(['Milander Park', 'Publix'])
    expect(places[0].at[0]).toBe(25.865484)
  })

  it('keeps two different places with the same name', () => {
    const other: Feature = { ...milanderOutline, properties: { ...milanderOutline.properties, city: 'Miami Lakes' } }
    expect(toPlaces([milanderPoint, other], 8)).toHaveLength(2)
  })

  it('skips roads and stops', () => {
    const road: Feature = { geometry: { coordinates: [-80.28, 25.86] }, properties: { osm_key: 'highway', name: 'Palm Avenue' } }
    expect(toPlaces([road, store('W', 2, -80.3)], 8).map((p) => p.name)).toEqual(['Publix'])
  })
})
