import { getPayload } from 'payload'
import config from '../../../../payload.config'
import { couponWhatsApp } from '../../../../lib/promos'
import { promoCopy } from '../../../../lib/promoCopy'
import { answerWhatsapp, fromTwilio, twiml, whatsappNumber } from '../../../../lib/promoWhatsapp'

/**
 * Twilio's webhook for WhatsApp messages to the coupon number
 * (PROMO_WHATSAPP_NUMBER): the reply, as TwiML, carries the coupon. Anything
 * not signed with TWILIO_AUTH_TOKEN is refused, and with either unset the
 * route answers nobody. See lib/promoWhatsapp.ts.
 */
const xml = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' } })

export async function POST(req: Request) {
  if (!couponWhatsApp()) return new Response('Not configured', { status: 404 })
  const params = new URLSearchParams(await req.text())
  if (!fromTwilio(params, req.headers.get('x-twilio-signature'))) return new Response('Forbidden', { status: 403 })

  const phone = whatsappNumber(params.get('From'))
  if (!phone) return xml(twiml(''))
  try {
    const payload = await getPayload({ config })
    const reply = await answerWhatsapp(payload, {
      phone,
      name: params.get('ProfileName'),
      body: params.get('Body') ?? '',
    })
    return xml(twiml(reply))
  } catch (err) {
    console.error('[promo/whatsapp]', err)
    return xml(twiml(promoCopy('es').failed))
  }
}
