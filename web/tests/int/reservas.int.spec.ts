// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalReq, getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { fromTwilio, twilioSignature, webhookUrl as couponWebhookUrl } from '@/lib/promoWhatsapp'
import {
  REPLY_HINT,
  RESERVAS_EVENTS,
  answerReservas,
  choice,
  decideLeadDraft,
  leadFromText,
  nextTurn,
  parseLeadCallback,
  reservasLink,
  resetReservasLimits,
  sendToLead,
  webhookUrl,
} from '@/lib/reservas'
import { POST } from '@/app/api/reservas/whatsapp/route'

/**
 * The reservations WhatsApp line: the number menu, the lead it keeps, and the
 * owner's replies, which only go out within WhatsApp's 24-hour window.
 */

const TOKEN = 'test-auth-token'
const ev = RESERVAS_EVENTS[0]
const NOW = new Date('2026-11-10T20:00:00Z')
const start = { status: 'new' as const, step: 'menu', partySize: null, tier: null, whatsappName: 'María Pérez', misses: 0, lang: 'es' as const }

function connect(on: boolean) {
  if (on) {
    process.env.TWILIO_AUTH_TOKEN = TOKEN
    process.env.TWILIO_ACCOUNT_SID = 'ACtest'
    process.env.RESERVAS_WHATSAPP_NUMBER = '+1 (240) 410-6749'
  } else {
    delete process.env.TWILIO_AUTH_TOKEN
    delete process.env.TWILIO_ACCOUNT_SID
    delete process.env.RESERVAS_WHATSAPP_NUMBER
  }
}

describe('the menu', () => {
  it('greets first, with the event, 21+ and the menu', () => {
    const t = nextTurn(ev, start, 'CHACAL', true, NOW)
    expect(t.reply).toMatch(/^¡Hola, María! 🦩/)
    expect(t.reply).toContain('21+')
    expect(t.reply).toContain('1 · Reservar una mesa VIP')
    expect(t.alert).toBeNull()
  })

  it('books a table: party size → the tables that fit → news yes/no → a person', () => {
    let lead = { ...start }
    const say = (body: string) => {
      const t = nextTurn(ev, lead, body, false, NOW)
      lead = { ...lead, ...t.set } as typeof lead
      return t
    }
    expect(say('1').reply).toMatch(/Cuántas personas/)
    const tiers = say('6')
    expect(tiers.reply).toContain('1 · *Main floor* · hasta 6 · $1,800')
    expect(tiers.reply).toContain('3 · *Skyline*')
    expect(tiers.reply).not.toContain('High top')
    expect(say('2').reply).toMatch(/novedades del show/)
    const done = say('1')
    expect(done.reply).toMatch(/Anotamos \*Party box\* para 6/)
    expect(done.alert).toBe('table')
    expect(lead).toMatchObject({ status: 'handoff', partySize: 6, tier: 'Party box', optIn: true })
  })

  it('hands a group bigger than any table to a person', () => {
    const t = nextTurn(ev, { ...start, step: 'party' }, '14', false, NOW)
    expect(t.set).toMatchObject({ status: 'handoff', partySize: 14 })
    expect(t.alert).toBe('table')
  })

  it('passes to a person after two replies it can’t read', () => {
    const once = nextTurn(ev, start, '¿y hay comida?', false, NOW)
    expect(once.reply).toMatch(/No te entendí/)
    expect(once.set.misses).toBe(1)
    const twice = nextTurn(ev, { ...start, misses: 1 }, '¿y el parqueo?', false, NOW)
    expect(twice.set.status).toBe('handoff')
    expect(twice.alert).toBe('person')
  })

  it('stays quiet while a person has it, and 0 brings the menu back', () => {
    const quiet = nextTurn(ev, { ...start, status: 'handoff' }, 'hola, ¿siguen ahí?', false, NOW)
    expect(quiet).toMatchObject({ reply: '', alert: 'message' })
    const back = nextTurn(ev, { ...start, status: 'handoff' }, '0', false, NOW)
    expect(back.reply).toMatch(/^Responde con un número/)
    expect(back.set.status).toBe('asked')
  })

  it('switches language on EN / ES, and never drops a booked or waiting lead', () => {
    const t = nextTurn(ev, start, 'EN', false, NOW)
    expect(t.set.lang).toBe('en')
    expect(t.reply).toContain('1 · Book a VIP table')
    expect(nextTurn(ev, { ...start, status: 'booked' }, 'EN', false, NOW).set.status).toBe('booked')
    expect(nextTurn(ev, { ...start, status: 'handoff' }, 'es', false, NOW).set.status).toBe('handoff')
  })

  it('never mentions alcohol, in either language', () => {
    for (const lang of ['es', 'en'] as const) {
      const lead = { ...start, lang }
      const replies = [
        nextTurn(ev, lead, 'hi', true, NOW),
        ...['1', '2', '3', '4', '5'].map((n) => nextTurn(ev, lead, n, false, NOW)),
        nextTurn(ev, { ...lead, step: 'party' }, '4', false, NOW),
        nextTurn(ev, { ...lead, step: 'optin', tier: 'Skyline', partySize: 10 }, '1', false, NOW),
      ].map((t) => t.reply)
      for (const r of replies) expect(r).not.toMatch(/bottle|botella|open bar|barra libre|alcohol|mo[eë]t|champ|dom p/i)
    }
  })

  it('reads a choice however it is typed', () => {
    expect(choice('1')).toBe(1)
    expect(choice(' 2. ')).toBe(2)
    expect(choice('3️⃣')).toBe(3)
    expect(choice('quiero la 2')).toBeNull()
  })
})

