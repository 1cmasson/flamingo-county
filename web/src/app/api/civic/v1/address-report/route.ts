import type { NextRequest } from 'next/server'
import { addressReportTool, toLang } from '../../../../../lib/civicApi'
import { preflight, serveTool } from '../../../../../lib/civicApiHttp'

/**
 * GET /api/civic/v1/address-report?address=… or ?slug=… — what /address shows for one address.
 * Read-only, public, not indexed. The query is answered and dropped: nothing
 * about it is logged or stored. See docs/civic-api-privacy.md.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const lang = toLang(p.get('lang'))
  return serveTool(req, 'address_report', () => addressReportTool({ slug: p.get('slug') ?? undefined, address: p.get('address') ?? undefined }, lang))
}

export const OPTIONS = preflight
