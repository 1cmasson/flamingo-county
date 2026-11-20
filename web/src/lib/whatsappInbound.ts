import type { Payload } from 'payload'

import type { Lang } from '../i18n'
import type { HqLead } from '../payload-types'
import { jevPick } from './jev'
import * as laCapital from './laCapital'
import { parseAsk } from './promoWhatsapp'
import { routes } from './routes'
import { absUrl } from './site'
import { esc, notifyOwner } from './telegram'
import type { LatLng } from './transitMath'
import type { Out } from './whatsapp'
import { asksForStats, isOwnerWhatsapp, ownerStatsOuts } from './hqStats'
import { alertOwner, leadsReport, log, masked, type LeadMessage } from './whatsappLeads'

/**
 * Everything Flamingo County's WhatsApp sender receives, in one place
 * (Twilio allows one inbound URL per sender), in this order:
 *
 *   1. BAJA / STOP → unsubscribed everywhere (vote alerts and every line)
 *   2. an emergency → "call 911" and a ping to the owner, nothing else
 *   3. the owner's own number (OWNER_WHATSAPP) asking for "stats" → his numbers
 *   4. a ref for a line (#la-capital …), or a number already talking to one → that line
 *   5. anything else → where to vote, and the owner sees it on Telegram
 *
 * Returns what to send; the route delivers it (lib/whatsapp.ts `deliver`).
 */

export type Incoming = {
  phone: string
  name: string | null
  body: string
  /** ButtonPayload: the id of a tapped button. */
  button: string | null
  location: LatLng | null
}

/* ------------------------------------------------------------- limits */

/** Answers per number per hour: plenty for a person, an end to a loop with someone's auto-reply. */
const PER_NUMBER_PER_HOUR = 40
const byNumber = new Map<string, { start: number; n: number }>()

export function resetInboundLimits() {
  byNumber.clear()
}

function underLimit(phone: string, now: number): boolean {
  const seen = byNumber.get(phone)
  if (!seen || now - seen.start >= 3_600_000) {
    if (byNumber.size > 5_000) byNumber.clear()
    byNumber.set(phone, { start: now, n: 1 })
    return true
  }
  return ++seen.n <= PER_NUMBER_PER_HOUR
}

/** The owner's and staff's own numbers (PROMO_TEST_PHONES): their leads are marked test. */
const testNumbers = () =>
  (process.env.PROMO_TEST_PHONES ?? '')
    .split(',')
    .map((n) => n.replace(/[^\d+]/g, ''))
    .map((n) => (n.startsWith('+') ? n : `+${n.length === 10 ? `1${n}` : n}`))
    .filter((n) => n.length > 8)

/* ------------------------------------------------------ the fixed answers */

const norm = laCapital.norm

export const isUnsubscribe = (text: string) =>
  /^(baja|darme de baja|dar de baja|stop|stop all|unsubscribe|cancelar suscripcion|no mas mensajes)$/.test(norm(text))

/**
 * A message that may be an emergency. Over-matching is fine: the answer is
 * only "call 911" plus a ping to the owner, and the conversation goes on.
 */
const EMERGENCY =
  /\b(emergenc\w*|911|dolor (en el|de) pecho|chest pain|no puedo respirar|can'?t breathe|cannot breathe|infarto|heart attack|derrame|stroke|desmay\w*|faint\w*|suicid\w*|matarme|kill myself|sobredosis|overdose|convulsi\w*|seizure|sangr\w* mucho|bleeding a lot|me estoy muriendo|i'?m dying)\b/

export const isEmergency = (text: string) => EMERGENCY.test(norm(text))

