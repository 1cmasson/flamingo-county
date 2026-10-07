import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { boxesMeet, type Box } from './civicGeo'
import { LENSES, mapDir, type Lens } from './civicSync'

/**
 * The map's layers, as civicSync.ts wrote them, served a window at a time:
 * the browser asks for what's on screen, so a phone zoomed into one street
 * never downloads the county's flood map.
 */

type Feature = { type: 'Feature'; bbox: Box; properties: Record<string, unknown>; geometry: unknown }

const cache = new Map<Lens, { mtime: number; features: Feature[] }>()

export function isLens(v: string): v is Lens {
  return (LENSES as readonly string[]).includes(v)
}

function load(lens: Lens): Feature[] | null {
  const file = join(mapDir(), `${lens}.json`)
  if (!existsSync(file)) return null
  const mtime = statSync(file).mtimeMs
  const hit = cache.get(lens)
  if (hit && hit.mtime === mtime) return hit.features
  const features = (JSON.parse(readFileSync(file, 'utf8')) as { features: Feature[] }).features
  cache.set(lens, { mtime, features })
  return features
}

/** The features of `lens` that reach into `box` (west, south, east, north). */
export function lensIn(lens: Lens, box: Box | null): { type: 'FeatureCollection'; features: Feature[] } | null {
  const all = load(lens)
  if (!all) return null
  return { type: 'FeatureCollection', features: box ? all.filter((f) => boxesMeet(f.bbox, box)) : all }
}

/** "w,s,e,n" → a box, if it is four numbers around Miami-Dade-sized. */
export function parseBox(v: string | null): Box | null {
  const n = (v ?? '').split(',').map(Number)
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x)) || n[0] >= n[2] || n[1] >= n[3]) return null
  return n as Box
}
