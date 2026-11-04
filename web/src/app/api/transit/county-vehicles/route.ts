import { NextResponse, type NextRequest } from 'next/server'
import { getCountyRoute } from '../../../../lib/county'
import { countyFeed, routeVehicles } from '../../../../lib/countyLive'

/**
 * Where one county route's buses are right now: `?route=54`, for the map on
 * the route page. Read from the same shared copy of Swiftly's feed as the
 * arrivals (lib/countyLive.ts), so it costs Swiftly nothing extra.
 * `live: null` means there's no live data right now.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('route') ?? ''
  const route = getCountyRoute(slug)
  if (!route || route.kind !== 'bus')
    return NextResponse.json({ error: 'unknown route' }, { status: 400 })
  const live = routeVehicles(await countyFeed(), slug)
  return NextResponse.json(
    { live },
    { headers: { 'Cache-Control': 'public, max-age=10, s-maxage=15, stale-while-revalidate=30' } },
  )
}
