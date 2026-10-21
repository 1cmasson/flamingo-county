import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Payload } from 'payload'

import type { Lang } from '../i18n'
import type { Listing, PromoCoupon, Promotion } from '../payload-types'
import { dateOnly, todayISO } from './dates'
import { dayLabel, promoCopy } from './promoCopy'
import {
  displayCode,
  formatRedeemed,
  getPublishedPromotion,
  issueCoupon,
  issuedCount,
  partnerFor,
  promoOpen,
  promoState,
} from './promos'
import { routes } from './routes'
import { absUrl, SITE_URL } from './site'
import { notifyOwner } from './telegram'

/**
 * Coupons by WhatsApp, for a promotion whose `claimBy` is `whatsapp`
 * (lib/promos.ts `claimMode`): the button opens WhatsApp with a message to
 * our coupon number already written, the visitor sends it, and Twilio hands
 * it to `/api/promo/whatsapp`, whose reply carries their code.
 *
 *   "Hola, quiero mi cupón de «Postre gratis» en 1910 Restaurant & Bar.
 *    (ref #postre-1910 instagram es)"
 *
 * The message comes from their own number, so one number gets one coupon
 * (asking again sends the same one back) and the coupon knows who it went to.
 * The ref at the end says which promotion, where the button was tapped (we
 * get no referrer from WhatsApp) and in which language to answer; people can
 * edit it, so anything we can't read gets a short help reply instead.
 *
 * The reply goes back in the webhook's response (TwiML): it answers a message
 * they just sent, which WhatsApp allows, and it needs no API key to send.
 */

export const WEBHOOK_PATH = '/api/promo/whatsapp'

/** The address Twilio is given and signs: the public one, not what Railway's proxy hands the app. */
export const webhookUrl = () => `${SITE_URL}${WEBHOOK_PATH}`

/* ------------------------------------------------------------ signature */

