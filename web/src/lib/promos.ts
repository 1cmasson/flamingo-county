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
 *      visitor's phone and type the business's 4-digit PIN (`partners`). The
 *      coupon turns green with the time, and can never be used again.
 *   3. The business sees what came in on its private dashboard
 *      (/es/partner/<key>): taken, used, from where.
 *
 * A coupon stores its code, its promotion, where the visitor came from and
 * when it was used: no name, phone, email, IP or cookie (see `promo-coupons`).
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

/** Coupons handed out for a promotion, staff tests left out. */
export async function issuedCount(payload: Payload, promotionId: number): Promise<number> {
  const { totalDocs } = await payload.count({
    collection: 'promo-coupons',
    where: { and: [{ promotion: { equals: promotionId } }, { test: { not_equals: true } }] },
    overrideAccess: true,
  })
  return totalDocs
}

/** The business's PIN row, or null: without one nobody can mark its coupons used. */
export async function partnerFor(payload: Payload, listingId: number | null): Promise<Partner | null> {
  if (!listingId) return null
  const { docs } = await payload.find({
    collection: 'partners',
    where: { listing: { equals: listingId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs[0]?.staffPin ? docs[0] : null
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

  // A clash is one in 600 million per pair; try again rather than fail.
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = newCode()
    try {
      await payload.create({
        collection: 'promo-coupons',
        data: { code, promotion: promo.id, listing, source, lang, test },
        overrideAccess: true,
      })
      return { ok: true, code, slug }
    } catch (err) {
      if (attempt === 3) throw err
    }
  }
  return { ok: false, reason: 'busy' }
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
 * Mark a coupon used, if the PIN is the business's. Used once only: the
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
  if (!partner?.staffPin) return { status: 'not-ready' }

  const pin = typeof input.pin === 'string' ? input.pin.trim() : ''
  if (!samePin(pin, partner.staffPin)) {
    const fails = (coupon.pinFails ?? 0) + 1
    await payload.update({ collection: 'promo-coupons', id: coupon.id, data: { pinFails: fails }, overrideAccess: true })
    await warnOnPinFails(partner, now.getTime())
    return fails >= MAX_PIN_FAILS ? { status: 'locked' } : { status: 'wrong-pin', triesLeft: MAX_PIN_FAILS - fails }
  }

  const at = now.toISOString()
  const { docs: updated } = await payload.update({
    collection: 'promo-coupons',
    where: { and: [{ id: { equals: coupon.id } }, { redeemedAt: { exists: false } }] },
    data: { redeemedAt: at },
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
  recent: { code: string; promotion: string; redeemedAt: string; source: string }[]
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

  return {
    partner,
    listing,
    totals: stats(coupons, today),
    promotions: promos.map((p) => {
      const mine = byPromo.get(p.id) ?? []
      return { promotion: p, state: promoState(p, mine.length, today), stats: stats(mine, today) }
    }),
    sources: [...bySource].map(([source, s]) => ({ source, ...s })).sort((a, b) => b.taken - a.taken),
    recent: coupons
      .filter((c) => c.redeemedAt)
      .sort((a, b) => b.redeemedAt!.localeCompare(a.redeemedAt!))
      .slice(0, 25)
      .map((c) => ({
        code: c.code,
        promotion: titles.get(idOf(c.promotion)!) ?? '',
        redeemedAt: c.redeemedAt!,
        source: c.source ?? 'direct',
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
