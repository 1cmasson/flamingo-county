import { describe, expect, it } from 'vitest'

import { rankSpots, SPOT_MAX_METERS } from '@/lib/spotRank'
import type { LatLng } from '@/lib/transit'

/**
 * "Spots near you": closest first, at most three, and nothing past the cap, so
 * an address far from every listing gets no card rather than a 40 km "nearby".
 */
const home: LatLng = [25.8576, -80.2781] // Hialeah, near Palm Ave and W 49 St
const north = (m: number): LatLng => [home[0] + m / 111_320, home[1]]

describe('rankSpots', () => {
  it('sorts by distance, caps the count, and skips what was never placed', () => {
    const r = rankSpots(
      [
        { item: 'far', at: north(3000) },
        { item: 'near', at: north(200) },
        { item: 'unplaced', at: null },
        { item: 'mid', at: north(900) },
        { item: 'next', at: north(1500) },
      ],
      home,
    )
    expect(r.map((x) => x.item)).toEqual(['near', 'mid', 'next'])
    expect(r[0].meters).toBeGreaterThan(190)
    expect(r[0].meters).toBeLessThan(210)
    expect(r[0].walk).toBeGreaterThanOrEqual(1)
  })

  it('shows nothing past the cap', () => {
    expect(rankSpots([{ item: 'homestead', at: north(SPOT_MAX_METERS + 50) }], home)).toEqual([])
  })
})
