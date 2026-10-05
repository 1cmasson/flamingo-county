import { NextResponse } from 'next/server'
import { liveSnapshot } from '../../../../lib/live'

/**
 * Where Hialeah's buses are right now, for the free-rides map. The server
 * fetches ETA's feed at most every 15s (src/lib/live.ts); this response may be
 * reused by browsers and the edge for a few seconds on top of that.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const snap = await liveSnapshot()
  return NextResponse.json(snap, {
    headers: { 'Cache-Control': 'public, max-age=5, s-maxage=10, stale-while-revalidate=20' },
  })
}
