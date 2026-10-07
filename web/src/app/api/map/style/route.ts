import { NextResponse } from 'next/server'
import { sandStyleDoc } from '../../../../lib/mapStyle'

/** The address map's street style, already in the site's colours (src/lib/mapStyle.ts). */
export const dynamic = 'force-dynamic'

export async function GET() {
  const style = await sandStyleDoc()
  if (!style) return NextResponse.json({ error: 'unavailable' }, { status: 502 })
  return NextResponse.json(style, { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } })
}