/** Spanish unless it reads as English. */
export const guessLang = (body: string): Lang =>
  /\b(hi|hello|hey|please|thanks|thank you|want|i'd|i would|information|visit|call)\b/i.test(body) &&
  !/\b(hola|gracias|quiero|información|informacion|visita|llamar|buenas)\b/i.test(body)
    ? 'en'
    : 'es'

const COPY = {
  unsubscribed: {
    es: 'Listo, te dimos de baja. No te volvemos a escribir. Si un día quieres volver, escríbenos.',
    en: 'Done, you’re unsubscribed. We won’t message you again. If you ever want back in, just write.',
  },
  emergency: {
    es: '⚠️ Si es una emergencia, llama al 911 ahora mismo. Este WhatsApp no es para emergencias.',
    en: '⚠️ If this is an emergency, call 911 right now. This WhatsApp isn’t for emergencies.',
  },
  general: (lang: Lang) =>
    lang === 'en'
      ? `Hi 👋 This is Flamingo County. Vote for the next Miami story here: ${absUrl(routes.storyPollCurrent('en'))}\nIf you wrote about something else, we’ll answer here.`
      : `Hola 👋 Este es el WhatsApp de Flamingo County. Vota por la próxima historia aquí: ${absUrl(routes.storyPollCurrent('es'))}\nSi escribes por otra cosa, te contestamos por aquí.`,
}

/* ------------------------------------------------------------- the leads */

async function findLead(payload: Payload, flow: string, phone: string): Promise<HqLead | null> {
  const { docs } = await payload.find({
    collection: 'hq-leads',
    where: { and: [{ flow: { equals: flow } }, { phone: { equals: phone } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs[0] ?? null
}

/** How long a line keeps answering a number that wrote to it, without a new ref. */
const LINE_MEMORY_DAYS = 60
/** The longest reply Jev may read. */
const JEV_MAX_CHARS = 60

async function unsubscribe(payload: Payload, phone: string): Promise<void> {
  const ctx = { overrideAccess: true } as const
  await payload.update({ collection: 'vote-whatsapp-optins', where: { phone: { equals: phone } }, data: { status: 'unsubscribed' }, ...ctx })
  await payload.update({ collection: 'hq-leads', where: { phone: { equals: phone } }, data: { optedOut: true }, ...ctx })
}

const stamp = (now: Date, from: LeadMessage['from'], body: string): LeadMessage => ({ at: now.toISOString(), from, body: body.slice(0, 1000) })

/** What we keep of their message: the words, never a shared location's coordinates. */
const keptBody = (msg: Incoming) => (msg.location ? `📍 (ubicación compartida)${msg.body ? ` ${msg.body}` : ''}` : msg.body || (msg.button ? `[${msg.button}]` : ''))

/* ------------------------------------------------------------ La Capital */

/** A link's text that asks for the domino tournament: «Quiero apuntarme al dominó (ref #la-capital ig-reel-domino es)». */
export const wantsDomino = (body: string) => /domin[oó]/i.test(body)

async function laCapitalTurn(payload: Payload, msg: Incoming, ask: ReturnType<typeof parseAsk>, now: Date): Promise<Out[]> {
  let lead = await findLead(payload, laCapital.FLOW, msg.phone)
  const fresh = laCapital.isFresh(lead?.lastInboundAt, now)
  if (!lead) {
    try {
      lead = await payload.create({
        collection: 'hq-leads',
        data: {
          flow: laCapital.FLOW,
          phone: msg.phone,
          whatsappName: msg.name?.slice(0, 80) || null,
          lang: ask?.lang ?? guessLang(msg.body),
          source: ask?.source ?? 'whatsapp',
          status: 'new',
          step: 'menu',
          test: testNumbers().includes(msg.phone),
          messages: [],
        },
        overrideAccess: true,
      })
    } catch (err) {
      // The same number writing twice at once: the other message made the row.
      lead = await findLead(payload, laCapital.FLOW, msg.phone)
      if (!lead) throw err
    }
  }

  const state: laCapital.LeadState = {
    step: (lead.step as laCapital.Step) ?? 'menu',
    lang: lead.lang === 'en' ? 'en' : 'es',
    status: lead.status,
    intent: (lead.intent as laCapital.Intent) ?? null,
    place: lead.place ?? null,
    when: lead.when ?? null,
    timeOfDay: lead.timeOfDay ?? null,
    travel: lead.travel ?? null,
    misses: lead.misses ?? 0,
    whatsappName: lead.whatsappName ?? msg.name ?? null,
    dominoParty: lead.dominoParty ?? null,
    dominoPlace: lead.dominoPlace ?? null,
    dominoAt: lead.dominoAt ?? null,
    event: laCapital.dominoEvent(undefined, now),
  }
  // A ref written again (they tapped a link again) starts from the menu, or
  // from the tournament when the link's text asks for it.
  const input: laCapital.Input = { button: msg.button, text: ask ? '' : msg.body, location: msg.location }
  const ctx: laCapital.TurnContext = { fresh: fresh || Boolean(ask), now, domino: Boolean(ask) && wantsDomino(msg.body) }

  // Only when a short reply matched no button by number or words: ask Jev which one they meant.
  // Never on the location screen (a typed reply there is likely an address) and never a long message.
  const shown = laCapital.screen(state.step, state)
  const jevMay = state.step !== 'pin' && msg.body.trim().length > 0 && msg.body.length <= JEV_MAX_CHARS
  if (!ctx.fresh && jevMay && !msg.button && !msg.location && shown?.buttons && !laCapital.command(msg.body) && !laCapital.pick(shown, input)) {
    ctx.jevPick = await jevPick(
      shown.text.slice(0, 400),
      msg.body,
      shown.buttons.map((b) => ({ id: b.id, description: b.title })),
    )
  }

  const t = laCapital.turn(state, input, ctx)
  const messages = log(lead, stamp(now, 'them', keptBody(msg)), ...t.outs.map((o) => stamp(now, 'bot', o.logAs ?? o.text)))
  const updated = await payload.update({
    collection: 'hq-leads',
    id: lead.id,
    data: {
      ...t.set,
      ...(msg.name && !lead.whatsappName ? { whatsappName: msg.name.slice(0, 80) } : {}),
      ...(ask && lead.source === 'whatsapp' ? { source: ask.source } : {}),
      lastInboundAt: now.toISOString(),
      messages,
    },
    overrideAccess: true,
  })
  if (t.alert) await alertOwner(updated, t.alert)
  return t.outs
}

/** Telegram HTML as WhatsApp text: tags out, entities back. Italic lines are Telegram how-tos (/wa…), so they go. */
const plainText = (html: string) =>
  html
    .replace(/\n*<i>[\s\S]*?<\/i>/g, '')
    .replace(/<\/?b>/g, '*')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

/* ------------------------------------------------------------------ main */

export async function answerInbound(payload: Payload, msg: Incoming, now: Date = new Date()): Promise<Out[]> {
  if (!underLimit(msg.phone, now.getTime())) return []
  const lang = guessLang(msg.body)

  if (!msg.button && isUnsubscribe(msg.body)) {
    await unsubscribe(payload, msg.phone)
    await notifyOwner(`🚫 WhatsApp BAJA/STOP from ${esc(masked(msg.phone))}. Unsubscribed everywhere.`)
    return [{ text: COPY.unsubscribed[/^(stop|stop all|unsubscribe)$/.test(norm(msg.body)) ? 'en' : 'es'] }]
  }

  if (!msg.button && isEmergency(msg.body)) {
    await notifyOwner(`🚨 <b>WhatsApp: may be an emergency</b>\n${esc(msg.name ?? 'sin nombre')} · <code>${esc(msg.phone)}</code>\n“${esc(msg.body.slice(0, 500))}”\n\nThey were told to call 911.`)
    return [{ text: `${COPY.emergency.es}\n${COPY.emergency.en}` }]
  }

  if (isOwnerWhatsapp(msg.phone) && asksForStats(msg.body, msg.button)) {
    return ownerStatsOuts(payload, msg.button, async () => plainText(await leadsReport(payload)), now)
  }

  const ask = parseAsk(msg.body)
  if (ask?.slug === laCapital.FLOW || msg.button?.startsWith('lc:')) return laCapitalTurn(payload, msg, ask, now)

  const lead = await findLead(payload, laCapital.FLOW, msg.phone)
  if (lead?.lastInboundAt && now.getTime() - new Date(lead.lastInboundAt).getTime() < LINE_MEMORY_DAYS * 86_400_000) {
    return laCapitalTurn(payload, msg, null, now)
  }

  await notifyOwner(`💬 WhatsApp from ${esc(msg.name ?? 'someone')} (${esc(masked(msg.phone))}):\n“${esc(keptBody(msg).slice(0, 500))}”`)
  return [{ text: COPY.general(lang) }]
}
