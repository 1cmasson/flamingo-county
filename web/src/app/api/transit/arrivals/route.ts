import { NextResponse, type NextRequest } from 'next/server'
import { nextArrivals } from '../../../../lib/live'

/**
 * The next buses at a stop: `?stops=44,57` — ETA stop numbers, as the pages
 * carry them (src/data/transit/hialeah.json, `eta`). Both sides of a street
 * are separate stops, so a few are allowed per request, and no more.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const stops = (req.nextUrl.searchParams.get('stops') ?? '')
    .split(',')
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 8)
  if (!stops.length) return NextResponse.json({ error: 'stops required' }, { status: 400 })
  const arrivals = await nextArrivals(stops)
  return NextResponse.json(
    { arrivals },
    { headers: { 'Cache-Control': 'public, max-age=10, s-maxage=15, stale-while-revalidate=30' } },
  )
}
