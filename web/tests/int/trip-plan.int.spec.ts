import { describe, it, expect } from 'vitest'
import {
  nearbyRoutes,
  planTrips,
  tripProgress,
  slicePath,
  transitDirectionsHref,
  type Network,
} from '@/lib/tripPlan'

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
    const [leg] = trips[0].legs
    expect(leg.slug).toBe('A')
    expect(leg.dir).toBe('0')
    expect(leg.board.index).toBe(0)
    expect(leg.alight.index).toBe(8)
    expect(leg.ride).toBe(16)
  })

  it('rides south when the destination is south', () => {
    const { trips } = planTrips(net, [lat(8), -80.3], [lat(1), -80.3])
    expect(trips[0].legs[0].dir).toBe('1')
  })

  it('offers only routes within a walk of both ends, one trip per route', () => {
    const { trips } = planTrips(net, [lat(0), -80.3], [lat(9), -80.3])
    expect(trips.map((t) => t.legs.map((l) => l.slug).join('>'))).toEqual(['A'])
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

  it('lists the routes within a walk, nearest first, with a stop each way', () => {
    const near = nearbyRoutes(net, [lat(4), -80.299])
    expect(near.map((r) => r.slug)).toEqual(['A'])
    expect(near[0].dirs.map((d) => d.dir)).toEqual(['0', '1'])
    expect(near[0].dirs[0].index).toBe(4)
    // Between both lines (~2.5 km each way from either): none in a walk.
    expect(nearbyRoutes(net, [lat(4), -80.275], 1300)).toEqual([])
  })

  it('follows the visitor along the ride', () => {
    const t = planTrips(net, [lat(0), -80.3005], [lat(8), -80.2995]).trips[0]
    expect(tripProgress(t, [lat(0), -80.3])).toEqual({ kind: 'atStop', leg: 1 })
    expect(tripProgress(t, [lat(3), -80.3])).toEqual({ kind: 'riding', leg: 1, left: 5 })
    expect(tripProgress(t, [lat(8), -80.3])).toEqual({ kind: 'getOff', leg: 1 })
    expect(tripProgress(t, [lat(4), -80.29])).toBeNull()
  })

  it('changes buses where two lines cross, when no one bus goes there', () => {
    // C runs east along lat(8), from A's line to B's, a stop every ~500 m.
    const east = Array.from({ length: 11 }, (_, k) => ({
      id: `C${k}`,
      name: `C ${k}`,
      at: [lat(8), -80.3 + k * 0.005] as [number, number],
      min: k * 2,
    }))
    const withC: Network = {
      routes: [
        ...net.routes,
        {
          slug: 'C',
          number: 'C',
          short: 'C',
          kind: 'bus',
          serviceEnds: null,
          directions: [{ id: '0', toward: 'East', stations: east, path: east.map((s) => s.at) }],
        },
      ],
    }
    // From A's first stop to the middle of C: A north, change, C east.
    const plan = planTrips(withC, [lat(0), -80.3], [lat(8) + 0.0005, -80.275])
    const t = plan.trips[0]
    const [a, c] = t.legs
    expect(t.legs).toHaveLength(2)
    expect(a.slug).toBe('A')
    expect(c.slug).toBe('C')
    expect(a.alight.index).toBe(8)
    expect(c.board.index).toBe(0)
    expect(c.alight.index).toBe(5)
    // On the second bus, the steps follow the second leg.
    expect(tripProgress(t, [lat(8), -80.29])).toEqual({ kind: 'riding', leg: 2, left: 3 })
  })

  it('prefers one bus to a change that saves little', () => {
    const { trips } = planTrips(net, [lat(0), -80.3005], [lat(8), -80.2995])
    expect(trips.every((t) => t.legs.length === 1)).toBe(true)
  })

  it('changes twice when it takes three rides', () => {
    // C east along lat(8) from A's line to B's, then D north from B's line further east.
    const east = Array.from({ length: 11 }, (_, k) => ({
      id: `C${k}`,
      name: `C ${k}`,
      at: [lat(8), -80.3 + k * 0.005] as [number, number],
      min: k * 2,
    }))
    const far = Array.from({ length: 10 }, (_, k) => ({
      id: `D${k}`,
      name: `D ${k}`,
      at: [lat(8) + k * 0.005, -80.25 + 0.0005] as [number, number],
      min: k * 2,
    }))
    const three: Network = {
      routes: [
        net.routes[0],
        { slug: 'C', number: 'C', short: 'C', kind: 'bus', serviceEnds: null, directions: [{ id: '0', toward: 'East', stations: east }] },
        { slug: 'D', number: 'D', short: 'D', kind: 'bus', serviceEnds: null, directions: [{ id: '0', toward: 'North', stations: far }] },
      ],
    }
    const t = planTrips(three, [lat(0), -80.3], [lat(8) + 9 * 0.005, -80.2495]).trips[0]
    expect(t.legs.map((l) => l.slug)).toEqual(['A', 'C', 'D'])
    expect(tripProgress(t, [lat(8) + 3 * 0.005, -80.2495])).toEqual({ kind: 'riding', leg: 3, left: 6 })
  })

  it('leaves out a route that isn’t running, and the wait for a rare one counts', () => {
    const closed = {
      ...net.routes[0],
      hours: { weekday: [6 * 60, 19 * 60] as [number, number], saturday: null, sunday: null },
    }
    const sunday = new Date('2026-11-08T17:00:00Z') // Sunday, noon in Miami
    const weekday = new Date('2026-11-04T17:00:00Z')
    expect(planTrips({ routes: [closed] }, [lat(0), -80.3005], [lat(8), -80.2995], 3, weekday).trips).toHaveLength(1)
    // Sunday: nothing runs, so it plans with everything (the steps say when the next comes).
    expect(planTrips({ routes: [closed] }, [lat(0), -80.3005], [lat(8), -80.2995], 3, sunday).trips).toHaveLength(1)
    // Sunday with another route running: only that one.
    const other = { ...net.routes[0], slug: 'A2', number: 'A2' }
    const plan = planTrips({ routes: [closed, other] }, [lat(0), -80.3005], [lat(8), -80.2995], 3, sunday)
    expect(plan.trips.map((t) => t.legs[0].slug)).toEqual(['A2'])
    // A route every 60 min ranks behind one every 10 that takes a minute longer.
    const slow = { ...net.routes[0], headway: { weekday: 60, saturday: 60, sunday: 60 } }
    const often = {
      ...net.routes[0],
      slug: 'F',
      number: 'F',
      headway: { weekday: 10, saturday: 10, sunday: 10 },
      directions: net.routes[0].directions.map((d) => ({ ...d, stations: d.stations.map((x) => ({ ...x, min: x.min * 1.1 })) })),
    }
    const ranked = planTrips({ routes: [slow, often] }, [lat(0), -80.3005], [lat(8), -80.2995], 3, weekday)
    expect(ranked.trips[0].legs[0].slug).toBe('F')
  })

  it('rides round a loop past its first stop', () => {
    const ring = Array.from({ length: 9 }, (_, k) => ({
      id: `L${k % 8}`,
      name: `L ${k % 8}`,
      at: [lat(0) + Math.sin((k * Math.PI) / 4) * 0.01, -80.3 + Math.cos((k * Math.PI) / 4) * 0.01] as [number, number],
      min: k * 3,
    }))
    const loopNet: Network = {
      routes: [{ slug: 'L', number: null, name: 'Loop', short: 'L', kind: 'mover', serviceEnds: null, directions: [{ id: '0', toward: 'Around', loop: true, stations: ring }] }],
    }
    // From stop 7 to stop 1: two stops on, round past stop 0 (not six stops back the long way).
    const t = planTrips(loopNet, ring[7].at, ring[1].at).trips[0]
    expect(t.legs[0].stops).toBe(2)
    expect(t.legs[0].ride).toBe(6)
  })
})
