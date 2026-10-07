/**
 * The site's ink-and-sand street map as a style document, built on the server
 * from OpenFreeMap's "liberty" style: the same colours RideMap's inkAndSand()
 * paints after load, applied before the map ever draws, and with the layers
 * that would only be hidden taken out. The map opens in its final colours,
 * with less to draw.
 */

const SOURCE = 'https://tiles.openfreemap.org/styles/liberty'
const INK = '#0c0f14'
const CREAM = '#fff6e5'

type Layer = { id: string; type: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> }
type Style = { layers: Layer[]; [k: string]: unknown }

export function sandStyle(style: Style): Style {
  const layers: Layer[] = []
  for (const layer of style.layers) {
    const { id, type } = layer
    const paint = { ...(layer.paint ?? {}) }
    if (type === 'raster' || type === 'fill-extrusion' || id === 'road_area_pattern' || id === 'park_outline' || /one_way/.test(id)) continue
    if (type === 'background') paint['background-color'] = '#eadbbd'
    else if (type === 'fill') {
      if (id === 'water') paint['fill-color'] = '#b9d8d3'
      else if (id === 'building') {
        paint['fill-color'] = '#dcc79f'
        paint['fill-outline-color'] = 'rgba(12,15,20,0.18)'
      } else if (/park|grass|wood|wetland|pitch|cemetery/.test(id)) paint['fill-color'] = '#dfd3a6'
      else paint['fill-color'] = '#e6d6b4'
    } else if (type === 'line') {
      if (/rail/.test(id)) paint['line-color'] = 'rgba(12,15,20,0.45)'
      else if (/casing/.test(id)) paint['line-color'] = 'rgba(12,15,20,0.4)'
      else if (/^(road|bridge|tunnel)_/.test(id)) paint['line-color'] = '#fffaf0'
      else if (/waterway/.test(id)) paint['line-color'] = '#9fc8c2'
      else if (/boundary/.test(id)) paint['line-color'] = 'rgba(12,15,20,0.3)'
      else paint['line-color'] = '#d8c8a4'
    } else if (type === 'symbol') {
      paint['text-color'] = INK
      paint['text-halo-color'] = CREAM
      paint['text-halo-width'] = 1.6
    }
    layers.push({ ...layer, paint })
  }
  return { ...style, layers }
}

let cached: { at: number; style: Style } | null = null
const DAY = 86_400_000

/** The styled document, fetched and transformed at most once a day per server. */
export async function sandStyleDoc(): Promise<Style | null> {
  if (cached && Date.now() - cached.at < DAY) return cached.style
  try {
    const res = await fetch(SOURCE, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(String(res.status))
    cached = { at: Date.now(), style: sandStyle((await res.json()) as Style) }
    return cached.style
  } catch {
    return cached?.style ?? null
  }
}
