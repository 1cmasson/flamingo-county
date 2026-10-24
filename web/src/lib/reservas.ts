import { createHash } from 'node:crypto'
import type { Payload } from 'payload'

import type { Lang } from '../i18n'
import type { HqLead } from '../payload-types'
import { parseAsk, whatsappNumber } from './promoWhatsapp'
import { SITE_URL } from './site'
import { esc, notifyOwner, sendMessage } from './telegram'

/**
 * The reservations WhatsApp line: events we sell tables for on a promoter's
 * behalf (commission per table), answered by a plain number menu, no model.
 *
 *   someone taps «Escríbenos por WhatsApp» (a wa.me link with a ref, below)
 *   → Twilio → /api/reservas/whatsapp → `answerReservas` → the reply (TwiML)
 *
 * Every number that writes becomes an `hq-leads` row, with where they came
 * from: that list is what proves to the promoter which tables were ours. The
 * menu answers what we know for sure; anything else, and every table request,
 * goes to a person ("handoff"): the owner gets it on Telegram and answers by
 * replying there (`ownerReply`), or taps Send on a reply Claude drafted
 * (`draftLeadReply`). While a lead is with a person the bot stays quiet.
 *
 * WhatsApp lets a business reply freely for 24 hours after the person's last
 * message. After that only a Meta-approved template may be sent, and only to
 * someone who said yes to hearing from us (`optIn`), so the bot asks.
 *
 * No alcohol in the bot's words: WhatsApp's commerce policy doesn't allow
 * selling it. Tables, entry and the night only; a bottle perk is for the
 * person to explain.
 */

export const WEBHOOK_PATH = '/api/reservas/whatsapp'
export const webhookUrl = () => `${SITE_URL}${WEBHOOK_PATH}`

/** The reservations number (RESERVAS_WHATSAPP_NUMBER) as digits, or null when the line isn't set up. */
export function reservasNumber(): string | null {
  const digits = (process.env.RESERVAS_WHATSAPP_NUMBER ?? '').replace(/\D/g, '')
  if (digits.length < 10) return null
  return digits.length === 10 ? `1${digits}` : digits
}

/** Whether the line answers at all: a number and Twilio's token. */
export const reservasConfigured = () => Boolean(reservasNumber() && process.env.TWILIO_AUTH_TOKEN)

/* ------------------------------------------------------------ the events */

type Both = Record<Lang, string>

export type TableTier = { name: string; seats: number; price: string; count: number }

export type ReservasEvent = {
  slug: string
  /** The last day the line answers for it (Miami date); after that the menu says it's over. */
  until: string
  title: Both
  /** The three lines under the greeting: when, where, who may come. */
  card: Record<Lang, string[]>
  /** Answers to "4 · Preguntas". Only what the event's own site says. */
  faq: Both
  tables: TableTier[]
  /** What every table includes, in words the bot may say (no alcohol). */
  tablesInclude: Both
  tablesNote: Both
  ga: Both
  /** Our own ticket link or code. null until the promoter gives us one: the event's own link loses the attribution. */
  gaUrl: string | null
  /** The perk for booking with us, once the promoter confirms it. Never a bottle in the bot's words. */
  perk: Both | null
}

/**
 * Sourced from chacal2027.com, read 2026-10-23 (topics/chacal-nye in
 * content-marketing-system). Prices are the site's, per table, before
 * service fee and tax; they go only to a person who asked, in this private
 * chat, never on our site or posts. Not stated anywhere yet, so the bot sends
 * those questions to a person: dress code, parking, end time, refunds,
 * deposits, GA prices.
 */