describe('links and callbacks', () => {
  afterEach(() => connect(false))

  it('builds the wa.me link with the ref the bot reads', () => {
    expect(reservasLink('chacal-nye', 'instagram', 'es')).toBeNull()
    connect(true)
    const link = reservasLink('chacal-nye', 'instagram', 'es')!
    expect(link.startsWith('https://wa.me/12404106749?text=')).toBe(true)
    expect(decodeURIComponent(link.split('text=')[1])).toBe('Hola, quiero reservar para Chacal · Fin de Año 2027 (ref #chacal-nye instagram es)')
  })

  it('sends a Telegram reply on WhatsApp only when it answers one lead’s alert', () => {
    expect(leadFromText(`🦩 Pidió mesa\n#L12 · María\n\n“hola”\n\n${REPLY_HINT}`)).toBe(12)
    expect(leadFromText(`#L12 · María, again #L12\n${REPLY_HINT}`)).toBe(12)
    // /leads lists several; a drafted reply and a "Sent" line carry no hint.
    expect(leadFromText(`Leads\n#L12 María\n#L13 Pedro\n${REPLY_HINT}`)).toBeNull()
    expect(leadFromText('✍️ Claude suggests a reply\n#L12 · María\nReply: Hola')).toBeNull()
    expect(leadFromText('✅ Sent to María #L12 on WhatsApp.')).toBeNull()
    expect(leadFromText(undefined)).toBeNull()
  })

  it('reads the Send button', () => {
    expect(parseLeadCallback('ld:s:12:0a1b2c3d')).toEqual({ action: 'send', id: 12, hash: '0a1b2c3d' })
    expect(parseLeadCallback('ld:x:12:0a1b2c3d')).toBeNull()
  })

  it('signs for its own URL, not the coupon one', () => {
    const params = new URLSearchParams({ From: 'whatsapp:+13055551234', Body: 'hola' })
    expect(fromTwilio(params, twilioSignature(TOKEN, webhookUrl(), params), TOKEN, webhookUrl())).toBe(true)
    expect(fromTwilio(params, twilioSignature(TOKEN, couponWebhookUrl(), params), TOKEN, webhookUrl())).toBe(false)
  })
})

