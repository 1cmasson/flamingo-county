import { civicOpenApi } from '../../../../../lib/civicOpenApi'
import { API_HEADERS, preflight } from '../../../../../lib/civicApiHttp'

/** GET /api/civic/v1/openapi.json: the civic API for ChatGPT Actions and other OpenAPI clients. */
export const dynamic = 'force-static'

export function GET() {
  return new Response(JSON.stringify(civicOpenApi(), null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...API_HEADERS,
      // The document holds no query, so it may be cached.
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

export const OPTIONS = preflight