export const RESERVAS_EVENTS: ReservasEvent[] = [
  {
    slug: 'chacal-nye',
    until: '2026-12-31',
    title: { es: 'Chacal · Fin de Año 2027', en: 'Chacal · New Year’s Eve 2027' },
    card: {
      es: [
        '📅 Jueves 31 de diciembre · puertas 9 PM',
        '📍 Rooftop Live, arriba de DAER en el Guitar Hotel · Seminole Hard Rock, Hollywood',
        '🔞 21+ con identificación',
      ],
      en: [
        '📅 Thursday, December 31 · doors 9 PM',
        '📍 Rooftop Live, on top of DAER at the Guitar Hotel · Seminole Hard Rock, Hollywood',
        '🔞 21+ with ID',
      ],
    },
    faq: {
      es: [
        '📅 Jueves 31 de diciembre de 2026. Puertas a las 9 PM; conteo de medianoche con fuegos artificiales.',
        '📍 Rooftop Live, la tarima al aire libre arriba de DAER, en el Guitar Hotel del Seminole Hard Rock Hotel & Casino, en Hollywood.',
        '🔞 Solo mayores de 21, con identificación válida.',
        '🎤 Presenta Imaray Ulloa.',
        '',
        'El código de vestir, el parqueo y la hora de cierre todavía no están confirmados. Responde 5 y una persona te ayuda.',
      ].join('\n'),
      en: [
        '📅 Thursday, December 31, 2026. Doors at 9 PM; midnight countdown with fireworks.',
        '📍 Rooftop Live, the open-air stage on top of DAER, at the Guitar Hotel of the Seminole Hard Rock Hotel & Casino in Hollywood.',
        '🔞 21 and over only, with valid ID.',
        '🎤 Hosted by Imaray Ulloa.',
        '',
        'Dress code, parking and closing time aren’t confirmed yet. Reply 5 and a person will help you.',
      ].join('\n'),
    },
    tables: [
      { name: 'High top', seats: 2, price: '$699.99', count: 10 },
      { name: 'Side table', seats: 4, price: '$1,200', count: 4 },
      { name: 'Main floor', seats: 6, price: '$1,800', count: 4 },
      { name: 'Party box', seats: 8, price: '$2,400', count: 6 },
      { name: 'Skyline', seats: 10, price: '$3,000', count: 5 },
    ],
    tablesInclude: {
      es: 'Cada mesa incluye la entrada de tu grupo y un lugar reservado para el conteo de medianoche. La Skyline tiene la mejor vista de los fuegos artificiales.',
      en: 'Every table includes entry for your group and a reserved spot for the midnight countdown. Skyline has the best view of the fireworks.',
    },
    tablesNote: {
      es: 'Precio por mesa, del sitio oficial del evento; se suman service fee e impuestos.',
      en: 'Price per table, from the event’s official site; service fee and tax are added.',
    },
    ga: {
      es: 'Las entradas generales son de pie y se compran en TIXR: una para entrar desde las 9 PM y otra para entrar después de la 1 AM. 21+ con identificación.',
      en: 'General admission is standing room, sold on TIXR: one ticket to get in from 9 PM, another to get in after 1 AM. 21+ with ID.',
    },
    gaUrl: null,
    perk: null,
  },
]

export const reservasEvent = (slug: string | null | undefined) => RESERVAS_EVENTS.find((e) => e.slug === slug) ?? null

/** The event a message without a ref is about: the one still on sale (the first, while there's one). */
export function currentEvent(today: string): ReservasEvent | null {
  return RESERVAS_EVENTS.find((e) => e.until >= today) ?? null
}

/**
 * The wa.me link for a post, story or page, with the ref the bot reads:
 * «Hola, quiero reservar para Chacal · Fin de Año 2027 (ref #chacal-nye instagram es)».
 */
