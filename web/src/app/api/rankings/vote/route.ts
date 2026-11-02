import { getPayload } from 'payload'
import config from '../../../../payload.config'
import { castVote } from '../../../../lib/rankings'

/**
 * One vote in a ranking's open round (components/RankingVote.tsx). Answers
 * with the matchup's new count, or why the vote wasn't taken. See lib/rankings.ts.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, reason: 'refused' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') return Response.json({ ok: false, reason: 'refused' }, { status: 400 })

  const payload = await getPayload({ config })
  const headers = new Headers(req.headers)
  // A preview vote (the admin trying the page before it's published) needs a real admin session, not just a cookie's name.
  const preview = body.preview === true && Boolean((await payload.auth({ headers })).user)
  if (body.preview === true && !preview) return Response.json({ ok: false, reason: 'refused' }, { status: 403 })
  const result = await castVote(payload, body, headers, Date.now(), { preview })
  const status = result.ok ? 201 : result.reason === 'busy' ? 429 : result.reason === 'refused' ? 403 : 409
  return Response.json(result, { status, headers: { 'Cache-Control': 'no-store' } })
}
