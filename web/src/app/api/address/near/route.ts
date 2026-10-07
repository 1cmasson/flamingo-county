import { NextResponse, type NextRequest } from 'next/server'
import { nearestAddress } from '../../../../lib/civic'

/**
 * "Use my location": the city address nearest a point, if one is within a
 * short walk. A POST with `{ lat, lon }` in the body, so the point never sits
 * in a URL (and so never in an access log); it is answered and dropped.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { lat?: unknown; lon?: unknown } | null
  const lat = Number(body?.lat)
  const lon = Number(body?.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: 'lat and lon required' }, { status: 400 })
  }
  return NextResponse.json({ result: await nearestAddress([lat, lon]) }, { headers: { 'Cache-Control': 'no-store' } })
}
