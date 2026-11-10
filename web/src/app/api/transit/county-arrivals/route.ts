import { NextResponse, type NextRequest } from 'next/server'
import { countyFeed, isRouteStop, stopDepartures } from '../../../../lib/countyLive'
import { getCountyRoute, routeTimes, scheduleCurrent } from '../../../../lib/county'
import { nextDepartures } from '../../../../lib/busTime'

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
  // The schedule after the live buses, for the trip planner (its route's times aren't on the
  // page), on the routes the site keeps a timetable for (lib/county.ts). For the rest of the
  // county the planner says how often it comes instead.
  const r = getCountyRoute(route)
  const k = r ? r.directions.findIndex((d) => d.id === dir) : -1
  const i = k > -1 ? r!.directions[k].stations.findIndex((st) => st.id === stop) : -1
  const scheduled =
    r && i > -1 && scheduleCurrent(r)
      ? nextDepartures(routeTimes(r), routeTimes(r).directions[k], i)
      : []
  return NextResponse.json(
    { live, scheduled },
    { headers: { 'Cache-Control': 'public, max-age=10, s-maxage=15, stale-while-revalidate=30' } },
  )
}
