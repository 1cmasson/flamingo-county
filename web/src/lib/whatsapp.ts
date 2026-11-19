import { fromTwilio } from './promoWhatsapp'
import { SITE_URL } from './site'

/**
 * Flamingo County's WhatsApp sender (+1 786-460-4851, WHATSAPP_SENDER_NUMBER)
 * and how we talk on it: one inbound webhook for everything that number
 * receives (lib/whatsappInbound.ts) and replies with tap buttons.
 *
 * Buttons: WhatsApp quick replies, at most 3 per message, titles up to 20
 * characters. Twilio sends them only as a Content template (a ContentSid),
 * never in a webhook's TwiML reply, so the answer goes out on Twilio's REST
 * API and the webhook itself returns an empty TwiML. Inside the 24-hour
 * window a quick reply needs no Meta approval and its titles and ids can be
 * variables, so three generic templates (1, 2 or 3 buttons) cover every
 * screen; they're found or created on first use (`buttonsTemplate`).
 *
 * If anything on that path fails, the same words go back as plain text with
 * numbered choices in the webhook's TwiML, and a typed "1", "2" or "3" picks
 * the same button a tap would. So the conversation never depends on buttons.
 */

export const INBOUND_PATH = '/api/whatsapp'
/** The address Twilio is given and signs (the public one). */
export const inboundUrl = () => `${SITE_URL}${INBOUND_PATH}`

/** The sender as E.164 ("+17864604851"), or null when it isn't set. */
export function senderNumber(): string | null {
  const digits = (process.env.WHATSAPP_SENDER_NUMBER ?? '').replace(/\D/g, '')
  if (digits.length < 10) return null
  return `+${digits.length === 10 ? `1${digits}` : digits}`
}

/** Whether the inbound webhook answers at all: a sender and Twilio's token. */
export const inboundConfigured = () => Boolean(senderNumber() && process.env.TWILIO_AUTH_TOKEN)

/** Whether we can send on the REST API (needed for buttons and for the owner's replies). */
export const restConfigured = () =>
  Boolean(senderNumber() && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)

/** A request really from Twilio, signed for this webhook's own URL. */
export const signedForInbound = (params: URLSearchParams, signature: string | null) =>
  fromTwilio(params, signature, process.env.TWILIO_AUTH_TOKEN, inboundUrl())

/* ------------------------------------------------------------ messages */

export type Button = { id: string; title: string }
export type Out = {
  text: string
  buttons?: Button[]
  /** What the lead's log keeps instead of `text`, when the text says something about where they are (a bus answer). */
  logAs?: string
}

export const MAX_BUTTONS = 3
export const TITLE_MAX = 20
export const BODY_MAX = 1024

/** The message as plain text: the buttons become "1 · Title" lines anyone can answer by number. */
export function asText(m: Out): string {
  if (!m.buttons?.length) return m.text
  return `${m.text}\n\n${m.buttons.map((b, i) => `${i + 1} · ${b.title}`).join('\n')}`
}

/** Checks a message against WhatsApp's limits; a test runs it over every screen. */
export function validOut(m: Out): string | null {
  if (!m.text.trim()) return 'empty text'
  if (m.text.length > BODY_MAX) return `text over ${BODY_MAX}`
  if ((m.buttons?.length ?? 0) > MAX_BUTTONS) return `more than ${MAX_BUTTONS} buttons`
  for (const b of m.buttons ?? []) {
    if (!b.title || [...b.title].length > TITLE_MAX) return `button "${b.title}" over ${TITLE_MAX}`
    if (!/^[a-z0-9:_-]{1,60}$/.test(b.id)) return `button id "${b.id}"`
  }
  return null
}

/* ------------------------------------------------------------ Twilio */

const auth = () =>
  `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`

