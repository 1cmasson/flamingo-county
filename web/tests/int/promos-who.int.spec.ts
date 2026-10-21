// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { claimCoupon, claimMode, maskedCustomer, partnerDashboard, partnerFor, redeemCoupon, resetPromoLimits } from '@/lib/promos'
import {
  answerWhatsapp,
  askRef,
  fromTwilio,
  parseAsk,
  resetWhatsappLimits,
  twilioSignature,
  twiml,
  webhookUrl,
  whatsappNumber,
} from '@/lib/promoWhatsapp'
import { POST } from '@/app/api/promo/whatsapp/route'

/**
 * Knowing who: each waiter's own PIN on the coupons they mark, and coupons
 * asked for on WhatsApp, one per number, answered only for Twilio.
 */

const TOKEN = 'test-auth-token'
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const browser = () => new Headers({ 'user-agent': IPHONE, 'sec-fetch-site': 'same-origin', host: 'flamingocounty.com' })

function connect(on: boolean) {
  if (on) {
    process.env.TWILIO_AUTH_TOKEN = TOKEN
    process.env.PROMO_WHATSAPP_NUMBER = '+1 (762) 465-1899'
  } else {
    delete process.env.TWILIO_AUTH_TOKEN
    delete process.env.PROMO_WHATSAPP_NUMBER
  }
}

describe('Twilio signatures', () => {
  it('match Twilio’s own documented example', () => {
    const params = new URLSearchParams({
      CallSid: 'CA1234567890ABCDE',
      Caller: '+12349013030',
      Digits: '1234',
      From: '+12349013030',
      To: '+18005551212',
    })
    expect(twilioSignature('12345', 'https://mycompany.com/myapp.php?foo=1&bar=2', params)).toBe('0/KCTR6DLpKmkAf8muzZqo1nDgQ=')
  })

  it('accept Twilio’s request only, and nothing without a token', () => {
    const params = new URLSearchParams({ From: 'whatsapp:+13055551234', Body: 'hola' })
    const sig = twilioSignature(TOKEN, webhookUrl(), params)
    expect(fromTwilio(params, sig, TOKEN)).toBe(true)
    expect(fromTwilio(new URLSearchParams({ From: 'whatsapp:+13055550000', Body: 'hola' }), sig, TOKEN)).toBe(false)
    expect(fromTwilio(params, sig, 'another-token')).toBe(false)
    expect(fromTwilio(params, null, TOKEN)).toBe(false)
    expect(fromTwilio(params, sig, undefined)).toBe(false)
  })
})

describe('the WhatsApp message', () => {
  it('reads the ref the promotion page wrote, and survives edits', () => {
    expect(parseAsk(`Hola, quiero mi cupón.\n\n(ref ${askRef('postre-1910', 'instagram', 'es')})`)).toEqual({
      slug: 'postre-1910',
      source: 'instagram',
      lang: 'es',
    })
    expect(parseAsk('ref #POSTRE-1910 en')).toEqual({ slug: 'postre-1910', source: 'whatsapp', lang: 'en' })
    expect(parseAsk('#postre-1910')).toEqual({ slug: 'postre-1910', source: 'whatsapp', lang: null })
    expect(parseAsk('¿Tienen mesa para 4?')).toBeNull()
  })

  it('takes WhatsApp numbers only', () => {
    expect(whatsappNumber('whatsapp:+13055551234')).toBe('+13055551234')
    expect(whatsappNumber('+13055551234')).toBeNull()
    expect(whatsappNumber(null)).toBeNull()
  })

  it('escapes the reply for TwiML', () => {
    expect(twiml('A & <b>')).toContain('<Message>A &amp; &lt;b&gt;</Message>')
    expect(twiml('')).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>')
  })

  it('shows the business a first name and four digits only', () => {
    expect(maskedCustomer('María Pérez', '+13055551234')).toBe('María · •••1234')
    expect(maskedCustomer(null, '+13055551234')).toBe('•••1234')
    expect(maskedCustomer('María', null)).toBeNull()
  })
})

