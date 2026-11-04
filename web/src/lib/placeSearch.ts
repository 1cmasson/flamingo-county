import type { LatLng } from './transitMath'

/**
 * "Palmetto General Hospital", "Publix 49", "farmacia": places anywhere in
 * Miami-Dade by name or kind, for the bus trip planner's "where are you
 * going?". The directory has a few dozen listings; this is the rest of the
 * county.
 *
 * Source: Photon (photon.komoot.io), a free search over OpenStreetMap data.
 * Not Google's Places: that needs a paid key, and its terms tie the results
 * to Google's own map. Photon is free and best-effort, so it's used politely:
 * - only the typed text is sent, with a fixed Miami-Dade centre and box,
 *   never the visitor's location (the browser sorts by distance itself);
 * - answers are kept in memory for a day, so a popular search is asked once;
 * - a timeout of 3 s, and any failure is simply no extra results.
 * If traffic grows past polite use, Photon can be self-hosted.
 *
 * Results are OpenStreetMap data (ODbL): the search shows «© OpenStreetMap».
 */

const ENDPOINT = 'https://photon.komoot.io/api/'
const TIMEOUT_MS = 3000
const TTL_MS = 24 * 60 * 60 * 1000
const MAX_ENTRIES = 800
/** Miami-Dade: the box results must fall in, and the centre they're ranked from. */
const BBOX = '-80.88,25.13,-80.11,25.98'
const CENTER = { lat: 25.82, lon: -80.3 }
const USER_AGENT = 'FlamingoCounty/1.0 (+https://flamingocounty.com)'

export type PlacePoint = { id: string; name: string; sub: string; at: LatLng }

/**
 * Photon has no Spanish: a kind of place typed in Spanish is searched as its
 * OpenStreetMap tag ("farmacia" → amenity=pharmacy), with whatever else was
 * typed ("farmacia 49" keeps "49").
 */
const KINDS: Record<string, { word: string; tag: string }> = {
  farmacia: { word: 'pharmacy', tag: 'amenity:pharmacy' },
  farmacias: { word: 'pharmacy', tag: 'amenity:pharmacy' },
  supermercado: { word: 'supermarket', tag: 'shop:supermarket' },
  supermercados: { word: 'supermarket', tag: 'shop:supermarket' },
  mercado: { word: 'supermarket', tag: 'shop:supermarket' },
  hospital: { word: 'hospital', tag: 'amenity:hospital' },
  clinica: { word: 'clinic', tag: 'amenity:clinic' },
  medico: { word: 'doctors', tag: 'amenity:doctors' },
  doctor: { word: 'doctors', tag: 'amenity:doctors' },
  banco: { word: 'bank', tag: 'amenity:bank' },
  escuela: { word: 'school', tag: 'amenity:school' },
  colegio: { word: 'school', tag: 'amenity:school' },
  parque: { word: 'park', tag: 'leisure:park' },
  biblioteca: { word: 'library', tag: 'amenity:library' },
  iglesia: { word: 'church', tag: 'amenity:place_of_worship' },
  gasolinera: { word: 'fuel', tag: 'amenity:fuel' },
  restaurante: { word: 'restaurant', tag: 'amenity:restaurant' },
  restaurantes: { word: 'restaurant', tag: 'amenity:restaurant' },
  cafeteria: { word: 'cafe', tag: 'amenity:cafe' },
  cafe: { word: 'cafe', tag: 'amenity:cafe' },
  panaderia: { word: 'bakery', tag: 'shop:bakery' },
  lavanderia: { word: 'laundry', tag: 'shop:laundry' },
  correo: { word: 'post office', tag: 'amenity:post_office' },
  gimnasio: { word: 'gym', tag: 'leisure:fitness_centre' },
}

/** What a rider can't walk into: roads, stops, borders. */
const SKIP_KEYS = new Set([
  'highway',
  'railway',
  'public_transport',
  'boundary',
  'waterway',
  'natural',
  'landuse',
])

export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const cache = new Map<string, { at: number; result: Promise<PlacePoint[]> }>()

type Feature = {
  geometry: { coordinates: [number, number] }
  properties: {
    osm_id?: number
    osm_type?: string
    osm_key?: string
    name?: string
    street?: string
    housenumber?: string
    city?: string
    district?: string
  }
}

export function searchPlaces(q: string, limit = 8): Promise<PlacePoint[]> {
  const key = fold(q)
  if (key.length < 3) return Promise.resolve([])
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.result

  const [first, ...rest] = key.split(' ')
  const kind = KINDS[first]
  const params = new URLSearchParams({
    q: kind ? [kind.word, ...rest].join(' ') : q.trim().slice(0, 100),
    lat: String(CENTER.lat),
    lon: String(CENTER.lon),
    bbox: BBOX,
    limit: String(limit + 4),
  })
  if (kind) params.set('osm_tag', kind.tag)

  const result = (async () => {
    const res = await fetch(`${ENDPOINT}?${params}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`photon ${res.status}`)
    const json = (await res.json()) as { features?: Feature[] }
    const seen = new Set<string>()
    const out: PlacePoint[] = []
    for (const f of json.features ?? []) {
      const p = f.properties
      if (!p.name || (p.osm_key && SKIP_KEYS.has(p.osm_key))) continue
      const street = [p.housenumber, p.street].filter(Boolean).join(' ')
      const sub = [street, p.city ?? p.district].filter(Boolean).join(', ')
      // The same shop as a node and a building, or twice under two tags: once.
      const dedupe = `${fold(p.name)}|${fold(sub)}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      const [lng, lat] = f.geometry.coordinates
      out.push({
        id: `o${p.osm_type ?? ''}${p.osm_id ?? out.length}`,
        name: p.name,
        sub,
        at: [lat, lng],
      })
      if (out.length >= limit) break
    }
    return out
  })().catch(() => {
    // A failure isn't an answer: forget it soon, and meanwhile there are just no extra results.
    setTimeout(() => cache.delete(key), 5 * 60 * 1000).unref?.()
    return [] as PlacePoint[]
  })
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!)
  cache.set(key, { at: Date.now(), result })
  return result
}
