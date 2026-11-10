import data from '../data/transit/network.json'
import { COUNTY } from './county'
import { CITY_HOURS, TRANSIT, etaIdsFor, lineEnds, type TransitRoute } from './transit'
import { expandNetwork, type Network, type WireNetwork, type WireRoute } from './tripPlan'

/**
 * Every route the trip planner plans with, together: the county's whole feed
 * (`pnpm transit:network` → src/data/transit/network.json: Metrobus,
 * Metrorail, Metromover, the cities' trolleys) and Hialeah's free Flamingo
 * and Marlin from the City of Hialeah's own data (lib/transit.ts), with the
 * city's hours, so a Sunday trip is never put on a free line.
 *
 * `networkWire()` is what /api/transit/network sends the browser (compact);
 * `serverNetwork()` is the same, expanded, for the pages that plan on the
 * server (the popular trips, a trip link's first render).
 */

const FREE_COLOR: Record<TransitRoute['slug'], string> = { flamingo: '#ff2e88', marlin: '#16e0f2' }

/**
 * A free line as two patterns, one each way along its strip. A station served
 * one way only isn't in the other's; the minutes count from where each starts.
 */
function freeLine(route: TransitRoute, stops: WireNetwork['stops']): WireRoute {
  const [toStart, toEnd] = lineEnds(route)
  const pattern = (way: 'start' | 'end') => {
    const order = route.stations
      .map((st, i) => ({ st, i }))
      .filter(({ st }) => st.oneWay !== (way === 'end' ? 'start' : 'end'))
    if (way === 'start') order.reverse()
    const s: number[] = []
    const m: number[] = []
    const e: number[][] = []
    for (const { st } of order) {
      // The pole for this direction, where the station has one each side.
      const k = st.points.findIndex((_, x) => {
        const w = st.poleWays?.[x] ?? 'both'
        return w === 'both' || w === way
      })
      const at = st.points[Math.max(0, k)]
      s.push(stops.length)
      stops.push([at[0], at[1], st.names[Math.max(0, k)] ?? st.name, `${route.slug}:${st.id}`])
      m.push(way === 'end' ? st.min : route.rideMinutes - st.min)
      e.push(etaIdsFor(st))
    }
    return { dir: way === 'end' ? '1' : '0', toward: way === 'end' ? toEnd : toStart, loop: false, s, m, e }
  }
  return {
    slug: route.slug,
    number: null,
    short: route.gtfsShortName,
    name: route.name,
    kind: 'trolley',
    fare: 'free',
    live: 'eta',
    page: 'free',
    serviceEnds: TRANSIT.source.serviceEnds,
    // The city's posted hours (not either feed's): no buses on Sunday.
    hours: {
      weekday: [CITY_HOURS.weekday.opens, CITY_HOURS.weekday.closes],
      saturday: [CITY_HOURS.saturday.opens, CITY_HOURS.saturday.closes],
      sunday: null,
    },
    headway: {
      weekday: route.headwayMin.weekday,
      saturday: route.headwayMin.saturday,
      sunday: null,
    },
    color: FREE_COLOR[route.slug],
    patterns: [pattern('end'), pattern('start')],
  } as WireRoute
}

let wire: WireNetwork | null = null
export function networkWire(): WireNetwork {
  if (wire) return wire
  const raw = data as unknown as Omit<WireNetwork, 'routes'> & { routes: (WireRoute & { routeId?: string })[] }
  const stops = [...raw.stops]
  // Every county route has a page (lib/county.ts); the featured ones bring their street
  // paths, so a trip on them is drawn along the street; the rest through their stops.
  const pages = new Map(COUNTY.routes.map((r) => [r.slug, r]))
  const county = raw.routes.map(({ routeId: _id, ...r }) => {
    const own = pages.get(r.slug)
    const seen = new Set<string>()
    return {
      ...r,
      live: 'county' as const,
      page: own ? ('bus' as const) : null,
      patterns: r.patterns.map((p) => {
        const first = !seen.has(p.dir)
        seen.add(p.dir)
        // Street paths for the featured routes only: all of them would double what a phone downloads.
        const path =
          first && !p.loop && own?.featured
            ? own.directions.find((d) => d.id === p.dir)?.path
            : undefined
        return path ? { ...p, path } : p
      }),
    }
  })
  wire = {
    source: {
      fetchedAt: raw.source.fetchedAt,
      serviceEnds: raw.source.serviceEnds,
      // Which edition of the county's schedule: the daily refresh checks the live site serves it.
      feedHash: raw.source.feedHash,
    },
    stops,
    routes: [...TRANSIT.routes.map((r) => freeLine(r, stops)), ...county],
  }
  return wire
}

let network: Network | null = null
export function serverNetwork(): Network {
  network ??= expandNetwork(networkWire())
  return network
}

/** The county feed's route id for each route slug, for the live predictions (lib/countyLive.ts). */
export const ROUTE_ID_SLUGS: Map<string, string> = new Map(
  (data as unknown as { routes: { slug: string; routeId: string }[] }).routes.map((r) => [r.routeId, r.slug]),
)
