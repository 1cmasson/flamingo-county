import { describe, it, expect } from 'vitest'
import { planTrips, slicePath, transitDirectionsHref, type Network } from '@/lib/tripPlan'

/** A made-up north–south line along one avenue, a stop every ~550 m, 2 minutes apart. */
const lat = (k: number) => 25.8 + k * 0.005
const line = (id: string, lng: number, n = 10) =>
  Array.from({ length: n }, (_, k) => ({
    id: `${id}${k}`,
    name: `${id} ${k}`,
    at: [lat(k), lng] as [number, number],
    min: k * 2,
  }))
const route = (slug: string, lng: number) => {
  const north = line(slug, lng)
  return {
    slug,
    number: slug,
    short: slug,
    kind: 'bus' as const,
    serviceEnds: null,
    directions: [
      { id: '0', toward: 'North', stations: north, path: north.map((s) => s.at) },
      {
        id: '1',
        toward: 'South',
        stations: [...north].reverse().map((s, k) => ({ ...s, id: `${s.id}s`, min: k * 2 })),
        path: [...north].reverse().map((s) => s.at),
      },
    ],
  }
}
const net: Network = { routes: [route('A', -80.3), route('B', -80.25)] }

describe('bus trip planner', () => {
  it('boards the stop near the start and gets off near the end, going the right way', () => {
    const { trips } = planTrips(net, [lat(0), -80.3005], [lat(8), -80.2995])
    expect(trips[0].slug).toBe('A')
    expect(trips[0].dir).toBe('0')
    expect(trips[0].board.index).toBe(0)
    expect(trips[0].alight.index).toBe(8)
    expect(trips[0].ride).toBe(16)
  })

  it('rides south when the destination is south', () => {
    const { trips } = planTrips(net, [lat(8), -80.3], [lat(1), -80.3])
    expect(trips[0].dir).toBe('1')
  })

  it('offers only routes within a walk of both ends, one trip per route', () => {
    const { trips } = planTrips(net, [lat(0), -80.3], [lat(9), -80.3])
    expect(trips.map((t) => t.slug)).toEqual(['A'])
  })

  it('says walk when it’s close, and when no route reaches', () => {
    expect(planTrips(net, [lat(2), -80.3], [lat(3), -80.3]).walkOnly).not.toBeNull()
    const far = planTrips(net, [lat(0), -80.5], [lat(9), -80.5])
    expect(far.trips).toEqual([])
    expect(far.walkOnly).not.toBeNull()
  })

  it('cuts the ridden part of the line, in riding order', () => {
    const path: [number, number][] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]
    expect(slicePath(path, [2.9, 0], [1.1, 0])).toEqual([
      [2.9, 0],
      [3, 0],
      [2, 0],
      [1, 0],
      [1.1, 0],
    ])
  })

  it('never puts the visitor’s location in the Google link', () => {
    expect(transitDirectionsHref([25.8, -80.3])).not.toContain('origin')
  })
})
