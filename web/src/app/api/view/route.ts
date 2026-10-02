import { after } from 'next/server'
import { getPayload } from 'payload'
import config from '../../../payload.config'
import { recordVisit } from '../../../lib/visits'

/**
 * One page view from `components/Pageview.tsx`, stored as an `hq-visits` row
 * (lib/visits.ts). Always 204, and the write happens after the response, so a
 * visitor's page never waits on the database. Bots, staff and cross-site posts
 * are dropped inside `recordVisit`.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response(null, { status: 400 })
  }
  if (!body || typeof body !== 'object' || typeof body.path !== 'string') {
    return new Response(null, { status: 400 })
  }

  const headers = new Headers(req.headers)
  after(async () => {
    const payload = await getPayload({ config })
    await recordVisit(
      payload,
      {
        path: body.path as string,
        ref: typeof body.ref === 'string' ? body.ref : null,
        utm: typeof body.utm === 'string' ? body.utm : null,
        entry: body.entry === true,
      },
      headers,
    )
  })
  return new Response(null, { status: 204 })
}
