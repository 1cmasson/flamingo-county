import type { NextRequest } from 'next/server'
import { pollingPlaces, toLang } from '../../../../../lib/civicApi'
import { preflight, serveTool } from '../../../../../lib/civicApiHttp'

/**
 * GET /api/civic/v1/polling-places?city=hialeah or ?precinct=318 — Election Day sites (the /vote pages).
 * Read-only, public, not indexed. The query is answered and dropped: nothing
 * about it is logged or stored. See docs/civic-api-privacy.md.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const lang = toLang(p.get('lang'))
  return serveTool(req, 'polling_places', () => pollingPlaces({ city: p.get('city') ?? undefined, precinct: p.get('precinct') ?? undefined }, lang))
}

export const OPTIONS = preflight
