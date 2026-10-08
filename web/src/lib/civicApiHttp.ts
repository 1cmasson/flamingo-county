import { civicCurrent } from './civicStatus'
import type { ToolName, ToolResult } from './civicApi'

/**
 * The HTTP side of the civic tools: rate limits, the 503 while the data is
 * building, and the headers every answer carries. Shared by /mcp and
 * /api/civic/v1/…
 *
 * Nothing here logs. The limiter keeps, per client and tool, a count and the
 * start of the current minute: no query text, and the key is dropped once its
 * minute is over.
 */

export const RATE_LIMIT = 60
const WINDOW_MS = 60_000
const MAX_KEYS = 50_000

type Bucket = { start: number; count: number }
const buckets = new Map<string, Bucket>()

/** The client's address as the edge reports it (Cloudflare, then the proxy chain). Used only as a limiter key. */
export function clientKey(req: Request): string {
  const h = req.headers
  return h.get('cf-connecting-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
}

/**
 * One request against `limit` per minute for this client and tool. Returns
 * null when allowed, or the seconds to wait.
 */
export function rateLimit(client: string, tool: string, now = Date.now(), limit = RATE_LIMIT): number | null {
  const key = `${client}|${tool}`
  let b = buckets.get(key)
  if (!b || now - b.start >= WINDOW_MS) {
    if (buckets.size >= MAX_KEYS) sweep(now)
    b = { start: now, count: 0 }
    buckets.set(key, b)
  }
  b.count++
  return b.count > limit ? Math.max(1, Math.ceil((b.start + WINDOW_MS - now) / 1000)) : null
}

function sweep(now: number) {
  for (const [k, b] of buckets) if (now - b.start >= WINDOW_MS) buckets.delete(k)
  // Still full (a flood of distinct clients): start over rather than grow without bound.
  if (buckets.size >= MAX_KEYS) buckets.clear()
}

/** For tests. */
export function resetRateLimits() {
  buckets.clear()
}

export const API_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, Retry-After',
  // Machine endpoints: answers are for the asking agent, not for a search index.
  'X-Robots-Tag': 'noindex, nofollow',
  // An address in the query string must not sit in a shared cache.
  'Cache-Control': 'no-store',
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...API_HEADERS, ...extra },
  })
}

export function tooMany(retryAfter: number): Response {
  return json(
    { ok: false, error: 'rate_limited', text: 'Demasiadas consultas: espera un minuto. / Too many requests: wait a minute.' },
    429,
    { 'Retry-After': String(retryAfter) },
  )
}

export function notReadyResponse(): Response {
  return json(
    {
      ok: false,
      error: 'not_ready',
      text: 'Estamos actualizando los datos del condado. Vuelve en unos minutos. / The county data is being updated. Try again in a few minutes.',
    },
    503,
    { 'Retry-After': '600' },
  )
}

const STATUS: Record<string, number> = { not_ready: 503, not_found: 404, ambiguous: 200, bad_request: 400 }

/**
 * A JSON API route for one tool: 503 while the data is building, 429 past the
 * limit, the tool's own status otherwise. The query is passed through and
 * never written anywhere.
 */
export async function serveTool(req: Request, tool: ToolName, run: () => Promise<ToolResult>): Promise<Response> {
  if (!civicCurrent()) return notReadyResponse()
  const wait = rateLimit(clientKey(req), tool)
  if (wait) return tooMany(wait)
  const result = await run()
  if (!result.ok && result.error === 'not_ready') return notReadyResponse()
  return json(result, result.ok ? 200 : (STATUS[result.error] ?? 400))
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: API_HEADERS })
}
