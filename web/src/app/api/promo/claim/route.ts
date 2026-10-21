import { getPayload } from 'payload'
import config from '../../../../payload.config'
import { claimCoupon } from '../../../../lib/promos'

/**
 * "Get my coupon" on a promotion page (components/PromoClaim.tsx). Answers
 * with the new code, or why there isn't one. See lib/promos.ts.
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
  const result = await claimCoupon(payload, body, new Headers(req.headers))
  const status = result.ok ? 201 : result.reason === 'busy' ? 429 : result.reason === 'refused' ? 403 : 409
  return Response.json(result, { status, headers: { 'Cache-Control': 'no-store' } })
}
