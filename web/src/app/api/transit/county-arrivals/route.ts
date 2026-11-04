import { NextResponse, type NextRequest } from 'next/server'
import { countyFeed, isRouteStop, stopDepartures } from '../../../../lib/countyLive'

/**
 * The next buses at a county stop, live: `?route=54&dir=0&stop=580`, as the
 * route page's «Próxima guagua» card asks. Only the route's own stops are
 * answered. `live: null` means there's no live data to stand on right now and
 * the card keeps the county's schedule.
 *
 * The answer is the same for everyone for 15 s, so it is cached that long;
 * the Swiftly feed behind it is read at most once per 15 s for the site.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const route = q.get('route') ?? ''
  const dir = q.get('dir') ?? ''
  const stop = q.get('stop') ?? ''
  if (!isRouteStop(route, dir, stop))
    return NextResponse.json({ error: 'unknown route, direction or stop' }, { status: 400 })
  const live = stopDepartures(await countyFeed(), route, dir, stop)
  return NextResponse.json(
    { live },
    { headers: { 'Cache-Control': 'public, max-age=10, s-maxage=15, stale-while-revalidate=30' } },
  )
}
