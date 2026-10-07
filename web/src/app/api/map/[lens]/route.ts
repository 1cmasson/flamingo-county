import { NextResponse, type NextRequest } from 'next/server'
import { isLens, lensIn, parseBox } from '../../../../lib/civicMap'

/**
 * One map layer as GeoJSON: `/api/map/flood?bbox=w,s,e,n`. Without a box the
 * whole county comes back, which is fine for the small layers (commission
 * districts, cities) and what the map avoids for the big ones.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ lens: string }> }) {
  const { lens } = await params
  if (!isLens(lens)) return NextResponse.json({ error: 'unknown layer' }, { status: 404 })
  const data = lensIn(lens, parseBox(req.nextUrl.searchParams.get('bbox')))
  if (!data) return NextResponse.json({ error: 'loading' }, { status: 503, headers: { 'Retry-After': '120' } })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } })
}
