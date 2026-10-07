import { getPayload } from 'payload'
import config from '../../../../../payload.config'
import { findOpenUpload, readCapped, receiveArtworkUpload, uploadRateLimited } from '../../../../../lib/artworkUpload'
import { ARTWORK_UPLOAD_LIMIT } from '../../../../../lib/siteArtwork'

/**
 * The second half of an artwork upload: the file itself, sent with
 *
 *   curl -X PUT --data-binary @file -H 'Content-Type: image/jpeg' <uploadUrl>
 *
 * to the link `hqStartSiteArtworkUpload` returned (lib/artworkUpload.ts). The
 * token in the path is the only credential: random, single use, 15 minutes,
 * and kept only as a hash. It is never logged.
 *
 * Refusals come cheap and in order: the rate limit, then the token's shape,
 * then one indexed lookup, and only then is the body read, capped at the
 * upload limit as it streams in.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function PUT(req: Request, { params }: { params: Promise<{ token: string }> }) {
  // Cloudflare sends the visitor alone in cf-connecting-ip (see lib/auth.ts).
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (uploadRateLimited(ip, Date.now())) return json(429, { error: 'Too many uploads. Wait a few minutes.' })

  const { token } = await params
  const payload = await getPayload({ config })
  const open = await findOpenUpload(payload, token)
  if (!('row' in open)) return json(open.status, { error: open.error })

  const data = await readCapped(req, ARTWORK_UPLOAD_LIMIT)
  if (!data) return json(413, { error: `Larger than ${ARTWORK_UPLOAD_LIMIT / 1024 / 1024} MB.` })

  try {
    const out = await receiveArtworkUpload(payload, open.row, data)
    return json(out.status, out.body)
  } catch (err) {
    // The path holds the token, so only the message is logged, never the URL.
    payload.logger.error(`[artwork-upload] upload ${open.row.id} failed: ${err instanceof Error ? err.message : String(err)}`)
    return json(500, { error: 'Storing the file failed. Start a new upload.' })
  }
}

const notAllowed = () => json(405, { error: 'Send the file with PUT.' })
export { notAllowed as GET, notAllowed as POST, notAllowed as PATCH, notAllowed as DELETE }
