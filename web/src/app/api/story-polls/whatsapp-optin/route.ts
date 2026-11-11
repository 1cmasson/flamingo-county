import { getPayload } from 'payload'
import config from '../../../../payload.config'
import { saveVoteOptin } from '../../../../lib/voteOptins'

/**
 * "Want to vote every week?" after a vote (components/StoryPollVote.tsx): a
 * WhatsApp number and its consent, saved in `vote-whatsapp-optins`
 * (lib/voteOptins.ts). Nothing is sent to the number from here.
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
  // On the admin's preview of an unpublished poll, like a vote: needs a real admin session, and is saved as a test.
  const preview = body.preview === true && Boolean((await payload.auth({ headers })).user)
  if (body.preview === true && !preview) return Response.json({ ok: false, reason: 'refused' }, { status: 403 })
  const result = await saveVoteOptin(payload, body, headers, Date.now(), { preview })

  const status = result.ok
    ? result.created
      ? 201
      : 200
    : result.reason === 'busy'
      ? 429
      : result.reason === 'refused'
        ? 403
        : result.reason === 'not-found'
          ? 404
          : result.reason === 'closed'
            ? 409
            : 400
  return Response.json(result, { status, headers: { 'Cache-Control': 'no-store' } })
}
