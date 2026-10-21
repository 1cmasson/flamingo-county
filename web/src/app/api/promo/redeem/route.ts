import { getPayload } from 'payload'
import config from '../../../../payload.config'
import { redeemCoupon } from '../../../../lib/promos'

/**
 * Staff marking a coupon used with the business's PIN
 * (components/CouponRedeem.tsx). See lib/promos.ts.
 */
export async function POST(req: Request) {
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return Response.json({ status: 'not-found' }, { status: 403 })
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'not-found' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') return Response.json({ status: 'not-found' }, { status: 400 })

  const payload = await getPayload({ config })
  const result = await redeemCoupon(payload, body)
  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
