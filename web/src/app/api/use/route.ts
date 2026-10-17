import { after } from 'next/server'
import { getPayload } from 'payload'
import config from '../../../payload.config'
import { recordUse } from '../../../lib/uses'

/**
 * One use of the address tool from `components/UseTracker.tsx`, stored as an
 * `hq-uses` row (lib/uses.ts). Always 204, and the write happens after the
 * response. Unknown actions, bots, staff and cross-site posts are dropped
 * inside `recordUse`.
 */
export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(null, { status: 400 })
  }
  const headers = new Headers(req.headers)
  after(async () => {
    const payload = await getPayload({ config })
    await recordUse(payload, body, headers)
  })
  return new Response(null, { status: 204 })
}
