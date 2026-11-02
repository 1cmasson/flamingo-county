import { getPayload } from 'payload'
import config from '../../../../payload.config'
import { nominate } from '../../../../lib/rankingNominations'

/**
 * One nomination for a ranking that is nominating (components/RankingNominate.tsx).
 * Answers with how many there are now, or why it wasn't taken. See lib/rankingNominations.ts.
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
  // As with votes: a preview needs a real admin session, not just a cookie's name.
  const preview = body.preview === true && Boolean((await payload.auth({ headers })).user)
  if (body.preview === true && !preview) return Response.json({ ok: false, reason: 'refused' }, { status: 403 })
  const result = await nominate(payload, body, headers, Date.now(), { preview })
  const status = result.ok
    ? 201
    : result.reason === 'busy'
      ? 429
      : result.reason === 'refused'
        ? 403
        : result.reason === 'invalid'
          ? 422
          : 409
  return Response.json(result, { status, headers: { 'Cache-Control': 'no-store' } })
}
