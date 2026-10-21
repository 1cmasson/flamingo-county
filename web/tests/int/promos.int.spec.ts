// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import {
  claimCoupon,
  displayCode,
  MAX_PIN_FAILS,
  newCode,
  normalizeCode,
  partnerDashboard,
  promoOpen,
  promoState,
  redeemCoupon,
  resetPromoLimits,
} from '@/lib/promos'
import { classifySource, normalizePath } from '@/lib/visits'

/**
 * Coupons for partner businesses (lib/promos.ts): a coupon per visitor, used
 * once with the business's PIN, locked after five wrong PINs, counted on the
 * business's dashboard without staff tests, and never kept by code in the
 * visit counter.
 */

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const browser = (extra: Record<string, string> = {}) =>
  new Headers({ 'user-agent': IPHONE, 'sec-fetch-site': 'same-origin', host: 'flamingocounty.com', ...extra })

describe('codes', () => {
  it('are six characters nobody can misread, and survive being typed or lowercased', () => {
    for (let i = 0; i < 200; i++) {
      const code = newCode()
      expect(code).toMatch(/^[2346789ABCDEFGHJKMNPQRTUVWXYZ]{6}$/)
      expect(normalizeCode(displayCode(code).toLowerCase())).toBe(code)
    }
    expect(normalizeCode('7k3-q9m')).toBe('7K3Q9M')
    expect(normalizeCode('0OIL15')).toBeNull()
    expect(normalizeCode('ABC')).toBeNull()
    expect(normalizeCode(42)).toBeNull()
  })
})

describe('promotion dates', () => {
  it('opens on its first day and closes after its last, Miami time', () => {
    const p = { startsOn: '2026-10-22T12:00:00.000Z', endsOn: '2026-10-31T12:00:00.000Z', limit: 2 }
    expect(promoState(p, 0, '2026-10-21')).toBe('upcoming')
    expect(promoState(p, 0, '2026-10-22')).toBe('active')
    expect(promoState(p, 0, '2026-10-31')).toBe('active')
    expect(promoState(p, 0, '2026-11-01')).toBe('ended')
    expect(promoState(p, 2, '2026-10-25')).toBe('full')
    expect(promoOpen(p, '2026-10-31')).toBe(true)
    expect(promoOpen(p, '2026-11-01')).toBe(false)
    expect(promoState({ startsOn: null, endsOn: null, limit: null }, 1_000, '2030-01-01')).toBe('active')
  })
})

describe('the visit counter', () => {
  it('keeps the page but never a coupon code or a dashboard key', () => {
    expect(normalizePath('/es/promo/postre-gratis/c/7K3Q9M')).toBe('/es/promo/postre-gratis/c')
    expect(normalizePath('/en/partner/abcdefghijklmnopqrstuvwx')).toBe('/en/partner')
    expect(normalizePath('/es/promo/postre-gratis')).toBe('/es/promo/postre-gratis')
  })

  it('names the business page banner as the site itself', () => {
    expect(classifySource(null, 'site')).toBe('site')
  })
})