export function reservasLink(slug: string, source: string, lang: Lang): string | null {
  const ev = reservasEvent(slug)
  const number = reservasNumber()
  if (!ev || !number) return null
  const hello = lang === 'en' ? `Hi, I'd like to book for ${ev.title.en}` : `Hola, quiero reservar para ${ev.title.es}`
  return `https://wa.me/${number}?text=${encodeURIComponent(`${hello} (ref #${slug} ${source} ${lang})`)}`
}

/* -------------------------------------------------------------- the copy */

const first = (name: string | null | undefined) => name?.trim().split(/\s+/)[0]?.slice(0, 30) || ''

function menu(lang: Lang): string {
  return lang === 'en'
    ? [
        'Reply with a number:',
        '1 · Book a VIP table',
        '2 · See the tables',
        '3 · General admission',
        '4 · Questions (time, place, age)',
        '5 · Talk to a person',
      ].join('\n')
    : [
        'Responde con un número:',
        '1 · Reservar una mesa VIP',
        '2 · Ver las mesas',
        '3 · Entradas generales',
        '4 · Preguntas (hora, lugar, edad)',
        '5 · Hablar con una persona',
      ].join('\n')
}

function welcome(ev: ReservasEvent, lang: Lang, name: string | null | undefined): string {
  const n = first(name)
  const hi =
    lang === 'en'
      ? `Hi${n ? `, ${n}` : ''}! 🦩 This is Flamingo County’s reservations line for *${ev.title.en}*.`
      : `¡Hola${n ? `, ${n}` : ''}! 🦩 Esta es la línea de reservas de Flamingo County para *${ev.title.es}*.`
  const other = lang === 'en' ? '¿Español? Responde ES' : 'English? Reply EN'
  return [hi, '', ...ev.card[lang], '', menu(lang), '', other].join('\n')
}

function tablesList(ev: ReservasEvent, lang: Lang, tiers: TableTier[], numbered: boolean): string {
  const upTo = lang === 'en' ? 'up to' : 'hasta'
  return tiers.map((t, i) => `${numbered ? `${i + 1} · ` : '• '}*${t.name}* · ${upTo} ${t.seats} · ${t.price}`).join('\n')
}

const fitting = (ev: ReservasEvent, party: number) => ev.tables.filter((t) => t.seats >= party)

const copy = {
  askParty: { es: '¡Buenísimo! ¿Cuántas personas van a ser? Escribe solo el número, por ejemplo 6.', en: 'Great! How many people? Just the number, e.g. 6.' },
  badParty: { es: 'Escribe solo el número de personas, por ejemplo 6.', en: 'Just the number of people, e.g. 6.' },
  tooMany: {
    es: 'Para un grupo así de grande lo mejor es hablarlo con una persona: te escribimos por aquí en breve.',
    en: 'For a group that size it’s best to talk it through with a person: we’ll message you here shortly.',
  },
  pickTier: { es: 'Responde con el número de la mesa que quieres.', en: 'Reply with the number of the table you want.' },
  badTier: { es: 'Responde con uno de los números de la lista, o 0 para el menú.', en: 'Reply with one of the numbers on the list, or 0 for the menu.' },
  askOptIn: {
    es: '¿Quieres que te avisemos por aquí de novedades del show, como cuando queden pocas mesas?\n1 · Sí\n2 · No',
    en: 'Want us to let you know here about news on the show, like when tables are running out?\n1 · Yes\n2 · No',
  },
  toMenu: { es: 'Responde 1 para reservar, o 0 para el menú.', en: 'Reply 1 to book, or 0 for the menu.' },
  person: {
    es: 'Perfecto. Una persona de Flamingo County te escribe por aquí lo antes posible. Mientras tanto, cuéntanos lo que necesites. (0 · menú)',
    en: 'Perfect. A person from Flamingo County will message you here as soon as possible. Meanwhile, tell us what you need. (0 · menu)',
  },
  missed: { es: 'No te entendí 🙈. Responde con un número del 1 al 5, o 0 para ver el menú.', en: 'Sorry, I didn’t get that 🙈. Reply with a number from 1 to 5, or 0 for the menu.' },
  missedTwice: {
    es: 'Te paso con una persona de Flamingo County, que te escribe por aquí en breve. (0 · menú)',
    en: 'I’m passing you to a person from Flamingo County, who’ll message you here shortly. (0 · menu)',
  },
  over: {
    es: 'Las reservas de este evento ya cerraron. ¡Gracias por escribirnos! Síguenos en @flamingo.county para el próximo.',
    en: 'Bookings for this event are closed. Thanks for writing! Follow @flamingo.county for the next one.',
  },
  none: {
    es: '¡Hola! 🦩 Esta es la línea de reservas de Flamingo County. Ahora mismo no tenemos un evento a la venta; síguenos en @flamingo.county para el próximo.',
    en: 'Hi! 🦩 This is Flamingo County’s reservations line. There’s no event on sale right now; follow @flamingo.county for the next one.',
  },
} satisfies Record<string, Both>

function booked(ev: ReservasEvent, lang: Lang, lead: Pick<HqLead, 'whatsappName' | 'tier' | 'partySize'>): string {
  const n = first(lead.whatsappName)
  const perk = ev.perk ? `\n\n🎁 ${ev.perk[lang]}` : ''
  return lang === 'en'
    ? `All set${n ? `, ${n}` : ''}! We noted *${lead.tier}* for ${lead.partySize}. A person from Flamingo County will message you here to confirm the table and the next steps. 🙌${perk}\n\nReply 0 any time for the menu.`
    : `¡Listo${n ? `, ${n}` : ''}! Anotamos *${lead.tier}* para ${lead.partySize}. Una persona de Flamingo County te escribe por aquí para confirmar la mesa y los próximos pasos. 🙌${perk}\n\nEscribe 0 cuando quieras para el menú.`
}

function tablesInfo(ev: ReservasEvent, lang: Lang): string {
  const head = lang === 'en' ? `The ${ev.tables.reduce((n, t) => n + t.count, 0)} VIP tables:` : `Las ${ev.tables.reduce((n, t) => n + t.count, 0)} mesas VIP:`
  return [head, tablesList(ev, lang, ev.tables, false), '', ev.tablesInclude[lang], ev.tablesNote[lang], '', copy.toMenu[lang]].join('\n')
}

function gaInfo(ev: ReservasEvent, lang: Lang): string {
  const link = ev.gaUrl ? `\n${ev.gaUrl}` : lang === 'en' ? '\nReply 5 and a person will send you the link.' : '\nResponde 5 y una persona te manda el link.'
  const table = lang === 'en' ? 'Rather have a table? Reply 1.' : '¿Prefieres mesa? Responde 1.'
  return `${ev.ga[lang]}${link}\n\n${table}`
}

/* --------------------------------------------------------- the bot itself */

export type LeadMessage = { at: string; from: 'them' | 'bot' | 'us'; body: string }
const KEEP_MESSAGES = 60

/** What the bot does with one message: its reply ('' = say nothing) and what changes on the lead. */
export type Turn = {
  reply: string
  set: Partial<Pick<HqLead, 'status' | 'step' | 'partySize' | 'tier' | 'optIn' | 'optInAt' | 'misses' | 'lang'>>
  /** Why the owner should look now: a table request, a person asked for, or a message while with a person. */
  alert: 'table' | 'person' | 'message' | null
}

const MENU = /^(0|men[uú]|inicio|start)$/i
const GREET = /^(hola|hi|hello|hey|buenas)\b/i
const TO_EN = /^(en|english|ingl[eé]s)$/i
const TO_ES = /^(es|espa[nñ]ol|spanish)$/i

/** A reply in the menu: "1", "1.", "1️⃣", " 1 ". Anything else is null. */
export function choice(body: string): number | null {
  const m = /^\s*(\d{1,3})(?:️?⃣)?\s*[.)]?\s*$/.exec(body)
  return m ? Number(m[1]) : null
}

