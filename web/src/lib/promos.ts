import { randomInt, timingSafeEqual } from 'node:crypto'
import type { Payload } from 'payload'

import type { Listing, Partner, PromoCoupon, Promotion } from '../payload-types'
import { PUBLISHED } from '../fields/shared'
import { addDays, dateOnly, SITE_TZ, todayISO, weekday } from './dates'
import { notifyOwner } from './telegram'
import { isBot, isSourceSlug } from './tracking'
import { classifySource, isStaff, normalizeHost } from './visits'

/**
 * Coupons for partner businesses: promotions that track whether people use
 * them, with nothing for the visitor to install or sign up for and nothing
 * for the business to set up but a PIN.
 *
 *   1. A visitor opens a promotion (/es/promo/<slug>) and taps "Get my
 *      coupon". They get their own one-time code and a page for it
 *      (/es/promo/<slug>/c/<code>), which they can save to WhatsApp.
 *   2. At the business they show it. Staff tap "Staff: mark as used" on the
 *      visitor's phone and type their 4-digit PIN (`partners`). The coupon
 *      turns green with the time and who marked it, and can never be used
 *      again.
 *   3. The business sees what came in on its private dashboard
 *      (/es/partner/<key>): taken, used, from where, by whom.
 *
 * A promotion can instead hand coupons out by WhatsApp (lib/promoWhatsapp.ts):
 * the button opens a ready message to our number and the reply carries the
 * code, so one number gets one coupon and we know who came.
 *
 * A website coupon stores its code, its promotion, where the visitor came from
 * and when it was used: no name, phone, email, IP or cookie (`promo-coupons`).
 * The PIN only has to stop a visitor marking their own coupon used, and a
 * used coupon gives nothing away, so four digits are enough with a lock after
 * five wrong tries per coupon and a Telegram warning when one business sees
 * many.
 */

/** No 0/O, 1/I/L or 5/S: staff read the code off a phone, sometimes aloud. */
const ALPHABET = '2346789ABCDEFGHJKMNPQRTUVWXYZ'
const CODE_LENGTH = 6
const CODE = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`)

export const MAX_PIN_FAILS = 5

/** Flamingo County's WhatsApp Business number, where "Save to WhatsApp" sends the coupon. */
export const WHATSAPP_NUMBER = '17869774602'

export function newCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)]
  return code
}

/** A code as typed or as it sits in a URL ("7k3-q9m"), or null. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.toUpperCase().replace(/[^0-9A-Z]/g, '')
  return CODE.test(code) ? code : null
}

/** "7K3Q9M" → "7K3 Q9M": two halves are easier to read off a screen. */
export const displayCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`

export type PromoState = 'upcoming' | 'active' | 'ended' | 'full'

type Dates = Pick<Promotion, 'startsOn' | 'endsOn'>

/** Whether a coupon can still be used today: from the first day to the last, Miami time. */
export function promoOpen(p: Dates, today: string = todayISO()): boolean {
  const start = dateOnly(p.startsOn)
  const end = dateOnly(p.endsOn)
  return (!start || start <= today) && (!end || today <= end)
}

/** Whether a new coupon can be handed out: open, and under its limit. */
export function promoState(p: Dates & Pick<Promotion, 'limit'>, issued: number, today: string = todayISO()): PromoState {
  const start = dateOnly(p.startsOn)
  const end = dateOnly(p.endsOn)
  if (start && today < start) return 'upcoming'
  if (end && today > end) return 'ended'
  if (p.limit && issued >= p.limit) return 'full'
  return 'active'
}

const idOf = (v: unknown): number | null =>
  typeof v === 'number' ? v : v && typeof v === 'object' && 'id' in v ? Number((v as { id: unknown }).id) : null

export async function getPublishedPromotion(payload: Payload, slug: string, lang?: 'es' | 'en'): Promise<Promotion | null> {
  const { docs } = await payload.find({
    collection: 'promotions',
    where: { and: [PUBLISHED, { slug: { equals: slug } }] },
    locale: lang,
    limit: 1,
    depth: 2,
    overrideAccess: true,
  })
  return docs[0] ?? null
}

