import { getPayload } from 'payload'
import config from '../../../../payload.config'
import { castPollVote, votedCookie } from '../../../../lib/storyPolls'

/**
 * One vote in the weekly story vote (components/StoryPollVote.tsx). Answers
 * with the new split, or why the vote wasn't taken. A vote leaves the browser
 * a cookie holding only the key picked, so it votes once per poll; nothing
 * about the voter is stored here. See lib/storyPolls.ts.
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
  const result = await castPollVote(payload, body, headers, Date.now(), { preview })

  const out = new Headers({ 'Cache-Control': 'no-store' })
  if (result.ok && !preview) {
    // Kept a month past the close, so the page still opens on the split for a while.
    const maxAge = Math.max(0, Math.floor((new Date(result.closesAt).getTime() - Date.now()) / 1000)) + 30 * 86_400
    const secure = (headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')) === 'https'
    out.append(
      'Set-Cookie',
      `${votedCookie(result.pollId)}=${encodeURIComponent(result.pick)}; Path=/; Max-Age=${maxAge}; SameSite=Lax; HttpOnly${secure ? '; Secure' : ''}`,
    )
  }
  const status = result.ok ? 201 : result.reason === 'busy' ? 429 : result.reason === 'refused' ? 403 : 409
  return Response.json(result, { status, headers: out })
}
