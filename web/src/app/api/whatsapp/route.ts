import { getPayload } from 'payload'
import config from '../../../payload.config'
import { twiml, whatsappNumber } from '../../../lib/promoWhatsapp'
import { readLocation } from '../../../lib/whatsappParams'
import { deliver, inboundConfigured, senderNumber, signedForInbound } from '../../../lib/whatsapp'
import { answerInbound } from '../../../lib/whatsappInbound'

/**
 * Twilio's webhook for everything Flamingo County's WhatsApp sender
 * (WHATSAPP_SENDER_NUMBER) receives: lib/whatsappInbound.ts decides, and
 * lib/whatsapp.ts sends the answer with buttons on the REST API. Whatever
 * couldn't go that way comes back here as TwiML text. Anything not signed
 * with TWILIO_AUTH_TOKEN for this URL is refused; unset, nobody is answered.
 */
const xml = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' } })

export async function POST(req: Request) {
  if (!inboundConfigured()) return new Response('Not configured', { status: 404 })
  const params = new URLSearchParams(await req.text())
  if (!signedForInbound(params, req.headers.get('x-twilio-signature'))) return new Response('Forbidden', { status: 403 })

  // Only messages to our own sender (a status callback or another number's traffic gets nothing).
  if (whatsappNumber(params.get('To')) !== senderNumber()) return xml(twiml(''))
  const phone = whatsappNumber(params.get('From'))
  if (!phone) return xml(twiml(''))
  try {
    const payload = await getPayload({ config })
    const outs = await answerInbound(payload, {
      phone,
      name: params.get('ProfileName'),
      body: (params.get('Body') ?? '').slice(0, 2000),
      button: params.get('ButtonPayload')?.slice(0, 100) || null,
      location: readLocation(params),
    })
    return xml(twiml(await deliver(phone, outs)))
  } catch (err) {
    console.error('[whatsapp]', err)
    return xml(twiml('Perdón, algo falló de nuestro lado. Inténtalo de nuevo en un rato. / Sorry, something went wrong on our side. Please try again shortly.'))
  }
}
