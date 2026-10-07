import { NextResponse, type NextRequest } from 'next/server'
import { suggest } from '../../../../lib/civic'

/**
 * Addresses for the type-ahead on the address page: `?q=5410 w 6`. Only the
 * typed text arrives here, and nothing is kept: the answer comes from the
 * synced city data in memory.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, 140)
  return NextResponse.json(
    { results: await suggest(q, 8) },
    { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' } },
  )
}
