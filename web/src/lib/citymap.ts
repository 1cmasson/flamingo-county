import type { PlaceOnLine } from './rides'
import basemap from '../data/transit/hialeah-basemap.json'
import { ROUTE_STYLE, TRANSIT, type LatLng, type TransitRoute } from './transit'
import { routes as paths } from './routes'
import type { Lang } from '../i18n'

/**
 * The free-rides city map, projected on the server.
 *
 * Everything the browser draws arrives as finished SVG path strings: the
 * boundaries and roads (Census TIGER, `pnpm transit:basemap`), the Metrorail
 * track and both lines (Miami-Dade GTFS, `pnpm transit:sync`). No map tiles,
 * no third-party request, and no geometry in the client bundle.
 *
 * Equirectangular with the longitude squeezed by cos(latitude) — over a city
 * fifteen kilometres across, that is indistinguishable from a real projection.
 */

const BASEMAP = basemap as unknown as {
  places: { name: string; label: LatLng; rings: LatLng[][] }[]
  roads: { name: string; kind: 'primary' | 'secondary'; lines: LatLng[][] }[]
}

const W = 600
/** Room around the lines for the bullets, labels and a little of the neighbours. */
const PAD = 46

export type CityMapLine = {
  slug: TransitRoute['slug']
  name: string
  d: string
  color: string
  ink: string
  /** Seconds for one bus to go out and back. */
  cycle: number
  /** How many buses are drawn on the line at once — from the real frequency. */
  buses: number
  start: [number, number]
  end: [number, number]
}

export type CityMapModel = {
  w: number
  h: number
  places: { name: string; d: string; home: boolean; label: [number, number] | null }[]
  roads: { d: string; kind: 'primary' | 'secondary' }[]
  rail: string
  lines: CityMapLine[]
  spots: { x: number; y: number; name: string; href: string; route: TransitRoute['slug'] }[]
  transfer: [number, number] | null
}

/** Real minutes → animation seconds. A 90-minute line runs out and back in 90s. */
const SECONDS_PER_MINUTE = 0.5

export function cityMap(places: PlaceOnLine[], lang: Lang): CityMapModel {
  const pts = TRANSIT.routes.flatMap((r) => r.stations.flatMap((s) => s.points))
  const lat0 = pts.reduce((n, p) => n + p[0], 0) / pts.length
  const k = Math.cos((lat0 * Math.PI) / 180)
  const xs = pts.map((p) => p[1] * k)
  const ys = pts.map((p) => -p[0])
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const scale = (W - PAD * 2) / (maxX - minX)
  const h = Math.round((maxY - minY) * scale + PAD * 2)
  const at = (p: LatLng): [number, number] => [
    Number((PAD + (p[1] * k - minX) * scale).toFixed(1)),
    Number((PAD + (-p[0] - minY) * scale).toFixed(1)),
  ]
  const line = (ps: LatLng[]) => ps.map((p, i) => `${i ? 'L' : 'M'}${at(p).join(',')}`).join('')
  const inView = ([x, y]: [number, number]) => x > 30 && x < W - 30 && y > 20 && y < h - 20

  const placesOut = BASEMAP.places.map((p) => {
    const label = at(p.label)
    return {
      name: p.name,
      d: p.rings.map((r) => `${line(r)}Z`).join(''),
      home: p.name === 'Hialeah',
      label: inView(label) ? label : null,
    }
  })
  // Hialeah last, so its outline is drawn over its neighbours' shared edges.
  placesOut.sort((a, b) => Number(a.home) - Number(b.home))

  const roads = BASEMAP.roads.map((r) => ({
    kind: r.kind,
    d: r.lines.map(line).join(''),
  }))

  const lines: CityMapLine[] = TRANSIT.routes.map((r) => {
    const headway = r.headwayMin.weekday ?? 40
    return {
      slug: r.slug,
      name: r.name,
      d: line(r.stations.map((s) => s.points[0])),
      color: ROUTE_STYLE[r.slug].color,
      ink: ROUTE_STYLE[r.slug].ink,
      cycle: Math.round(r.rideMinutes * 2 * SECONDS_PER_MINUTE),
      // Buses on the road at once ≈ round trip ÷ headway.
      buses: Math.max(1, Math.round((r.rideMinutes * 2) / headway)),
      start: at(r.stations[0].points[0]),
      end: at(r.stations.at(-1)!.points[0]),
    }
  })

  const transferStation = TRANSIT.routes[0].stations.find((s) => s.transfers.length)
  const seen = new Set<string>()
  const spots = places.flatMap((p) => {
    if (seen.has(String(p.listing.id))) return []
    seen.add(String(p.listing.id))
    const [x, y] = at(p.stop.station.points[0])
    return [{ x, y, name: p.listing.name, href: paths.business(lang, p.citySlug, p.listing.slug), route: p.stop.route.slug }]
  })

  return {
    w: W,
    h,
    places: placesOut,
    roads,
    rail: line(TRANSIT.rail),
    lines,
    spots,
    transfer: transferStation ? at(transferStation.points[0]) : null,
  }
}
