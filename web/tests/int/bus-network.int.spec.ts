import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { networkWire, serverNetwork } from '@/lib/busNetwork'
import { planTrips } from '@/lib/tripPlan'

/**
 * The trip planner on the real network: every county route plus Hialeah's
 * free lines. Re-check after each county schedule edition (`pnpm
 * transit:network`); the trips below are ones a rider would recognize.
 */
const PLACES = {
  palm2100: [25.84106, -80.28252] as [number, number],
  // The park's grounds at 4700 Palm Ave (not the stray map pin 2 km south, PR #163).
  milander: [25.865484, -80.2849297] as [number, number],
  bayside: [25.7783, -80.1867] as [number, number],
  westland: [25.8685, -80.31732] as [number, number],
}
const WEDNESDAY_930 = new Date('2026-11-11T14:30:00Z')
const SUNDAY_NOON = new Date('2026-11-08T17:00:00Z')

describe('the bus network', () => {
  it('has every county route and Hialeah’s free lines, each marked free or not', () => {
    const net = serverNetwork()
    const bySlug = new Map(net.routes.map((r) => [r.slug, r]))
    for (const slug of ['37', '54', 'metrorail', 'metromover-inner', 'little-havana-trolley', 'flamingo', 'marlin'])
      expect(bySlug.has(slug), slug).toBe(true)
    expect(bySlug.get('flamingo')!.fare).toBe('free')
    expect(bySlug.get('metromover-outer')!.fare).toBe('free')
    expect(bySlug.get('37')!.fare).toBe('paid')
    expect(bySlug.get('metrorail')!.number).toBeNull()
    // Only the county's own copy of the free lines is left out (the city's data stands for them).
    expect(net.routes.filter((r) => r.short === 'HIAFLA')).toHaveLength(1)
    for (const r of net.routes) for (const d of r.directions) expect(d.stations.length, r.slug).toBeGreaterThan(1)
  })

  it('stays small enough for an old phone', () => {
    expect(gzipSync(JSON.stringify(networkWire())).length).toBeLessThan(200 * 1024)
  })

  it('takes one bus up Palm Ave to Milander Park', () => {
    const { trips } = planTrips(serverNetwork(), PLACES.palm2100, PLACES.milander, 3, WEDNESDAY_930)
    expect(trips[0].legs).toHaveLength(1)
    expect(['37', 'marlin', 'flamingo']).toContain(trips[0].legs[0].slug)
    expect(trips[0].total).toBeLessThan(30)
  })

  it('goes downtown from Hialeah by Metrorail', () => {
    const { trips } = planTrips(serverNetwork(), PLACES.palm2100, PLACES.bayside, 3, WEDNESDAY_930)
    expect(trips[0].legs.some((l) => l.slug === 'metrorail')).toBe(true)
    expect(trips[0].total).toBeLessThan(70)
  })

  it('never puts a Sunday trip on Hialeah’s free lines', () => {
    for (const [a, b] of [
      [PLACES.palm2100, PLACES.milander],
      [PLACES.westland, PLACES.palm2100],
    ]) {
      const { trips } = planTrips(serverNetwork(), a, b, 3, SUNDAY_NOON)
      for (const t of trips)
        expect(t.legs.some((l) => l.slug === 'flamingo' || l.slug === 'marlin')).toBe(false)
    }
  })
})
