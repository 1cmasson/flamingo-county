/**
 * Rebuilds src/data/transit/hialeah-basemap.json: the ground the free-rides
 * map is drawn on — Hialeah's city limits, its neighbours, and the big roads
 * people steer by (Okeechobee Rd, the Palmetto, I-75).
 *
 *   pnpm transit:basemap
 *
 * Source: the US Census Bureau's TIGERweb map service (public domain, no key).
 * City limits and highways change on the scale of years, so this is run by
 * hand when they do, not on a schedule. Everything is simplified here — the
 * raw boundaries are ~3,000 points and the map needs a few hundred — so the
 * page ships a small file and does no geometry work of its own.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(import.meta.dirname, '../../src/data/transit/hialeah-basemap.json')
const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb'

/** The map's ground: the two lines' extent plus room for the neighbours. */
const BBOX = { xmin: -80.4, ymin: 25.795, xmax: -80.235, ymax: 25.945 }

const PLACES = ['Hialeah', 'Hialeah Gardens', 'Miami Lakes', 'Miami Springs', 'Medley', 'Opa-locka', 'Miami Gardens', 'Doral', 'Virginia Gardens']

/** Roads worth drawing, by the names TIGER files them under. */
const ROAD_LAYERS = [
  { id: 2, kind: 'primary' as const },
  { id: 6, kind: 'secondary' as const },
]

/** Simplification tolerance, metres. A pixel on the map is ~40 m. */
const TOLERANCE_M = 25

type Pt = [number, number] // [lat, lng]

const R = 6371000
const toXY = ([lat, lng]: Pt): [number, number] => [
  ((lng * Math.PI) / 180) * R * Math.cos((25.87 * Math.PI) / 180),
  ((lat * Math.PI) / 180) * R,
]

/** Douglas–Peucker in metres. */
function simplify(pts: Pt[], tol = TOLERANCE_M): Pt[] {
  if (pts.length < 3) return pts
  const xy = pts.map(toXY)
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = xy[a]
    const [bx, by] = xy[b]
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy) || 1
    let best = -1
    let bestD = tol
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * xy[i][0] - dx * xy[i][1] + bx * ay - by * ax) / len
      if (d > bestD) {
        bestD = d
        best = i
      }
    }
    if (best > -1) {
      keep[best] = 1
      stack.push([a, best], [best, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

/**
 * A closed ring starts and ends on the same point, which leaves Douglas–Peucker
 * no baseline to measure against — it would keep only the two ends. So the
 * ring is split at the point furthest from its start and each half simplified.
 */
function simplifyRing(ring: Pt[]): Pt[] {
  const [sx, sy] = toXY(ring[0])
  let far = 0
  let farD = -1
  ring.forEach((p, i) => {
    const [x, y] = toXY(p)
    const d = Math.hypot(x - sx, y - sy)
    if (d > farD) {
      farD = d
      far = i
    }
  })
  const a = simplify(ring.slice(0, far + 1))
  const b = simplify(ring.slice(far))
  return [...a, ...b.slice(1)]
}

const round = (p: Pt): Pt => [Number(p[0].toFixed(5)), Number(p[1].toFixed(5))]
/** GeoJSON is [lng, lat]; everything here is [lat, lng], like the transit data. */
const flip = (c: number[]): Pt => [c[1], c[0]]

async function query(url: string, params: Record<string, string>) {
  const res = await fetch(`${url}?${new URLSearchParams({ f: 'geojson', outSR: '4326', geometryPrecision: '5', ...params })}`)
  if (!res.ok) throw new Error(`TIGERweb ${res.status} for ${url}`)
  const json = (await res.json()) as { features?: { properties: Record<string, string>; geometry: { type: string; coordinates: unknown } }[] }
  if (!json.features?.length) throw new Error(`TIGERweb returned nothing for ${url} — did a layer id change?`)
  return json.features
}

async function main() {
  const placeRows = await query(`${TIGER}/Places_CouSub_ConCity_SubMCD/MapServer/4/query`, {
    where: `STATE='12' AND BASENAME IN (${PLACES.map((p) => `'${p}'`).join(',')})`,
    outFields: 'BASENAME,INTPTLAT,INTPTLON',
    returnGeometry: 'true',
  })
  const places = placeRows.map((f) => {
    const g = f.geometry
    const polys = (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]) as number[][][][]
    return {
      name: f.properties.BASENAME,
      label: [Number(f.properties.INTPTLAT), Number(f.properties.INTPTLON)] as Pt,
      rings: polys.flatMap((poly) => poly.map((ring) => simplifyRing(ring.map(flip)).map(round))).filter((r) => r.length >= 4),
    }
  })
  if (!places.some((p) => p.name === 'Hialeah')) throw new Error('Hialeah is missing from the places query')

  const envelope = JSON.stringify({ ...BBOX, spatialReference: { wkid: 4326 } })
  const roads: { name: string; kind: 'primary' | 'secondary'; lines: Pt[][] }[] = []
  for (const layer of ROAD_LAYERS) {
    const rows = await query(`${TIGER}/Transportation/MapServer/${layer.id}/query`, {
      geometry: envelope,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'NAME',
    })
    for (const f of rows) {
      const g = f.geometry
      const parts = (g.type === 'MultiLineString' ? g.coordinates : [g.coordinates]) as number[][][]
      roads.push({
        name: f.properties.NAME ?? '',
        kind: layer.kind,
        lines: parts.map((line) => simplify(line.map(flip)).map(round)).filter((l) => l.length >= 2),
      })
    }
  }

  const data = {
    source: {
      name: 'US Census Bureau TIGERweb',
      url: TIGER,
      fetchedAt: new Date().toISOString().slice(0, 10),
    },
    bbox: BBOX,
    places,
    roads,
  }
  writeFileSync(OUT, JSON.stringify(data) + '\n')
  const pts = places.reduce((n, p) => n + p.rings.reduce((m, r) => m + r.length, 0), 0) + roads.reduce((n, r) => n + r.lines.reduce((m, l) => m + l.length, 0), 0)
  console.log(`${places.length} places, ${roads.length} road features, ${pts} points → ${OUT}`)
}

main().catch((e) => {
  console.error(String(e.message ?? e))
  process.exit(1)
})
