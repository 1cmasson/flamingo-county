import { gzipSync } from 'node:zlib'
import geojsonvt from 'geojson-vt'
import vtpbf from 'vt-pbf'
import type { Client, InStatement } from '@libsql/client'

import { ringsContain, type Box, type Ring } from './civicGeo'

/**
 * Cuts every map layer into vector tiles once, when the data is refreshed, and
 * stores them in the address database: serving a tile is then one indexed
 * read, with nothing computed per visit.
 *
 * Every tile carries all the layers (one source-layer each, plus `labels`), so
 * switching what the map shows needs no network at all: the phone already has
 * it. Tiles stop at zoom 14; MapLibre draws closer views from those.
 */

export const TILE_MAX_ZOOM = 14
/** The map never zooms out past the whole county (AddressMap's minZoom), so nothing is cut below it. */
export const TILE_MIN_ZOOM = 8
/** Miami-Dade and a margin: west, south, east, north. */
const COUNTY: Box = [-80.9, 25.1, -80.1, 26.0]

type Geo = { type: 'Feature'; properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }

const lon2x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z)
const lat2y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

/**
 * A point well inside a polygon, for its label: of a grid over the largest
 * part, the inside point farthest from any edge. A bounding-box centre can fall
 * outside an L-shaped district; this can't.
 */
export function labelPoint(polys: Ring[][]): [number, number] | null {
  let best: Ring[] | null = null
  let bestArea = -1
  for (const p of polys) {
    const ring = p[0]
    let a = 0
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
    if (Math.abs(a) > bestArea) {
      bestArea = Math.abs(a)
      best = p
    }
  }
  if (!best) return null
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of best[0]) {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  const edgeDistance = (x: number, y: number) => {
    let d = Infinity
    for (const ring of best!)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[j]
        const [bx, by] = ring[i]
        const dx = bx - ax
        const dy = by - ay
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
        d = Math.min(d, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)))
      }
    return d
  }
  const N = 14
  let pick: [number, number] | null = null
  let far = -1
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) {
      const x = x0 + ((x1 - x0) * i) / N
      const y = y0 + ((y1 - y0) * j) / N
      if (!ringsContain(best, x, y)) continue
      const d = edgeDistance(x, y)
      if (d > far) {
        far = d
        pick = [x, y]
      }
    }
  return pick ?? best[0][0]
}

/**
 * Writes the `tiles` table: every tile from zoom 8 to 14 over the county that
 * has anything in it, gzipped. Returns how many tiles and bytes.
 */
/**
 * The zoom each layer first appears at on the map (AddressMap's MIN_ZOOM):
 * below it a layer is left out of the tiles, which keeps the zoomed-out county
 * tiles small. Precincts and polling places share the "where to vote" lens.
 */
export const LAYER_MIN_ZOOM: Record<string, number> = { garbage: 11, flood: 10, precinct: 12, polling: 12, elementary: 10 }

export async function buildTiles(db: Client, layers: Record<string, Geo[]>, labels: Geo[]): Promise<{ tiles: number; bytes: number }> {
  await db.execute('CREATE TABLE tiles (z INTEGER NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (z, x, y)) WITHOUT ROWID')
  const index = Object.fromEntries(
    Object.entries({ ...layers, labels }).map(([name, features]) => [
      name,
      geojsonvt({ type: 'FeatureCollection', features } as never, { maxZoom: TILE_MAX_ZOOM, indexMaxZoom: 4, tolerance: 4, buffer: 32 }),
    ]),
  )
  let tiles = 0
  let bytes = 0
  let batch: InStatement[] = []
  for (let z = TILE_MIN_ZOOM; z <= TILE_MAX_ZOOM; z++) {
    const [xa, xb] = [lon2x(COUNTY[0], z), lon2x(COUNTY[2], z)]
    const [ya, yb] = [lat2y(COUNTY[3], z), lat2y(COUNTY[1], z)]
    for (let x = xa; x <= xb; x++)
      for (let y = ya; y <= yb; y++) {
        const present: Record<string, unknown> = {}
        for (const [name, idx] of Object.entries(index)) {
          if (z < (LAYER_MIN_ZOOM[name] ?? 0)) continue
          const t = idx.getTile(z, x, y)
          // A feature can carry its own first zoom (`minz`): labels too small to read further out.
          const features = t?.features.filter((f) => Number((f.tags as Record<string, unknown>)?.minz ?? 0) <= z) ?? []
          if (features.length) present[name] = { ...t, features }
        }
        if (!Object.keys(present).length) continue
        const data = gzipSync(Buffer.from(vtpbf.fromGeojsonVt(present, { version: 2 })), { level: 9 })
        batch.push({ sql: 'INSERT INTO tiles (z, x, y, data) VALUES (?, ?, ?, ?)', args: [z, x, y, data] })
        tiles++
        bytes += data.length
        if (batch.length >= 200) {
          await db.batch(batch, 'write')
          batch = []
        }
      }
  }
  if (batch.length) await db.batch(batch, 'write')
  return { tiles, bytes }
}
