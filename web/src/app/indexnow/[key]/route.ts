import { indexNowKey } from '../../../lib/indexnow'

// The key comes from the environment at request time, never baked in at build.
export const dynamic = 'force-dynamic'

/**
 * Serves the IndexNow ownership file. next.config rewrites `/<32 hex>.txt` here;
 * only the configured key answers, anything else is a plain 404.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const expected = indexNowKey()
  if (!expected || key !== expected) return new Response('Not found', { status: 404 })
  return new Response(expected, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