/**
 * The WhatsApp number coupons are asked for on (digits only), or null until
 * Twilio sends that number's messages to the site: without the auth token we
 * couldn't tell Twilio's requests from anyone's, and nobody would get a reply.
 */
export function couponWhatsApp(): string | null {
  const number = process.env.PROMO_WHATSAPP_NUMBER?.replace(/\D/g, '')
  return number && process.env.TWILIO_AUTH_TOKEN ? number : null
}

/** How this promotion hands out coupons right now: by WhatsApp only once that number is connected. */
export function claimMode(p: Pick<Promotion, 'claimBy'>): 'web' | 'whatsapp' {
  return p.claimBy === 'whatsapp' && couponWhatsApp() ? 'whatsapp' : 'web'
}

/** Coupons handed out for a promotion, staff tests left out. */
export async function issuedCount(payload: Payload, promotionId: number): Promise<number> {
  const { totalDocs } = await payload.count({
    collection: 'promo-coupons',
    where: { and: [{ promotion: { equals: promotionId } }, { test: { not_equals: true } }] },
    overrideAccess: true,
  })
  return totalDocs
}

/** Whether a business has any PIN its staff can type. */
const hasPin = (p: Partner) => Boolean(p.staffPin || p.staff?.some((s) => s.pin))

/** The business's PIN row, or null: without a PIN nobody can mark its coupons used. */
export async function partnerFor(payload: Payload, listingId: number | null): Promise<Partner | null> {
  if (!listingId) return null
  const { docs } = await payload.find({
    collection: 'partners',
    where: { listing: { equals: listingId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs[0] && hasPin(docs[0]) ? docs[0] : null
}

/* -------------------------------------------------------------- claiming */

/**
 * Claims a minute from one address, and in all. The address is only a key
 * in memory for the minute; it is never stored.
 */
const PER_ADDRESS_PER_HOUR = 20
const PER_MINUTE = 60
const byAddress = new Map<string, { start: number; n: number }>()
let minuteStart = 0
let inMinute = 0

export function resetPromoLimits() {
  byAddress.clear()
  minuteStart = 0
  inMinute = 0
  pinFailsByPartner.clear()
}

function underClaimLimit(headers: Headers, now: number): boolean {
  if (now - minuteStart >= 60_000) {
    minuteStart = now
    inMinute = 0
  }
  if (++inMinute > PER_MINUTE) return false
  const addr = (headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0] ?? '').trim()
  if (!addr) return true
  const seen = byAddress.get(addr)
  if (!seen || now - seen.start >= 3_600_000) {
    if (byAddress.size > 5_000) byAddress.clear()
    byAddress.set(addr, { start: now, n: 1 })
    return true
  }
  return ++seen.n <= PER_ADDRESS_PER_HOUR
}

export type ClaimInput = { slug?: unknown; lang?: unknown; ref?: unknown; utm?: unknown }
export type ClaimResult =
  | { ok: true; code: string; slug: string }
  | { ok: false; reason: 'not-found' | 'upcoming' | 'ended' | 'full' | 'not-ready' | 'refused' | 'busy' }

/**
 * Hand out one coupon. Where the visitor came from is worked out like the
 * visit counter's (`classifySource`): the /go/ links' utm_source first, then
 * the referring site. Staff and owner devices still get a working coupon, to
 * try it, but it is marked `test` and left out of every count.
 */
export async function claimCoupon(
  payload: Payload,
  input: ClaimInput,
  headers: Headers,
  now: number = Date.now(),
): Promise<ClaimResult> {
  const slug = typeof input.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) ? input.slug : null
  if (!slug) return { ok: false, reason: 'not-found' }
  if (isBot(headers.get('user-agent'))) return { ok: false, reason: 'refused' }
  const site = headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return { ok: false, reason: 'refused' }
  if (!underClaimLimit(headers, now)) return { ok: false, reason: 'busy' }

  const promo = await getPublishedPromotion(payload, slug)
  if (!promo) return { ok: false, reason: 'not-found' }
  // A WhatsApp promotion is one per number; an anonymous coupon would go around that.
  if (claimMode(promo) === 'whatsapp') return { ok: false, reason: 'refused' }
  const state = promoState(promo, await issuedCount(payload, promo.id), todayISO(new Date(now)))
  if (state !== 'active') return { ok: false, reason: state }

  const listing = idOf(promo.listing)
  if (!listing) return { ok: false, reason: 'not-found' }
  // A coupon the business can't mark used would strand the visitor at the table.
  if (!(await partnerFor(payload, listing))) return { ok: false, reason: 'not-ready' }
  const utm = typeof input.utm === 'string' && isSourceSlug(input.utm.toLowerCase()) ? input.utm : null
  const ref = normalizeHost(input.ref)
  const own = normalizeHost(headers.get('x-forwarded-host') ?? headers.get('host'))
  const source = classifySource(ref && ref !== own ? ref : null, utm)
  const lang = input.lang === 'en' ? 'en' : 'es'
  const test = isStaff(headers)

  const code = await issueCoupon(payload, { promotion: promo.id, listing, source, lang, test })
  return { ok: true, code, slug }
}

type NewCoupon = Omit<PromoCoupon, 'id' | 'code' | 'createdAt' | 'updatedAt'>

/** Store a coupon under a fresh code, and return the code. */
export async function issueCoupon(payload: Payload, data: NewCoupon): Promise<string> {
  // A clash is one in 600 million per pair; try again rather than fail.
  for (let attempt = 0; ; attempt++) {
    const code = newCode()
    try {
      await payload.create({ collection: 'promo-coupons', data: { ...data, code }, overrideAccess: true })
      return code
    } catch (err) {
      // Also the same number asking twice at once (one per number): the caller looks for that one.
      if (attempt === 3) throw err
    }
  }
}

/* ------------------------------------------------------------- redeeming */

export type CouponView = {
  coupon: PromoCoupon
  promotion: Promotion
  listing: Listing | null
}

/** A coupon with its promotion and business, or null. */
export async function getCoupon(payload: Payload, rawCode: unknown, lang?: 'es' | 'en'): Promise<CouponView | null> {
  const code = normalizeCode(rawCode)
  if (!code) return null
  const { docs } = await payload.find({
    collection: 'promo-coupons',
    where: { code: { equals: code } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const coupon = docs[0]
  if (!coupon) return null
  const promotion = await payload
    .findByID({ collection: 'promotions', id: idOf(coupon.promotion)!, locale: lang, depth: 2, overrideAccess: true })
    .catch(() => null)
  if (!promotion || promotion._status !== 'published') return null
  const listing = typeof promotion.listing === 'object' ? promotion.listing : null
  return { coupon, promotion, listing }
}

export type RedeemResult =
  | { status: 'redeemed'; at: string }
  | { status: 'used'; at: string }
  | { status: 'wrong-pin'; triesLeft: number }
  | { status: 'locked' | 'ended' | 'not-found' | 'not-ready' }

/** Wrong PINs per business in the last hour, to warn the owner once. */
const PIN_ALERT_AT = 10
const pinFailsByPartner = new Map<number, { start: number; n: number; warned: boolean }>()

function samePin(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Whose PIN this is: a staff member's name, '' for the shared business PIN,
 * or null for none. Every PIN is compared, so the time doesn't tell which
 * one matched.
 */
export function pinOwner(partner: Partner, pin: string): string | null {
  let who: string | null = null
  for (const s of partner.staff ?? []) if (s.pin && samePin(pin, s.pin) && who === null) who = s.name
  if (partner.staffPin && samePin(pin, partner.staffPin) && who === null) who = ''
  return who
}

/**
 * Mark a coupon used, if the PIN is one of the business's, and keep whose it
 * was (`redeemedBy`, the name as it is today). Used once only: the
 * update is conditional on it not being used yet, so two taps at the same
 * moment can't both succeed.
 */
export async function redeemCoupon(
  payload: Payload,
  input: { code?: unknown; pin?: unknown },
  now: Date = new Date(),
): Promise<RedeemResult> {
  const view = await getCoupon(payload, input.code)
  if (!view) return { status: 'not-found' }
  const { coupon, promotion } = view
  if (coupon.redeemedAt) return { status: 'used', at: coupon.redeemedAt }
  if ((coupon.pinFails ?? 0) >= MAX_PIN_FAILS) return { status: 'locked' }
  if (!promoOpen(promotion, todayISO(now))) return { status: 'ended' }

  const partner = await partnerFor(payload, idOf(coupon.listing))
  if (!partner) return { status: 'not-ready' }

  const pin = typeof input.pin === 'string' ? input.pin.trim() : ''
  const by = pinOwner(partner, pin)
  if (by === null) {
    const fails = (coupon.pinFails ?? 0) + 1
    await payload.update({ collection: 'promo-coupons', id: coupon.id, data: { pinFails: fails }, overrideAccess: true })
    await warnOnPinFails(partner, now.getTime())
    return fails >= MAX_PIN_FAILS ? { status: 'locked' } : { status: 'wrong-pin', triesLeft: MAX_PIN_FAILS - fails }
  }

  const at = now.toISOString()
  const { docs: updated } = await payload.update({
    collection: 'promo-coupons',
    where: { and: [{ id: { equals: coupon.id } }, { redeemedAt: { exists: false } }] },
    data: { redeemedAt: at, redeemedBy: by || null },
    overrideAccess: true,
  })
  if (!updated.length) {
    const again = await payload.findByID({ collection: 'promo-coupons', id: coupon.id, depth: 0, overrideAccess: true })
    return { status: 'used', at: again.redeemedAt ?? at }
  }
  return { status: 'redeemed', at }
}

async function warnOnPinFails(partner: Partner, now: number) {
  const seen = pinFailsByPartner.get(partner.id)
  const entry = !seen || now - seen.start >= 3_600_000 ? { start: now, n: 0, warned: false } : seen
  entry.n += 1
  pinFailsByPartner.set(partner.id, entry)
  if (entry.n >= PIN_ALERT_AT && !entry.warned) {
    entry.warned = true
    await notifyOwner(
      `⚠️ ${entry.n} wrong coupon PINs for ${partner.name} in the last hour. If staff aren’t mistyping it, change the PIN in Partners.`,
    )
  }
}

/* ------------------------------------------------------------- dashboard */

export type PartnerStats = {
  taken: number
  used: number
  usedToday: number
  usedThisWeek: number
}

export type PartnerDashboard = {
  partner: Partner
  listing: Listing | null
  totals: PartnerStats
  promotions: { promotion: Promotion; state: PromoState; stats: PartnerStats }[]
  sources: { source: string; taken: number; used: number }[]
  /** Coupons each staff member marked used; '' is the shared business PIN. */
  staff: { name: string; used: number }[]
  recent: {
    code: string
    promotion: string
    redeemedAt: string
    source: string
    redeemedBy: string | null
    /** WhatsApp coupons: "María · •••1234". The business never sees the whole number. */
    customer: string | null
  }[]
}

/** "María Pérez", "+13055551234" → "María · •••1234". */
export function maskedCustomer(name: string | null | undefined, phone: string | null | undefined): string | null {
  if (!phone) return null
  const first = name?.trim().split(/\s+/)[0]
  const tail = `•••${phone.slice(-4)}`
  return first ? `${first} · ${tail}` : tail
}

/** Miami's calendar day for an instant. */
const miamiDay = (iso: string) => todayISO(new Date(iso))

/** The Monday of the Miami week that holds `today`. */
const mondayOf = (today: string) => addDays(today, -((weekday(today) + 6) % 7))

function stats(coupons: PromoCoupon[], today: string): PartnerStats {
  const monday = mondayOf(today)
  const used = coupons.filter((c) => c.redeemedAt)
  return {
    taken: coupons.length,
    used: used.length,
    usedToday: used.filter((c) => miamiDay(c.redeemedAt!) === today).length,
    usedThisWeek: used.filter((c) => miamiDay(c.redeemedAt!) >= monday).length,
  }
}

const KEY = /^[A-Za-z0-9_-]{20,64}$/

/** What a business sees on its dashboard, or null for a key that isn't one. */
export async function partnerDashboard(
  payload: Payload,
  key: string,
  lang: 'es' | 'en',
  today: string = todayISO(),
): Promise<PartnerDashboard | null> {
  if (!KEY.test(key)) return null
  const { docs } = await payload.find({
    collection: 'partners',
    where: { dashboardKey: { equals: key } },
    limit: 1,
    depth: 1,
    locale: lang,
    overrideAccess: true,
  })
  const partner = docs[0]
  if (!partner) return null
  const listingId = idOf(partner.listing)
  const listing = typeof partner.listing === 'object' ? partner.listing : null

  const [{ docs: promos }, { docs: coupons }] = await Promise.all([
    payload.find({
      collection: 'promotions',
      where: { and: [PUBLISHED, { listing: { equals: listingId } }] },
      locale: lang,
      limit: 50,
      depth: 0,
      sort: '-createdAt',
      overrideAccess: true,
    }),
    payload.find({
      collection: 'promo-coupons',
      where: { and: [{ listing: { equals: listingId } }, { test: { not_equals: true } }] },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const byPromo = new Map<number, PromoCoupon[]>()
  for (const c of coupons) {
    const id = idOf(c.promotion)!
    byPromo.set(id, [...(byPromo.get(id) ?? []), c])
  }
  const bySource = new Map<string, { taken: number; used: number }>()
  for (const c of coupons) {
    const s = bySource.get(c.source ?? 'direct') ?? { taken: 0, used: 0 }
    s.taken += 1
    if (c.redeemedAt) s.used += 1
    bySource.set(c.source ?? 'direct', s)
  }
  const titles = new Map(promos.map((p) => [p.id, p.title ?? '']))
  const byStaff = new Map<string, number>()
  for (const c of coupons) if (c.redeemedAt) byStaff.set(c.redeemedBy ?? '', (byStaff.get(c.redeemedBy ?? '') ?? 0) + 1)

  return {
    partner,
    listing,
    totals: stats(coupons, today),
    promotions: promos.map((p) => {
      const mine = byPromo.get(p.id) ?? []
      return { promotion: p, state: promoState(p, mine.length, today), stats: stats(mine, today) }
    }),
    sources: [...bySource].map(([source, s]) => ({ source, ...s })).sort((a, b) => b.taken - a.taken),
    staff: [...byStaff].map(([name, used]) => ({ name, used })).sort((a, b) => b.used - a.used),
    recent: coupons
      .filter((c) => c.redeemedAt)
      .sort((a, b) => b.redeemedAt!.localeCompare(a.redeemedAt!))
      .slice(0, 25)
      .map((c) => ({
        code: c.code,
        promotion: titles.get(idOf(c.promotion)!) ?? '',
        redeemedAt: c.redeemedAt!,
        source: c.source ?? 'direct',
        redeemedBy: c.redeemedBy ?? null,
        customer: maskedCustomer(c.whatsappName, c.phone),
      })),
  }
}

/** Used in the last few minutes: staff just marked it, so the page says "Done!". */
export function justUsed(redeemedAt: string, now: number = Date.now()): boolean {
  return now - Date.parse(redeemedAt) < 3 * 60_000
}

/** "Oct 20, 7:42 PM" / "20 oct, 7:42 p. m." in Miami time. */
export function formatRedeemed(iso: string, lang: 'es' | 'en'): string {
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', {
    timeZone: SITE_TZ,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}