/**
 * The menu as a pure function of the lead and the message, so every path is
 * testable without Twilio or a database. `fresh` = their first message, or the
 * first in over a day: they get the greeting whatever they wrote.
 */
export function nextTurn(ev: ReservasEvent, lead: Pick<HqLead, 'status' | 'step' | 'partySize' | 'tier' | 'whatsappName' | 'misses' | 'lang'>, body: string, fresh: boolean, now: Date): Turn {
  let lang: Lang = lead.lang === 'en' ? 'en' : 'es'
  const text = body.trim()
  const atMenu: Turn['set'] = { step: 'menu', misses: 0 }

  if (TO_EN.test(text) || TO_ES.test(text)) {
    lang = TO_EN.test(text) ? 'en' : 'es'
    const keep = lead.status === 'new' || lead.status === 'handoff' || lead.status === 'booked'
    return { reply: welcome(ev, lang, lead.whatsappName), set: { ...atMenu, lang, status: keep ? lead.status : 'asked' }, alert: null }
  }

  // With a person (or already booked): the bot is quiet, the owner sees it, and 0 brings the menu back.
  if (lead.status === 'handoff' || lead.status === 'booked') {
    if (MENU.test(text))
      return { reply: menu(lang), set: { ...atMenu, status: lead.status === 'booked' ? 'booked' : 'asked' }, alert: null }
    return { reply: '', set: {}, alert: 'message' }
  }

  if (fresh || MENU.test(text) || (lead.step === 'menu' && GREET.test(text))) return { reply: welcome(ev, lang, lead.whatsappName), set: { ...atMenu, status: lead.status === 'lost' ? 'asked' : lead.status }, alert: null }

  const n = choice(text)
  const miss = (): Turn => {
    const misses = (lead.misses ?? 0) + 1
    if (misses >= 2) return { reply: copy.missedTwice[lang], set: { status: 'handoff', step: 'menu', misses: 0 }, alert: 'person' }
    const again = lead.step === 'party' ? copy.badParty[lang] : lead.step === 'tier' ? copy.badTier[lang] : copy.missed[lang]
    return { reply: again, set: { misses }, alert: null }
  }

  switch (lead.step) {
    case 'party': {
      if (n === null || n < 1 || n > 500) return miss()
      const tiers = fitting(ev, n)
      if (!tiers.length) return { reply: copy.tooMany[lang], set: { partySize: n, status: 'handoff', step: 'menu', misses: 0 }, alert: 'table' }
      const head = lang === 'en' ? `For ${n} ${n === 1 ? 'person' : 'people'}, these tables work:` : `Para ${n} ${n === 1 ? 'persona' : 'personas'} te sirven estas mesas:`
      return {
        reply: [head, tablesList(ev, lang, tiers, true), '', ev.tablesNote[lang], copy.pickTier[lang]].join('\n'),
        set: { partySize: n, step: 'tier', status: 'asked', misses: 0 },
        alert: null,
      }
    }
    case 'tier': {
      const tiers = fitting(ev, lead.partySize ?? 1)
      if (n === null || n < 1 || n > tiers.length) return miss()
      return { reply: copy.askOptIn[lang], set: { tier: tiers[n - 1].name, step: 'optin', misses: 0 }, alert: null }
    }
    case 'optin': {
      if (n !== 1 && n !== 2) return miss()
      const set: Turn['set'] = { optIn: n === 1, optInAt: n === 1 ? now.toISOString() : null, status: 'handoff', step: 'menu', misses: 0 }
      return { reply: booked(ev, lang, lead), set, alert: 'table' }
    }
  }

  switch (n) {
    case 1:
      return { reply: copy.askParty[lang], set: { step: 'party', status: 'asked', misses: 0 }, alert: null }
    case 2:
      return { reply: tablesInfo(ev, lang), set: { ...atMenu, status: 'asked' }, alert: null }
    case 3:
      return { reply: gaInfo(ev, lang), set: { ...atMenu, status: 'asked' }, alert: null }
    case 4:
      return { reply: `${ev.faq[lang]}\n\n0 · ${lang === 'en' ? 'menu' : 'menú'}`, set: { ...atMenu, status: 'asked' }, alert: null }
    case 5:
      return { reply: copy.person[lang], set: { status: 'handoff', step: 'menu', misses: 0 }, alert: 'person' }
  }
  return miss()
}

