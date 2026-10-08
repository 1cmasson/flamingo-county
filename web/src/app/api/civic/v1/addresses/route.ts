import type { NextRequest } from 'next/server'
import { findAddress, toLang } from '../../../../../lib/civicApi'
import { preflight, serveTool } from '../../../../../lib/civicApiHttp'

/**
 * GET /api/civic/v1/addresses?q=5410 w 6 ln — Miami-Dade addresses matching the text (the address page's type-ahead).
 * Read-only, public, not indexed. The query is answered and dropped: nothing
 * about it is logged or stored. See docs/civic-api-privacy.md.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const lang = toLang(p.get('lang'))
  return serveTool(req, 'find_address', () => findAddress(p.get('q') ?? '', lang))
}

export const OPTIONS = preflight