describe('leads in the database', () => {
  let payload: Payload
  const PHONE = '+13055550101'

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  beforeEach(async () => {
    resetReservasLimits()
    await payload.delete({ collection: 'hq-leads', where: { id: { exists: true } }, overrideAccess: true })
  })

  afterEach(() => {
    connect(false)
    vi.unstubAllGlobals()
    delete process.env.PROMO_TEST_PHONES
  })

  afterAll(async () => {
    await payload.delete({ collection: 'hq-leads', where: { id: { exists: true } }, overrideAccess: true })
  })

  const lead = async () =>
    (await payload.find({ collection: 'hq-leads', where: { phone: { equals: PHONE } }, overrideAccess: true })).docs[0]

  it('keeps one lead per number, where they came from, and the conversation', async () => {
    const hi = await answerReservas(payload, { phone: PHONE, name: 'María Pérez', body: 'Hola, quiero reservar para Chacal (ref #chacal-nye instagram es)' }, NOW)
    expect(hi).toMatch(/^¡Hola, María!/)
    await answerReservas(payload, { phone: PHONE, name: 'María Pérez', body: '1' }, NOW)
    await answerReservas(payload, { phone: PHONE, name: 'María Pérez', body: '4' }, NOW)
    const row = await lead()
    expect(row).toMatchObject({ event: 'chacal-nye', source: 'instagram', lang: 'es', status: 'asked', step: 'tier', partySize: 4, test: false })
    expect((row.messages as unknown[]).length).toBe(6)
    const { totalDocs } = await payload.count({ collection: 'hq-leads', overrideAccess: true })
    expect(totalDocs).toBe(1)
  })

  it('greets again after a day away, and marks the owner’s own number as a test', async () => {
    process.env.PROMO_TEST_PHONES = '305-555-0101'
    await answerReservas(payload, { phone: PHONE, name: 'Carlos', body: 'CHACAL' }, NOW)
    await answerReservas(payload, { phone: PHONE, name: 'Carlos', body: '1' }, NOW)
    const later = new Date(NOW.getTime() + 25 * 3_600_000)
    expect(await answerReservas(payload, { phone: PHONE, name: 'Carlos', body: '6' }, later)).toMatch(/^¡Hola, Carlos!/)
    expect(await lead()).toMatchObject({ test: true, source: 'whatsapp', step: 'menu' })
  })

  it('says bookings are closed once the event has passed', async () => {
    const after = new Date('2027-01-02T15:00:00Z')
    expect(await answerReservas(payload, { phone: PHONE, name: null, body: 'hola' }, after)).toMatch(/ya cerraron/)
  })

  it('sends the owner’s reply within 24 hours only, and logs it', async () => {
    connect(true)
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    await answerReservas(payload, { phone: PHONE, name: 'María', body: 'hola' }, NOW)
    await answerReservas(payload, { phone: PHONE, name: 'María', body: '5' }, NOW)
    const row = await lead()
    expect(row.status).toBe('handoff')

    expect(await sendToLead(payload, row.id, 'Hola María, te ayudo con la mesa.', new Date(NOW.getTime() + 3_600_000))).toMatch(/^✅ Sent/)
    const call = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit]
    expect(call[0]).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json')
    expect(String(call[1].body)).toContain('To=whatsapp%3A%2B13055550101')
    expect(String(call[1].body)).toContain('From=whatsapp%3A%2B12404106749')
    const logged = (await lead()).messages as { from: string }[]
    expect(logged.at(-1)?.from).toBe('us')

    const n = fetchMock.mock.calls.length
    expect(await sendToLead(payload, row.id, 'Hola otra vez', new Date(NOW.getTime() + 30 * 3_600_000))).toMatch(/over 24 hours/)
    expect(fetchMock.mock.calls.length).toBe(n)
  })

  it('sends a drafted reply only as the owner saw it', async () => {
    connect(true)
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    await answerReservas(payload, { phone: PHONE, name: 'María', body: 'hola' }, NOW)
    const row = await lead()
    await payload.update({ collection: 'hq-leads', id: row.id, data: { draftReply: 'Texto nuevo' }, overrideAccess: true })
    expect(await decideLeadDraft(payload, row.id, 'send', '00000000', NOW)).toMatch(/gone or was replaced/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('hides the number over MCP and won’t let MCP write the bot’s fields', async () => {
    await answerReservas(payload, { phone: PHONE, name: 'María', body: 'hola' }, NOW)
    const user = await payload.create({
      collection: 'users',
      data: { email: `leads-mcp-${Date.now()}@example.com`, password: 'not-a-real-password-1' },
      overrideAccess: true,
    })
    try {
      const req = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
      req.payloadAPI = 'MCP'
      const { docs } = await payload.find({ collection: 'hq-leads', req, overrideAccess: false })
      expect(docs[0].whatsappName).toBe('María')
      expect(docs[0]).not.toHaveProperty('phone')
      const updated = await payload.update({ collection: 'hq-leads', id: docs[0].id, data: { status: 'booked', optIn: true, phone: '+19999999999' }, req, overrideAccess: false })
      expect(updated.status).toBe('booked')
      const row = await lead()
      expect(row).toMatchObject({ phone: PHONE, optIn: false, status: 'booked' })
    } finally {
      await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
    }
  })

  it('answers Twilio only, at its own URL', async () => {
    const post = (params: URLSearchParams, sig: string) =>
      POST(new Request(webhookUrl(), { method: 'POST', body: params.toString(), headers: { 'x-twilio-signature': sig } }))
    const params = new URLSearchParams({ From: `whatsapp:${PHONE}`, Body: 'CHACAL', ProfileName: 'María' })

    expect((await post(params, 'x')).status).toBe(404)
    connect(true)
    expect((await post(params, 'forged')).status).toBe(403)
    const res = await post(params, twilioSignature(TOKEN, webhookUrl(), params))
    expect(res.status).toBe(200)
    expect(await res.text()).toMatch(/<Message>¡Hola, María! 🦩/)
  })
})
