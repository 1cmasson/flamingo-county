import { getPayload } from 'payload'
import config from '../../../../payload.config'
import { fromTwilio, twiml, whatsappNumber } from '../../../../lib/promoWhatsapp'
import { answerReservas, reservasConfigured, webhookUrl } from '../../../../lib/reservas'

/**
 * Twilio's webhook for WhatsApp messages to the reservations line
 * (RESERVAS_WHATSAPP_NUMBER): the menu's reply goes back as TwiML. Anything not
 * signed with TWILIO_AUTH_TOKEN for this URL is refused, and with either unset
 * the route answers nobody. See lib/reservas.ts.
 */
const xml = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' } })

const SORRY = 'Perdón, algo falló de nuestro lado. Escríbenos otra vez en unos minutos. / Sorry, something went wrong on our side; please write again in a few minutes.'

export async function POST(req: Request) {
  if (!reservasConfigured()) return new Response('Not configured', { status: 404 })
  const params = new URLSearchParams(await req.text())
  if (!fromTwilio(params, req.headers.get('x-twilio-signature'), undefined, webhookUrl())) return new Response('Forbidden', { status: 403 })

  const phone = whatsappNumber(params.get('From'))
  if (!phone) return xml(twiml(''))
  try {
    const payload = await getPayload({ config })
    const reply = await answerReservas(payload, {
      phone,
      name: params.get('ProfileName'),
      body: params.get('Body') ?? '',
    })
    return xml(twiml(reply))
  } catch (err) {
    console.error('[reservas/whatsapp]', err)
    return xml(twiml(SORRY))
  }
}