describe('coupons', () => {
  let payload: Payload
  const made: { collection: 'cities' | 'categories' | 'listings' | 'promotions' | 'partners'; id: number }[] = []
  let listingId: number
  let partnerKey: string
  const PIN = '4821'
  const slug = `promo-test-${Date.now()}`

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const city = await payload.create({
      collection: 'cities',
      data: { slug: `${slug}-city`, name: 'Test City' } as never,
      overrideAccess: true,
    })
    made.push({ collection: 'cities', id: city.id })
    const category = await payload.create({
      collection: 'categories',
      data: { slug: `${slug}-cat`, label: 'Test' } as never,
      overrideAccess: true,
    })
    made.push({ collection: 'categories', id: category.id })
    const listing = await payload.create({
      collection: 'listings',
      data: { slug: `${slug}-biz`, name: 'Test Bistro', city: city.id, category: category.id, _status: 'published' } as never,
      overrideAccess: true,
    })
    listingId = listing.id
    made.push({ collection: 'listings', id: listing.id })
    const partner = await payload.create({
      collection: 'partners',
      data: { name: 'Test Bistro', listing: listing.id, staffPin: PIN },
      overrideAccess: true,
    })
    partnerKey = partner.dashboardKey!
    made.push({ collection: 'partners', id: partner.id })
    const promo = await payload.create({
      collection: 'promotions',
      data: { slug, listing: listing.id, title: 'Free dessert', limit: 3, _status: 'published' },
      overrideAccess: true,
    })
    made.push({ collection: 'promotions', id: promo.id })
  })

  beforeEach(() => resetPromoLimits())

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'promo-coupons', where: { listing: { equals: listingId } }, overrideAccess: true })
    for (const { collection, id } of made.reverse()) {
      await payload.delete({ collection, id, overrideAccess: true }).catch(() => undefined)
    }
  })

  it('mints a partner dashboard key on its own', () => {
    expect(partnerKey).toMatch(/^[A-Za-z0-9_-]{24}$/)
  })

  it('keeps the dashboard key when only the PIN changes, and issues a new one when cleared', async () => {
    const partner = made.find((m) => m.collection === 'partners')!
    const pinOnly = await payload.update({ collection: 'partners', id: partner.id, data: { staffPin: '7777' }, overrideAccess: true })
    expect(pinOnly.dashboardKey).toBe(partnerKey)
    const cleared = await payload.update({ collection: 'partners', id: partner.id, data: { dashboardKey: '' }, overrideAccess: true })
    expect(cleared.dashboardKey).toMatch(/^[A-Za-z0-9_-]{24}$/)
    expect(cleared.dashboardKey).not.toBe(partnerKey)
    partnerKey = cleared.dashboardKey!
    await payload.update({ collection: 'partners', id: partner.id, data: { staffPin: PIN }, overrideAccess: true })
  })

  it('hands out no coupons until the business has its PIN', async () => {
    const city = made.find((m) => m.collection === 'cities')!
    const category = made.find((m) => m.collection === 'categories')!
    const other = await payload.create({
      collection: 'listings',
      data: { slug: `${slug}-nopin`, name: 'No PIN Yet', city: city.id, category: category.id, _status: 'published' } as never,
      overrideAccess: true,
    })
    made.push({ collection: 'listings', id: other.id })
    const promo = await payload.create({
      collection: 'promotions',
      data: { slug: `${slug}-nopin`, listing: other.id, title: 'Free coffee', _status: 'published' },
      overrideAccess: true,
    })
    made.push({ collection: 'promotions', id: promo.id })
    expect(await claimCoupon(payload, { slug: `${slug}-nopin` }, browser())).toMatchObject({ ok: false, reason: 'not-ready' })
  })

  it('refuses a price in the offer', async () => {
    await expect(
      payload.create({
        collection: 'promotions',
        data: { slug: `${slug}-price`, listing: listingId, title: '$5 off any entrée' },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('hands out a coupon with where the visitor came from, and nothing identifying', async () => {
    const out = await claimCoupon(payload, { slug, lang: 'es', utm: 'ig' }, browser({ 'cf-connecting-ip': '203.0.113.9' }))
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const { docs } = await payload.find({ collection: 'promo-coupons', where: { code: { equals: out.code } }, overrideAccess: true })
    expect(docs[0]).toMatchObject({ source: 'instagram', lang: 'es', test: false, listing: expect.anything() })
    expect(JSON.stringify(docs[0])).not.toMatch(/203\.0\.113|iPhone/)
  })

  it('refuses bots, other sites and unknown promotions', async () => {
    expect(await claimCoupon(payload, { slug }, browser({ 'user-agent': 'facebookexternalhit/1.1' }))).toMatchObject({ ok: false, reason: 'refused' })
    expect(await claimCoupon(payload, { slug }, browser({ 'sec-fetch-site': 'cross-site' }))).toMatchObject({ ok: false, reason: 'refused' })
    expect(await claimCoupon(payload, { slug: 'nope-nope' }, browser())).toMatchObject({ ok: false, reason: 'not-found' })
    expect(await claimCoupon(payload, { slug: '../etc' }, browser())).toMatchObject({ ok: false, reason: 'not-found' })
  })

  it('marks a staff device’s coupon as a test, left out of the limit', async () => {
    const out = await claimCoupon(payload, { slug }, browser({ cookie: 'fc-self=1' }))
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const { docs } = await payload.find({ collection: 'promo-coupons', where: { code: { equals: out.code } }, overrideAccess: true })
    expect(docs[0].test).toBe(true)
  })

  it('is used once, with the business’s PIN only', async () => {
    const out = await claimCoupon(payload, { slug }, browser())
    if (!out.ok) throw new Error('no coupon')
    expect(await redeemCoupon(payload, { code: out.code, pin: '0000' })).toEqual({ status: 'wrong-pin', triesLeft: MAX_PIN_FAILS - 1 })
    const first = await redeemCoupon(payload, { code: displayCode(out.code).toLowerCase(), pin: PIN })
    expect(first.status).toBe('redeemed')
    const again = await redeemCoupon(payload, { code: out.code, pin: PIN })
    expect(again).toMatchObject({ status: 'used', at: (first as { at: string }).at })
  })

  it('locks after five wrong PINs, even for the right one after', async () => {
    resetPromoLimits()
    const out = await claimCoupon(payload, { slug }, browser())
    if (!out.ok) throw new Error('no coupon')
    for (let i = 1; i < MAX_PIN_FAILS; i++) {
      expect((await redeemCoupon(payload, { code: out.code, pin: '1111' })).status).toBe('wrong-pin')
    }
    expect(await redeemCoupon(payload, { code: out.code, pin: '1111' })).toEqual({ status: 'locked' })
    expect(await redeemCoupon(payload, { code: out.code, pin: PIN })).toEqual({ status: 'locked' })
  })

  it('stops handing out coupons at its limit', async () => {
    // Three real coupons so far (one test coupon doesn't count): the limit is 3.
    expect(await claimCoupon(payload, { slug }, browser())).toMatchObject({ ok: false, reason: 'full' })
  })

  it('shows the business its numbers, without staff tests', async () => {
    const dash = await partnerDashboard(payload, partnerKey, 'es')
    expect(dash).not.toBeNull()
    expect(dash!.totals).toMatchObject({ taken: 3, used: 1, usedToday: 1, usedThisWeek: 1 })
    expect(dash!.promotions[0]).toMatchObject({ state: 'full', stats: { taken: 3, used: 1 } })
    expect(dash!.sources).toEqual(expect.arrayContaining([{ source: 'instagram', taken: 1, used: 0 }]))
    expect(dash!.recent).toHaveLength(1)
    expect(await partnerDashboard(payload, 'x'.repeat(24), 'es')).toBeNull()
    expect(await partnerDashboard(payload, 'short', 'es')).toBeNull()
  })

  it('cannot be used once its promotion is over', async () => {
    const promo = made.find((m) => m.collection === 'promotions')!
    const coupon = await payload.create({
      collection: 'promo-coupons',
      data: { code: newCode(), promotion: promo.id, listing: listingId, source: 'direct' },
      overrideAccess: true,
    })
    await payload.update({ collection: 'promotions', id: promo.id, data: { endsOn: '2026-10-31T12:00:00.000Z' }, overrideAccess: true })
    expect(await redeemCoupon(payload, { code: coupon.code, pin: PIN }, new Date('2026-11-01T15:00:00Z'))).toEqual({ status: 'ended' })
    // Its last day counts, to midnight in Miami (04:00 UTC the next day).
    expect(await redeemCoupon(payload, { code: coupon.code, pin: PIN }, new Date('2026-11-01T03:30:00Z'))).toEqual({
      status: 'redeemed',
      at: '2026-11-01T03:30:00.000Z',
    })
  })
})