describe('knowing who', () => {
  let payload: Payload
  const made: { collection: 'cities' | 'categories' | 'listings' | 'promotions' | 'partners'; id: number }[] = []
  let listingId: number
  let partnerId: number
  let partnerKey: string
  const slug = `who-test-${Date.now()}`
  const waSlug = `${slug}-wa`

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const city = await payload.create({ collection: 'cities', data: { slug: `${slug}-city`, name: 'Test City' } as never, overrideAccess: true })
    made.push({ collection: 'cities', id: city.id })
    const category = await payload.create({ collection: 'categories', data: { slug: `${slug}-cat`, label: 'Test' } as never, overrideAccess: true })
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
      data: {
        name: 'Test Bistro',
        listing: listing.id,
        staff: [
          { name: 'Ana', pin: '1111' },
          { name: 'Luis', pin: '2222' },
        ],
      },
      overrideAccess: true,
    })
    partnerId = partner.id
    partnerKey = partner.dashboardKey!
    made.push({ collection: 'partners', id: partner.id })
    for (const [s, claimBy] of [
      [slug, 'web'],
      [waSlug, 'whatsapp'],
    ] as const) {
      const promo = await payload.create({
        collection: 'promotions',
        data: { slug: s, listing: listing.id, title: 'Free dessert', claimBy, _status: 'published' },
        overrideAccess: true,
      })
      made.push({ collection: 'promotions', id: promo.id })
    }
  })

  beforeEach(() => {
    resetPromoLimits()
    resetWhatsappLimits()
    connect(true)
  })

  afterAll(async () => {
    connect(false)
    if (!payload) return
    await payload.delete({ collection: 'promo-coupons', where: { listing: { equals: listingId } }, overrideAccess: true })
    for (const { collection, id } of made.reverse()) await payload.delete({ collection, id, overrideAccess: true }).catch(() => undefined)
  })

  it('is ready with staff PINs and no shared one', async () => {
    expect(await partnerFor(payload, listingId)).not.toBeNull()
  })

  it('refuses two people with the same PIN', async () => {
    await expect(
      payload.update({
        collection: 'partners',
        id: partnerId,
        data: { staff: [{ name: 'Ana', pin: '1111' }, { name: 'Pepe', pin: '1111' }] },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
    await expect(
      payload.update({ collection: 'partners', id: partnerId, data: { staffPin: '2222' }, overrideAccess: true }),
    ).rejects.toThrow()
  })

  it('keeps who marked each coupon, and the shared PIN as nobody', async () => {
    const one = await claimCoupon(payload, { slug }, browser())
    const two = await claimCoupon(payload, { slug }, browser())
    if (!one.ok || !two.ok) throw new Error('claim failed')
    expect(await redeemCoupon(payload, { code: one.code, pin: '2222' })).toMatchObject({ status: 'redeemed' })
    await payload.update({ collection: 'partners', id: partnerId, data: { staffPin: '9090' }, overrideAccess: true })
    expect(await redeemCoupon(payload, { code: two.code, pin: '9090' })).toMatchObject({ status: 'redeemed' })
    const [a, b] = await Promise.all(
      [one.code, two.code].map((code) =>
        payload.find({ collection: 'promo-coupons', where: { code: { equals: code } }, overrideAccess: true }).then((r) => r.docs[0]),
      ),
    )
    expect(a.redeemedBy).toBe('Luis')
    expect(b.redeemedBy).toBeNull()

    const dash = await partnerDashboard(payload, partnerKey, 'es')
    expect(dash?.staff).toEqual(expect.arrayContaining([{ name: 'Luis', used: 1 }, { name: '', used: 1 }]))
    expect(dash?.recent.find((r) => r.code === one.code)?.redeemedBy).toBe('Luis')
  })

  it('hands WhatsApp promotions out by WhatsApp only, and falls back to the site until connected', async () => {
    expect(await claimCoupon(payload, { slug: waSlug }, browser())).toMatchObject({ ok: false, reason: 'refused' })
    expect(claimMode({ claimBy: 'whatsapp' })).toBe('whatsapp')
    connect(false)
    expect(claimMode({ claimBy: 'whatsapp' })).toBe('web')
  })

  it('gives one coupon per number, with who asked, and the same one again', async () => {
    const ask = { phone: '+13055551234', name: 'María Pérez', body: `Hola (ref ${askRef(waSlug, 'instagram', 'es')})` }
    const first = await answerWhatsapp(payload, ask)
    expect(first).toMatch(/^¡Listo, María! 🎟️ Tu cupón para «Free dessert» en Test Bistro:/)
    const code = /\*([0-9A-Z]{3} [0-9A-Z]{3})\*/.exec(first)![1]

    const again = await answerWhatsapp(payload, ask)
    expect(again).toContain(`Ya tienes un cupón para «Free dessert»: *${code}*`)
    const other = await answerWhatsapp(payload, { ...ask, phone: '+13055559999', name: 'Pedro' })
    expect(other).not.toContain(code)

    const { docs } = await payload.find({
      collection: 'promo-coupons',
      where: { phone: { equals: '+13055551234' } },
      overrideAccess: true,
    })
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ channel: 'whatsapp', whatsappName: 'María Pérez', source: 'instagram', lang: 'es', test: false })

    expect(await redeemCoupon(payload, { code: docs[0].code, pin: '1111' })).toMatchObject({ status: 'redeemed' })
    expect(await answerWhatsapp(payload, ask)).toMatch(/ya se usó el .*Es uno por persona\./)
    const dash = await partnerDashboard(payload, partnerKey, 'es')
    expect(dash?.recent.find((r) => r.code === docs[0].code)).toMatchObject({ customer: 'María · •••1234', redeemedBy: 'Ana' })
  })

  it('answers anything else with their open coupons and what the number is for', async () => {
    const reply = await answerWhatsapp(payload, { phone: '+13055559999', name: 'Pedro', body: '¿Abren el domingo?' })
    expect(reply).toContain('Tus cupones:')
    expect(reply).toContain('Este número entrega los cupones de Flamingo County')
    expect(await answerWhatsapp(payload, { phone: '+13055550001', name: null, body: 'Hi, do you deliver?' })).toMatch(/^Hi 👋/)
  })

  it('stops answering a number that won’t stop writing', async () => {
    const msg = { phone: '+13055550002', name: null, body: 'hola' }
    for (let i = 0; i < 10; i++) expect(await answerWhatsapp(payload, msg)).not.toBe('')
    expect(await answerWhatsapp(payload, msg)).toBe('')
  })

  it('answers Twilio’s webhook with the coupon, and refuses anyone else', async () => {
    const params = new URLSearchParams({
      From: 'whatsapp:+13055550003',
      ProfileName: 'Rosa',
      Body: `Hi (ref ${askRef(waSlug, 'qr', 'en')})`,
    })
    const req = (sig: string | null) =>
      new Request('http://internal:8080/api/promo/whatsapp', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', ...(sig ? { 'x-twilio-signature': sig } : {}) },
        body: params.toString(),
      })
    const ok = await POST(req(twilioSignature(TOKEN, webhookUrl(), params)))
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toContain('text/xml')
    expect(await ok.text()).toMatch(/<Message>Done, Rosa! 🎟️ Your coupon for "Free dessert" at Test Bistro:/)

    expect((await POST(req('forged'))).status).toBe(403)
    expect((await POST(req(null))).status).toBe(403)
    connect(false)
    expect((await POST(req(twilioSignature(TOKEN, webhookUrl(), params)))).status).toBe(404)
  })
})