async function twilioError(res: Response): Promise<Error> {
  const why = ((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? `HTTP ${res.status}`
  return new Error(`Twilio refused it: ${why}`)
}

/** Version of the generic templates: bump it to make new ones if their shape changes. */
const TEMPLATE_VERSION = 1
const templateName = (n: number) => `fc_buttons_${n}_v${TEMPLATE_VERSION}`

/** The template's variables: 1 = body, then n titles, then n ids. */
export function templateVariables(m: Out): Record<string, string> {
  const b = m.buttons ?? []
  const vars: Record<string, string> = { '1': m.text }
  b.forEach((x, i) => {
    vars[String(2 + i)] = x.title
    vars[String(2 + b.length + i)] = x.id
  })
  return vars
}

const templateSids = new Map<number, Promise<string>>()

/** Test hook. */
export function resetTemplateCache() {
  templateSids.clear()
}

async function findOrCreateTemplate(n: number): Promise<string> {
  const name = templateName(n)
  const list = await fetch('https://content.twilio.com/v1/Content?PageSize=500', {
    headers: { Authorization: auth() },
    signal: AbortSignal.timeout(10_000),
  })
  if (!list.ok) throw await twilioError(list)
  const found = ((await list.json()) as { contents?: { sid: string; friendly_name: string }[] }).contents?.find(
    (c) => c.friendly_name === name,
  )
  if (found) return found.sid

  const sample: Out = {
    text: 'Hola',
    buttons: Array.from({ length: n }, (_, i) => ({ id: `b${i + 1}`, title: `Opción ${i + 1}` })),
  }
  const variables = templateVariables(sample)
  const actions = Array.from({ length: n }, (_, i) => ({ title: `{{${2 + i}}}`, id: `{{${2 + n + i}}}` }))
  const res = await fetch('https://content.twilio.com/v1/Content', {
    method: 'POST',
    headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      friendly_name: name,
      language: 'es',
      variables,
      types: { 'twilio/quick-reply': { body: '{{1}}', actions } },
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw await twilioError(res)
  return ((await res.json()) as { sid: string }).sid
}

/** The ContentSid for a message with n buttons (found or made once per server). */
export function buttonsTemplate(n: number): Promise<string> {
  let p = templateSids.get(n)
  if (!p) {
    p = findOrCreateTemplate(n)
    // A failure isn't remembered: the next message tries again.
    p.catch(() => templateSids.delete(n))
    templateSids.set(n, p)
  }
  return p
}

/** Send one message on the REST API: plain text, or with buttons through the generic template. */
export async function sendOut(to: string, m: Out): Promise<void> {
  const from = senderNumber()
  if (!restConfigured() || !from) throw new Error('WhatsApp sending isn’t set up (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, WHATSAPP_SENDER_NUMBER).')
  const form = new URLSearchParams({ From: `whatsapp:${from}`, To: `whatsapp:${to}` })
  if (m.buttons?.length) {
    form.set('ContentSid', await buttonsTemplate(m.buttons.length))
    form.set('ContentVariables', JSON.stringify(templateVariables(m)))
  } else {
    form.set('Body', m.text)
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: auth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw await twilioError(res)
}

/**
 * Deliver a turn's messages in order. Whatever couldn't go on the REST API
 * (not set up, or Twilio refused) comes back as text for the webhook's TwiML,
 * so the person still gets every word.
 */
export async function deliver(to: string, outs: Out[]): Promise<string> {
  const rest: string[] = []
  let failed = !restConfigured()
  for (const m of outs) {
    if (!failed) {
      try {
        await sendOut(to, m)
        continue
      } catch (err) {
        console.error('[whatsapp] send failed, answering in TwiML', err)
        failed = true
      }
    }
    rest.push(asText(m))
  }
  return rest.join('\n\n')
}

/** Free-form messages are allowed for 24 hours after the person's last one. */
export const inWindow = (lastInboundAt: string | null | undefined, now: Date) =>
  Boolean(lastInboundAt) && now.getTime() - new Date(lastInboundAt!).getTime() < 24 * 3_600_000
