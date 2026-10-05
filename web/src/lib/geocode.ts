import type { LatLng } from './transit'

/**
 * Street address → coordinates, via the US Census Bureau's geocoder (free, no
 * key, US addresses only — which is all this site has).
 *
 * Runtime, not stored: thirteen listings don't justify a schema change, a
 * migration, and thirteen owner taps to backfill a derived value. The cost is
 * a lookup per address per server process, held in memory below.
 *
 * Two refusals keep a bad answer off the page:
 * - **No street number, no lookup.** "Hialeah, FL" would geocode to the middle
 *   of town and print a confident "1 min walk" to a bus stop the business may
 *   be miles from.
 * - **A failure is not kept.** A timeout means "ask again later", not "this
 *   address has no location" — but "later" is five minutes, not the next
 *   request. The hub and route pages await every listing's lookup, so an
 *   outage that was retried per request would add the full timeout to each
 *   of those pages for as long as it lasted.
 */
const cache = new Map<string, Promise<GeocodeHit | null>>()

const ENDPOINT = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'
const TIMEOUT_MS = 3500
const RETRY_AFTER_MS = 5 * 60 * 1000

export function hasStreetNumber(address: string): boolean {
  return /^\s*\d+[A-Za-z]?\s+\S/.test(address)
}

export type GeocodeHit = { at: LatLng; matched: string }

/**
 * Listings and visitors share this cache, and visitors can type anything, so it
 * is capped: past the limit the oldest entry goes. Map iterates in insertion
 * order, which makes "oldest" the first key.
 */
const MAX_ENTRIES = 500

export async function geocode(address: string | null | undefined): Promise<LatLng | null> {
  return (await geocodeDetailed(address))?.at ?? null
}

/** Same lookup, plus the address the Census matched — for "showing results for…". */
export function geocodeDetailed(address: string | null | undefined): Promise<GeocodeHit | null> {
  const key = (address ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!key || !hasStreetNumber(key)) return Promise.resolve(null)
  const hit = cache.get(key)
  if (hit) return hit

  const p = (async () => {
    const url = `${ENDPOINT}?${new URLSearchParams({ address: key, benchmark: 'Public_AR_Current', format: 'json' })}`
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
    if (!res.ok) throw new Error(`census ${res.status}`)
    const json = (await res.json()) as {
      result?: { addressMatches?: { matchedAddress: string; coordinates: { x: number; y: number } }[] }
    }
    const m = json.result?.addressMatches?.[0]
    // An empty match list is a real answer, so it is cached as null.
    return m ? { at: [m.coordinates.y, m.coordinates.x] as LatLng, matched: m.matchedAddress } : null
  })().catch(() => {
    setTimeout(() => cache.delete(key), RETRY_AFTER_MS).unref?.()
    return null
  })
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!)
  cache.set(key, p)
  return p
}