/* ------------------------------------------------------------ the answer */

/**
 * Answers per number per hour. A menu conversation is a dozen messages;
 * this stops a loop with another business's auto-reply. In memory only.
 */
const PER_NUMBER_PER_HOUR = 40
const byNumber = new Map<string, { start: number; n: number }>()

export function resetReservasLimits() {
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

const testNumbers = () =>
  (process.env.PROMO_TEST_PHONES ?? '')
    .split(',')
    .map((n) => n.replace(/[^\d+]/g, ''))
    .map((n) => (n.startsWith('+') ? n : `+${n.length === 10 ? `1${n}` : n}`))
    .filter((n) => n.length > 8)

const guessLang = (body: string): Lang =>
  /\b(hi|hello|hey|book|table|tickets?|please|thanks|i'd|want)\b/i.test(body) && !/\b(hola|mesa|quiero|gracias|reservar)\b/i.test(body) ? 'en' : 'es'

const log = (lead: Pick<HqLead, 'messages'> | null, ...add: LeadMessage[]): LeadMessage[] =>
  [...((Array.isArray(lead?.messages) ? lead.messages : []) as LeadMessage[]), ...add].slice(-KEEP_MESSAGES)

const DAY = 24 * 3_600_000
const miamiDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

export type Incoming = { phone: string; name: string | null; body: string }

async function findLead(payload: Payload, event: string, phone: string): Promise<HqLead | null> {
  const { docs } = await payload.find({
    collection: 'hq-leads',
    where: { and: [{ event: { equals: event } }, { phone: { equals: phone } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs[0] ?? null
}

/** The reply to one WhatsApp message to the reservations line. '' = say nothing. */
export async function answerReservas(payload: Payload, msg: Incoming, now: Date = new Date()): Promise<string> {
  if (!underLimit(msg.phone, now.getTime())) return ''
  const ask = parseAsk(msg.body)
  const today = miamiDay(now)
  const ev = reservasEvent(ask?.slug) ?? currentEvent(today) ?? RESERVAS_EVENTS[RESERVAS_EVENTS.length - 1]
  if (!ev) return copy.none[ask?.lang ?? guessLang(msg.body)]

  let lead = await findLead(payload, ev.slug, msg.phone)
  const body = ask ? msg.body.replace(/\(?\s*ref\s*#[^)]*\)?/i, '').trim() : msg.body
  const inbound: LeadMessage = { at: now.toISOString(), from: 'them', body: msg.body.slice(0, 1000) }

  if (ev.until < today) {
    const lang: Lang = lead?.lang === 'en' ? 'en' : ask?.lang ?? guessLang(msg.body)
    if (lead) {
      await payload.update({ collection: 'hq-leads', id: lead.id, data: { lastInboundAt: inbound.at, messages: log(lead, inbound) }, overrideAccess: true })
      if (lead.status === 'handoff' || lead.status === 'booked') {
        await alertOwner(ev, { ...lead, messages: log(lead, inbound) }, 'message')
        return ''
      }
    }
    return copy.over[lang]
  }

  const fresh = !lead || !lead.lastInboundAt || now.getTime() - new Date(lead.lastInboundAt).getTime() > DAY
  if (!lead) {
    try {
      lead = await payload.create({
        collection: 'hq-leads',
        data: {
          event: ev.slug,
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
      lead = await findLead(payload, ev.slug, msg.phone)
      if (!lead) throw err
    }
  }

  const turn = nextTurn(ev, lead, body, fresh, now)
  const messages = log(lead, inbound, ...(turn.reply ? [{ at: now.toISOString(), from: 'bot' as const, body: turn.reply }] : []))
  const updated = await payload.update({
    collection: 'hq-leads',
    id: lead.id,
    data: {
      ...turn.set,
      ...(msg.name && !lead.whatsappName ? { whatsappName: msg.name.slice(0, 80) } : {}),
      lastInboundAt: inbound.at,
      messages,
    },
    overrideAccess: true,
  })
  if (turn.alert) await alertOwner(ev, updated, turn.alert)
  return turn.reply
}

/* ------------------------------------------------------- the owner's side */

/** "#L12" in an alert: replying to that Telegram message answers lead 12. */
export const leadTag = (id: number | string) => `#L${id}`

/** The last line of every lead alert, and the only thing that makes a reply to a message go out on WhatsApp. */
export const REPLY_HINT = '↩️ Responde a este mensaje y le llega por WhatsApp.'

/**
 * The lead a Telegram reply answers: only a reply to a lead alert, which names
 * exactly one lead. A reply to /leads (many leads), to a drafted reply or to a
 * "Sent" line is just a message to the bot, never a WhatsApp to a customer.
 */
export function leadFromText(text: string | undefined): number | null {
  if (!text?.includes(REPLY_HINT)) return null
  const ids = new Set([...text.matchAll(/#L(\d+)\b/g)].map((m) => m[1]))
  return ids.size === 1 ? Number([...ids][0]) : null
}

const masked = (phone: string) => phone.replace(/^(\+\d)(\d{3})\d+(\d{4})$/, '$1 ($2) •••-$3')

function lastFromThem(lead: Pick<HqLead, 'messages'>, n = 3): string {
  const mine = ((Array.isArray(lead.messages) ? lead.messages : []) as LeadMessage[]).filter((m) => m.from === 'them').slice(-n)
  return mine.map((m) => `“${esc(m.body.slice(0, 400))}”`).join('\n')
}

/** The Telegram line for a lead: who, how many, which table, where they came from. */
export function leadSummary(ev: ReservasEvent, lead: HqLead): string {
  const bits = [
    lead.partySize ? `${lead.partySize} personas` : null,
    lead.tier ? esc(lead.tier) : null,
    lead.optIn ? 'avisos: sí' : null,
    `vino de ${esc(lead.source ?? 'whatsapp')} (${lead.lang})`,
  ].filter(Boolean)
  return `<b>${leadTag(lead.id)}</b> · ${esc(lead.whatsappName ?? 'sin nombre')} · ${esc(masked(lead.phone))}${lead.test ? ' · prueba' : ''}\n${esc(ev.title.es)} · ${bits.join(' · ')}`
}

async function alertOwner(ev: ReservasEvent, lead: HqLead, why: NonNullable<Turn['alert']>): Promise<void> {
  const head = why === 'table' ? '🦩🎟️ <b>Pidió mesa</b>' : why === 'person' ? '🦩🙋 <b>Quiere hablar con una persona</b>' : '🦩💬 <b>Mensaje</b>'
  await notifyOwner(`${head}\n${leadSummary(ev, lead)}\n\n${lastFromThem(lead, why === 'message' ? 1 : 3)}\n\n<i>${REPLY_HINT}</i>`)
}

/** Twilio's REST API, for replies that aren't an answer to a webhook: the owner's, and drafts he approved. */
export async function sendWhatsApp(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = reservasNumber()
  if (!sid || !token || !from) throw new Error('The reservations line isn’t set up (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, RESERVAS_WHATSAPP_NUMBER).')
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: `whatsapp:+${from}`, To: `whatsapp:${to}`, Body: body }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const why = ((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? `HTTP ${res.status}`
    throw new Error(`Twilio refused it: ${why}`)
  }
}

/** Whether WhatsApp still lets us write to them freely: within 24 hours of their last message. */
export const inWindow = (lead: Pick<HqLead, 'lastInboundAt'>, now: Date) =>
  Boolean(lead.lastInboundAt) && now.getTime() - new Date(lead.lastInboundAt!).getTime() < DAY

/**
 * Send the owner's words to a lead and log them. The lead stays with a person
 * (status handoff) so the bot doesn't talk over him. Returns the outcome line
 * for Telegram; never throws.
 */
export async function sendToLead(payload: Payload, leadId: number, body: string, now: Date = new Date()): Promise<string> {
  const lead = await payload.findByID({ collection: 'hq-leads', id: leadId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!lead) return `No lead ${leadTag(leadId)}.`
  if (!inWindow(lead, now))
    return `⏳ ${leadTag(leadId)} wrote over 24 hours ago, and WhatsApp only allows a free reply within 24 hours of their last message. Call them at ${esc(lead.phone)}, or wait until they write again.`
  try {
    await sendWhatsApp(lead.phone, body)
  } catch (err) {
    return `❌ Not sent to ${leadTag(leadId)}: ${esc(err instanceof Error ? err.message : String(err))}`
  }
  await payload.update({
    collection: 'hq-leads',
    id: lead.id,
    data: {
      status: lead.status === 'booked' ? 'booked' : 'handoff',
      draftReply: null,
      messages: log(lead, { at: now.toISOString(), from: 'us', body: body.slice(0, 1000) }),
    },
    overrideAccess: true,
  })
  return `✅ Sent to ${esc(lead.whatsappName ?? leadTag(leadId))} ${leadTag(leadId)} on WhatsApp.`
}

/* ------------------------------------------------- Claude's drafted replies */

const draftHash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 8)

export function parseLeadCallback(data: string | undefined): { action: 'send' | 'drop'; id: number; hash: string } | null {
  const m = /^ld:([sd]):(\d+):([0-9a-f]{8})$/.exec(data ?? '')
  return m ? { action: m[1] === 's' ? 'send' : 'drop', id: Number(m[2]), hash: m[3] } : null
}

/**
 * A reply Claude wrote for a lead: saved on the lead and sent to the owner on
 * Telegram with Send / Don't. Nothing reaches the person until he taps Send.
 */
export async function draftLeadReply(payload: Payload, leadId: number, text: string, now: Date = new Date()) {
  const lead = await payload.findByID({ collection: 'hq-leads', id: leadId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!lead) throw new Error(`No lead ${leadId}.`)
  const ev = reservasEvent(lead.event)
  await payload.update({ collection: 'hq-leads', id: lead.id, data: { draftReply: text }, overrideAccess: true })
  const hash = draftHash(text)
  const window = inWindow(lead, now) ? '' : '\n⏳ <i>Over 24 hours since their last message: WhatsApp won’t take it until they write again.</i>'
  const sent = await sendMessage(
    `✍️ <b>Claude suggests a reply</b>\n${ev ? leadSummary(ev, lead) : leadTag(lead.id)}\n\n${lastFromThem(lead, 2)}\n\n<b>Reply:</b>\n${esc(text)}${window}\n\n<i>To write your own, tap Don’t and reply to the lead’s alert, or /wa ${lead.id} …</i>`,
    {
      keyboard: {
        inline_keyboard: [
          [
            { text: '✅ Send', callback_data: `ld:s:${lead.id}:${hash}` },
            { text: '✖️ Don’t', callback_data: `ld:d:${lead.id}:${hash}` },
          ],
        ],
      },
    },
  )
  return { leadId: lead.id, telegramMessageId: sent.message_id, inWindow: inWindow(lead, now) }
}

/** The owner's Send / Don't on a drafted reply. Only the draft he saw is sent. */
export async function decideLeadDraft(payload: Payload, id: number, action: 'send' | 'drop', hash: string, now: Date = new Date()): Promise<string> {
  const lead = await payload.findByID({ collection: 'hq-leads', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!lead?.draftReply || draftHash(lead.draftReply) !== hash) return `That draft for ${leadTag(id)} is gone or was replaced; nothing sent.`
  if (action === 'drop') {
    await payload.update({ collection: 'hq-leads', id, data: { draftReply: null }, overrideAccess: true })
    return `✖️ Not sent. ${leadTag(id)}`
  }
  return sendToLead(payload, id, lead.draftReply, now)
}

/** /leads in Telegram: who is waiting for a person, then the latest. */
export async function leadsReport(payload: Payload): Promise<string> {
  const { docs } = await payload.find({
    collection: 'hq-leads',
    where: { test: { not_equals: true } },
    sort: '-lastInboundAt',
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  if (!docs.length) return 'No leads yet.'
  const count = (s: HqLead['status']) => docs.filter((d) => d.status === s).length
  const waiting = docs.filter((d) => d.status === 'handoff').slice(0, 10)
  const lines = [
    `<b>Leads</b> · ${docs.length} · waiting ${count('handoff')} · booked ${count('booked')} · lost ${count('lost')}`,
    ...waiting.map((d) => `${leadTag(d.id)} ${esc(d.whatsappName ?? 'sin nombre')}${d.partySize ? ` · ${d.partySize}` : ''}${d.tier ? ` · ${esc(d.tier)}` : ''}`),
  ]
  if (waiting.length) lines.push('', '<i>Reply to any lead alert to answer it, or /wa &lt;id&gt; &lt;text&gt;.</i>')
  return lines.join('\n')
}

export { whatsappNumber }
