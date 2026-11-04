import { COUNTY } from './county'
import type { Network } from './tripPlan'

/**
 * Every county route the site covers, as the trip planner needs it: each
 * direction's stops in order (with ride minutes) and its line. The same for
 * everyone; it changes only when `pnpm transit:county` does.
 */
let network: Network | null = null
export function countyNetwork(): Network {
  network ??= {
    routes: COUNTY.routes.map((r) => ({
      slug: r.slug,
      number: r.number,
      short: r.short,
      kind: r.kind,
      serviceEnds: r.serviceEnds,
      directions: r.directions.map((d) => ({
        id: d.id,
        toward: d.toward,
        stations: d.stations.map(({ id, name, at, min }) => ({ id, name, at, min })),
        path: d.path,
      })),
    })),
  }
  return network
}
