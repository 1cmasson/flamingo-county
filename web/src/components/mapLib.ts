import type * as ML from 'maplibre-gl'

/**
 * The street map's two downloads, shared by the bus maps: MapLibre from the
 * site's own copy (scripts/vendor-maplibre.mjs), fetched only when a map is
 * about to draw, and the street style already in the site's colours
 * (/api/map/style), with OpenFreeMap's own as the fallback.
 */

const LIB = '/vendor/maplibre/maplibre-gl.mjs'
export const FALLBACK_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

let lib: Promise<typeof ML> | null = null
export function maplibre(): Promise<typeof ML> {
  const url = LIB
  lib ??= (
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as Promise<typeof ML>
  ).catch((e) => {
    // A dropped connection shouldn't cost the map for the rest of the visit.
    lib = null
    throw e
  })
  return lib
}

let style: Promise<unknown> | null = null
export function sandStyle(): Promise<unknown> {
  style ??= fetch('/api/map/style')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
  return style
}