/**
 * Twilio's X-Twilio-Signature: HMAC-SHA1 with the account's auth token, over
 * the URL followed by every POST parameter's name and value, by name.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function twilioSignature(authToken: string, url: string, params: URLSearchParams): string {
  let data = url
  for (const key of [...new Set(params.keys())].sort()) for (const value of params.getAll(key)) data += key + value
  return createHmac('sha1', authToken).update(data, 'utf8').digest('base64')
}

/** Whether a request really is Twilio's. No auth token set: nothing is. */
export function fromTwilio(params: URLSearchParams, signature: string | null, authToken = process.env.TWILIO_AUTH_TOKEN): boolean {
  if (!authToken || !signature) return false
  const expected = Buffer.from(twilioSignature(authToken, webhookUrl(), params))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/** The reply Twilio sends back on WhatsApp; empty sends nothing. */
export function twiml(reply: string): string {
  const body = reply
    ? `<Message>${reply.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Message>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`
}

/* ---------------------------------------------------------- the message */

export type Ask = { slug: string; source: string; lang: Lang | null }

/** What the promotion page puts after "#": the promotion, where they were, the language. */
export function askRef(slug: string, source: string, lang: Lang): string {
  return `#${slug} ${source} ${lang}`
}

const REF = /#([a-z0-9]+(?:-[a-z0-9]+)*)(?:[ \t]+([a-z0-9][a-z0-9.-]{0,59}))?(?:[ \t]+(es|en))?/i

/** The ref in a message, or null when there is none. */
export function parseAsk(body: string): Ask | null {
  const m = REF.exec(body)
  if (!m) return null
  const source = m[2]?.toLowerCase()
  return {
    slug: m[1].toLowerCase(),
    // A missing source, or the language read as one, is "came by WhatsApp".
    source: source && source !== 'es' && source !== 'en' ? source : 'whatsapp',
    lang: (m[3]?.toLowerCase() ?? (source === 'en' || source === 'es' ? source : null)) as Lang | null,
  }
}

/** The language to answer a message without a ref in: Spanish unless it reads as English. */
const guessLang = (body: string): Lang =>
  /\b(hi|hello|hey|coupon|please|thanks|thank you|want|i'd)\b/i.test(body) && !/\b(hola|cupón|cupon|gracias|quiero)\b/i.test(body)
    ? 'en'
    : 'es'

/** "whatsapp:+13055551234" → "+13055551234", or null for anything that isn't a WhatsApp number. */
export function whatsappNumber(from: string | null): string | null {
  const m = /^whatsapp:(\+\d{7,15})$/.exec(from?.trim() ?? '')
  return m ? m[1] : null
}

/** The first word of a WhatsApp profile name, to greet them by. */
const firstName = (name: string | null) => name?.trim().split(/\s+/)[0]?.slice(0, 30) || null

/* ----------------------------------------------------------- the answer */

/**
 * Answers per number per hour: enough for anyone asking for coupons, and an
 * end to a loop with another business's auto-reply. In memory only.
 */
const PER_NUMBER_PER_HOUR = 10
const byNumber = new Map<string, { start: number; n: number }>()

export function resetWhatsappLimits() {
  byNumber.clear()
}

function underNumberLimit(phone: string, now: number): boolean {
  const seen = byNumber.get(phone)
  if (!seen || now - seen.start >= 3_600_000) {
    if (byNumber.size > 5_000) byNumber.clear()
    byNumber.set(phone, { start: now, n: 1 })
    return true
  }
  return ++seen.n <= PER_NUMBER_PER_HOUR
}

export type IncomingMessage = { phone: string; name: string | null; body: string }

const idOf = (v: unknown): number | null =>
  typeof v === 'number' ? v : v && typeof v === 'object' && 'id' in v ? Number((v as { id: unknown }).id) : null

async function couponFor(payload: Payload, promotionId: number, phone: string): Promise<PromoCoupon | null> {
  const { docs } = await payload.find({
    collection: 'promo-coupons',
    where: { and: [{ promotion: { equals: promotionId } }, { phone: { equals: phone } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs[0] ?? null
}

const couponLink = (lang: Lang, promo: Promotion, code: string) => absUrl(routes.coupon(lang, promo.slug, code))

/**
 * The reply to one WhatsApp message: a new coupon, the one they already have,
 * why there isn't one, or what this number is for. '' means don't answer.
 */
export async function answerWhatsapp(payload: Payload, msg: IncomingMessage, now: Date = new Date()): Promise<string> {
  if (!underNumberLimit(msg.phone, now.getTime())) return ''
  const ask = parseAsk(msg.body)
  const lang: Lang = ask?.lang ?? guessLang(msg.body)
  const c = promoCopy(lang)
  const promo = ask ? await getPublishedPromotion(payload, ask.slug, lang) : null
  if (!ask || !promo) return help(payload, msg, lang, now)

  const listing = typeof promo.listing === 'object' ? (promo.listing as Listing) : null
  const place = listing?.name ?? ''
  const today = todayISO(now)

  const mine = await couponFor(payload, promo.id, msg.phone)
  if (mine) return again(mine, promo, lang)

  const state = promoState(promo, await issuedCount(payload, promo.id), today)
  if (state === 'upcoming') return c.upcoming(dayLabel(dateOnly(promo.startsOn), lang))
  if (state !== 'active') return state === 'full' ? c.full : c.ended
  const listingId = idOf(promo.listing)
  if (!listingId || !(await partnerFor(payload, listingId))) return c.soon

  let code: string
  try {
    code = await issueCoupon(payload, {
      promotion: promo.id,
      listing: listingId,
      source: ask.source,
      lang,
      channel: 'whatsapp',
      phone: msg.phone,
      whatsappName: msg.name?.slice(0, 80) || null,
      // The promotion page writes "test" for the owner's and staff's own devices.
      test: ask.source === 'test',
    })
  } catch (err) {
    // The same number asking twice at once: the other message got it.
    const raced = await couponFor(payload, promo.id, msg.phone)
    if (raced) return again(raced, promo, lang)
    throw err
  }
  const end = dateOnly(promo.endsOn)
  return c.wa.yours({
    first: firstName(msg.name),
    title: promo.title ?? '',
    place,
    code: displayCode(code),
    url: couponLink(lang, promo, code),
    through: end ? dayLabel(end, lang) : null,
  })
}

function again(coupon: PromoCoupon, promo: Promotion, lang: Lang): string {
  const c = promoCopy(lang)
  if (coupon.redeemedAt) return c.wa.usedAlready(promo.title ?? '', formatRedeemed(coupon.redeemedAt, lang))
  return c.wa.again(promo.title ?? '', displayCode(coupon.code), couponLink(lang, promo, coupon.code))
}

/**
 * A message that isn't asking for a coupon: their open coupons, if they have
 * any (a lost link is the usual reason to write), and what this number is
 * for. The owner gets it on Telegram, since nobody reads this number by hand.
 */
async function help(payload: Payload, msg: IncomingMessage, lang: Lang, now: Date): Promise<string> {
  const c = promoCopy(lang)
  const { docs } = await payload.find({
    collection: 'promo-coupons',
    where: { and: [{ phone: { equals: msg.phone } }, { redeemedAt: { exists: false } }] },
    sort: '-createdAt',
    limit: 3,
    depth: 0,
    overrideAccess: true,
  })
  const lines: string[] = []
  for (const coupon of docs) {
    const promo = await payload
      .findByID({ collection: 'promotions', id: idOf(coupon.promotion)!, locale: lang, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (promo?._status === 'published' && promoOpen(promo, todayISO(now)))
      lines.push(`«${promo.title}»: *${displayCode(coupon.code)}*\n${couponLink(lang, promo, coupon.code)}`)
  }
  await notifyOwner(`💬 Coupon WhatsApp from ${msg.name ?? 'someone'} (${msg.phone}):\n“${msg.body.slice(0, 500)}”`)
  return lines.length ? `${c.wa.yourCoupons}\n\n${lines.join('\n\n')}\n\n${c.wa.help}` : c.wa.help
}
