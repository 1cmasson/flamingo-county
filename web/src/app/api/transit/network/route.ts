import { NextResponse } from 'next/server'
import { COUNTY } from '../../../../lib/county'
import type { Network } from '../../../../lib/tripPlan'

/**
 * Every county route the site covers, as the trip planner needs it: each
 * direction's stops in order (with ride minutes) and its line. The planner
 * runs in the browser, so the visitor's location never comes here; this is
 * the same for everyone, and changes only when `pnpm transit:county` does.
 */
export const dynamic = 'force-static'

export function GET() {
  const network: Network = {
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
  return NextResponse.json(network, {
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
  })
}
