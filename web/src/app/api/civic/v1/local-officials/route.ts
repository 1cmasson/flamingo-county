import type { NextRequest } from 'next/server'
import { localOfficials, toLang } from '../../../../../lib/civicApi'
import { preflight, serveTool } from '../../../../../lib/civicApiHttp'

/**
 * GET /api/civic/v1/local-officials?city=hialeah — the county mayor, the city's mayor and its county commissioners.
 * Read-only, public, not indexed. The query is answered and dropped: nothing
 * about it is logged or stored. See docs/civic-api-privacy.md.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const lang = toLang(p.get('lang'))
  return serveTool(req, 'local_officials', () => localOfficials({ city: p.get('city') ?? undefined }, lang))
}

export const OPTIONS = preflight
