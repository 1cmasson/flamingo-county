// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { POST } from '@/app/api/whatsapp/route'
import { jevPick, redact } from '@/lib/jev'
import {
  FLOW,
  PLACES,
  busAnswer,
  dominoEvent,
  laCapitalDominoLink,
  laCapitalLink,
  pick,
  screen,
  turn,
  type Input,
  type LeadState,
  type Step,
} from '@/lib/laCapital'
import { twilioSignature } from '@/lib/promoWhatsapp'
import { asText, deliver, inboundUrl, resetTemplateCache, templateVariables, validOut, type Out } from '@/lib/whatsapp'
import { answerInbound, isEmergency, isUnsubscribe, resetInboundLimits, wantsDomino, type Incoming } from '@/lib/whatsappInbound'
import { REPLY_HINT, leadFromText, parseLeadStatusCallback, sendToLead } from '@/lib/whatsappLeads'
import { readLocation } from '@/lib/whatsappParams'

/**
 * La Capital's WhatsApp line: tap-button screens, the lead it keeps, consent
 * before a number goes anywhere, the bus answer, and the one inbound webhook
 * for the sender (BAJA, emergencies, routing).
 */

const TOKEN = 'test-auth-token'
const SENDER = '+17864604851'
const NOW = new Date('2026-11-19T17:00:00Z') // Thursday noon in Miami
const base: LeadState = {
  step: 'menu',
  lang: 'es',
  status: 'new',
  intent: null,
  place: null,
  when: null,
  timeOfDay: null,
  travel: null,
  misses: 0,
  whatsappName: 'María Pérez',
}
const noInput: Input = { button: null, text: '', location: null }
// Coral Way & SW 57th Ave area: inside Miami-Dade, a bus ride from Calle 8.
const SOMEWHERE: [number, number] = [25.7505, -80.2905]

function connect(on: { rest?: boolean } | false) {
  if (on) {
    process.env.TWILIO_AUTH_TOKEN = TOKEN
    process.env.WHATSAPP_SENDER_NUMBER = SENDER
    if (on.rest) process.env.TWILIO_ACCOUNT_SID = 'ACtest'
    else delete process.env.TWILIO_ACCOUNT_SID
  } else {
    delete process.env.TWILIO_AUTH_TOKEN
    delete process.env.TWILIO_ACCOUNT_SID
    delete process.env.WHATSAPP_SENDER_NUMBER
  }
}

describe('the screens', () => {
  const steps: Step[] = ['menu', 'place', 'when', 'tod', 'travel', 'pin', 'consent', 'after']
  it('fit WhatsApp quick replies in both languages (≤3 buttons, ≤20 chars, ≤1024 body)', () => {
    for (const lang of ['es', 'en'] as const)
      for (const intent of ['visit', 'callback', 'directions'] as const)
        for (const step of steps) {
          const out = screen(step, { ...base, lang, intent, place: 'calle8', when: 'this', timeOfDay: 'am', travel: 'bus' })!
          expect(validOut(out), `${lang} ${intent} ${step}`).toBeNull()
        }
  })

  it('never talk about health, insurance, free rides or meals', () => {
    const words = /seguro|insurance|medicare|medicaid|gratis|free|comida|meal|almuerzo|lunch|transporte|ride gratis|\$|s[ií]ntoma|symptom|diagn/i
    for (const lang of ['es', 'en'] as const)
      for (const step of steps) {
        const out = screen(step, { ...base, lang, intent: 'visit', place: 'hialeah', when: 'next', timeOfDay: 'pm', travel: 'car' })!
        // The greeting says such questions are for the clinic in person; nothing else may mention them.
        const text = step === 'menu' ? out.text.split('\n').filter((l) => !/clínica, en persona|team, in person/.test(l)).join('\n') : out.text
        expect(asText({ ...out, text }), `${lang} ${step}`).not.toMatch(words)
      }
  })

  it('reads a tap, a number, a button title, or clear words; nothing ambiguous', () => {
    const menu = screen('menu', base)
    expect(pick(menu, { ...noInput, button: 'lc:call' })).toBe('lc:call')
    expect(pick(menu, { ...noInput, text: '3' })).toBe('lc:dir')
    expect(pick(menu, { ...noInput, text: 'Visitar la clínica' })).toBe('lc:visit')
    expect(pick(menu, { ...noInput, text: 'quiero que me llamen por favor' })).toBe('lc:call')
    expect(pick(menu, { ...noInput, text: 'tengo dolor de rodilla' })).toBeNull()
    expect(pick(menu, { ...noInput, text: '7' })).toBeNull()
    const place = screen('place', { ...base, intent: 'visit' })
    expect(pick(place, { ...noInput, text: 'la de Hialeah' })).toBe('lc:p:hialeah')
    // A tap from another screen isn't read as this one's.
    expect(pick(place, { ...noInput, button: 'lc:yes' })).toBeNull()
  })
})

describe('the flow (pure)', () => {
  const run = (inputs: Partial<Input>[], from: LeadState = base) => {
    let s = { ...from }
    const turns = inputs.map((i, k) => {
      const t = turn(s, { ...noInput, ...i }, { fresh: k === 0, now: NOW })
      s = { ...s, ...t.set } as LeadState
      return t
    })
    return { s, turns }
  }

  it('visit by bus: menu → place → when → time → travel → location → consent → ready', () => {
    const { s, turns } = run([
      { text: 'Hola, quiero información (ref #la-capital instagram es)' },
      { button: 'lc:visit' },
      { button: 'lc:p:calle8' },
      { text: '1' },
      { text: 'por la tarde' },
      { button: 'lc:tr:bus' },
      { location: SOMEWHERE },
      { button: 'lc:yes' },
    ])
    expect(turns[0].outs[0].buttons?.map((b) => b.id)).toEqual(['lc:visit', 'lc:call', 'lc:dir'])
    expect(turns[0].outs[0].text).toMatch(/^Hola, María 👋/)
    expect(turns[6].outs).toHaveLength(2) // the bus answer, then the consent question
    expect(turns[6].outs[0].text).toMatch(/Para llegar a La Capital \(Calle 8\)/)
    expect(turns[6].outs[1].text).toContain('Visita · Calle 8 · Miami · esta semana · por la tarde · en guagua')
    expect(turns[7].alert).toBe('ready')
    expect(turns[7].set.consentText).toMatch(/Le pasamos tu nombre y este número a La Capital/)
    expect(s).toMatchObject({ step: 'done', status: 'ready', intent: 'visit', place: 'calle8', when: 'this', timeOfDay: 'pm', travel: 'bus' })
  })

  it('call back from either clinic, then says no to sharing: nothing goes anywhere', () => {
    const { s, turns } = run([{ text: 'hola' }, { button: 'lc:call' }, { button: 'lc:p:any' }, { button: 'lc:t:am' }, { button: 'lc:no' }])
    expect(turns.some((t) => t.alert === 'ready')).toBe(false)
    expect(s).toMatchObject({ status: 'closed', step: 'done', intent: 'callback', place: 'any', timeOfDay: 'am' })
  })

  it('two replies it can’t read go to a person; then it stays quiet until MENÚ', () => {
    const { s, turns } = run([{ text: 'hola' }, { text: 'qué medicinas tengo que llevar' }, { text: 'no entiendo' }, { text: 'hola?' }, { text: 'MENÚ' }])
    expect(turns[1].outs[0].text).toMatch(/^Toca uno de los botones/)
    expect(turns[2].alert).toBe('person')
    expect(turns[3].outs).toEqual([])
    expect(turns[3].alert).toBe('message')
    expect(turns[4].outs[0].buttons).toHaveLength(3)
    expect(s.step).toBe('menu')
  })

  it('switches language on EN and keeps the screen', () => {
    const { turns } = run([{ text: 'hola' }, { button: 'lc:visit' }, { text: 'EN' }])
    expect(turns[2].set.lang).toBe('en')
    expect(turns[2].outs[0].text).toMatch(/Which one is better for you/)
  })

  it('cancels a request that went to the clinic', () => {
    const { s, turns } = run([{ text: 'CANCELAR' }], { ...base, step: 'done', status: 'ready' })
    expect(turns[0].alert).toBe('cancel')
    expect(s.status).toBe('closed')
  })

  it('uses Jev’s pick only for a button on screen', () => {
    const s = { ...base, step: 'travel' as const, intent: 'visit' as const }
    const ok = turn(s, { ...noInput, text: 'mi nieto me trae' }, { fresh: false, now: NOW, jevPick: 'lc:tr:ride' })
    expect(ok.set.travel).toBe('ride')
    const stray = turn(s, { ...noInput, text: 'mi nieto me trae' }, { fresh: false, now: NOW, jevPick: 'lc:yes' })
    expect(stray.set.misses).toBe(1)
  })
})

describe('the bus answer', () => {
  it('says which bus and links from the boarding stop, never from their location', () => {
    const text = busAnswer('es', SOMEWHERE, 'calle8', NOW)
    expect(text).toMatch(/Toma |Te queda a/)
    expect(text).not.toContain(SOMEWHERE[0].toFixed(5))
    expect(text).not.toContain(SOMEWHERE[0].toFixed(4))
    if (/bus\/trip\?/.test(text)) expect(text).toContain(`ac=${PLACES.calle8.at[0].toFixed(5)}`)
  })

  it('reads a shared location only in Miami-Dade', () => {
    expect(readLocation(new URLSearchParams({ Latitude: '25.76', Longitude: '-80.28' }))).toEqual([25.76, -80.28])
    expect(readLocation(new URLSearchParams({ Latitude: '40.7', Longitude: '-74' }))).toBeNull()
    expect(readLocation(new URLSearchParams({ Body: 'hola' }))).toBeNull()
  })
})

describe('fixed answers', () => {
  it('knows BAJA/STOP and emergencies', () => {
    expect(isUnsubscribe('Baja')).toBe(true)
    expect(isUnsubscribe('STOP')).toBe(true)
    expect(isUnsubscribe('quiero bajar de peso')).toBe(false)
    expect(isUnsubscribe('stop')).toBe(true)
    expect(isEmergency('tengo un dolor de pecho fuerte')).toBe(true)
    expect(isEmergency('I think I’m having a heart attack')).toBe(true)
    expect(isEmergency('quiero visitar la clínica')).toBe(false)
  })

  it('builds the wa.me link with the ref the line reads', () => {
    const link = laCapitalLink(SENDER, 'listing', 'es')
    expect(link.startsWith('https://wa.me/17864604851?text=')).toBe(true)
    expect(decodeURIComponent(link.split('text=')[1])).toMatch(/\(ref #la-capital listing es\)$/)
  })
})

describe('Jev', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.TYPESAFE_API_KEY
  })

  it('is off without a key, and blanks out numbers before sending', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await jevPick('q', 'mi nieto me trae', [{ id: 'lc:tr:ride', description: 'Me llevan' }])).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(redact('llámame al 305-555-1234 o a ana@x.com')).toBe('llámame al [number] o a [email]')
  })

  it('takes a confident pick, ignores an unsure one', async () => {
    process.env.TYPESAFE_API_KEY = 'k'
    const reply = (choice: string, confidence: number) =>
      new Response(JSON.stringify({ answers: { pick: { choice, confidence } } }), { status: 200 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply('lc:tr:ride', 0.93)).mockResolvedValueOnce(reply('lc:tr:ride', 0.5)))
    const opts = [{ id: 'lc:tr:ride', description: 'Me llevan' }]
    expect(await jevPick('q', 'mi nieto me trae', opts)).toBe('lc:tr:ride')
    expect(await jevPick('q', 'mi nieto me trae', opts)).toBeNull()
  })
})

describe('sending', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetTemplateCache()
    connect(false)
  })

  it('puts the body, titles and ids in the generic template’s variables', () => {
    const out: Out = { text: 'Hola', buttons: [{ id: 'lc:yes', title: 'Sí' }, { id: 'lc:no', title: 'No' }] }
    expect(templateVariables(out)).toEqual({ '1': 'Hola', '2': 'Sí', '3': 'No', '4': 'lc:yes', '5': 'lc:no' })
  })

  it('sends buttons with a ContentSid, making the template once', async () => {
    connect({ rest: true })
    const calls: { url: string; body: string }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: String(init?.body ?? '') })
        if (url.startsWith('https://content.twilio.com/v1/Content?')) return new Response(JSON.stringify({ contents: [] }))
        if (url === 'https://content.twilio.com/v1/Content') return new Response(JSON.stringify({ sid: 'HX123' }), { status: 201 })
        return new Response(JSON.stringify({ sid: 'SM1' }), { status: 201 })
      }),
    )
    const outs: Out[] = [{ text: 'Uno' }, { text: 'Dos', buttons: [{ id: 'lc:yes', title: 'Sí' }, { id: 'lc:no', title: 'No' }] }]
    expect(await deliver('+13055550000', outs)).toBe('')
    expect(await deliver('+13055550000', [outs[1]])).toBe('')
    const created = calls.filter((c) => c.url === 'https://content.twilio.com/v1/Content')
    expect(created).toHaveLength(1)
    expect(JSON.parse(created[0].body).types['twilio/quick-reply'].actions).toEqual([
      { title: '{{2}}', id: '{{4}}' },
      { title: '{{3}}', id: '{{5}}' },
    ])
    const sends = calls.filter((c) => c.url.endsWith('/Messages.json')).map((c) => new URLSearchParams(c.body))
    expect(sends.map((p) => p.get('Body') ?? p.get('ContentSid'))).toEqual(['Uno', 'HX123', 'HX123'])
    expect(sends[1].get('From')).toBe(`whatsapp:${SENDER}`)
  })

  it('falls back to numbered text when Twilio refuses', async () => {
    connect({ rest: true })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'nope' }), { status: 400 })))
    const text = await deliver('+13055550000', [{ text: 'Elige', buttons: [{ id: 'lc:yes', title: 'Sí' }, { id: 'lc:no', title: 'No' }] }])
    expect(text).toBe('Elige\n\n1 · Sí\n2 · No')
  })
})

describe('the webhook and the leads (database)', () => {
  let payload: Payload
  const phone = `+1305555${String(Date.now()).slice(-4)}`
  const msg = (m: Partial<Incoming>): Incoming => ({ phone, name: 'Ana Gómez', body: '', button: null, location: null, ...m })

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })
  beforeEach(() => resetInboundLimits())
  afterAll(async () => {
    await payload.delete({ collection: 'hq-leads', where: { phone: { equals: phone } }, overrideAccess: true })
    await payload.delete({ collection: 'vote-whatsapp-optins', where: { phone: { equals: phone } }, overrideAccess: true })
    connect(false)
  })

  const lead = async () =>
    (await payload.find({ collection: 'hq-leads', where: { and: [{ flow: { equals: FLOW } }, { phone: { equals: phone } }] }, overrideAccess: true })).docs[0]

  it('keeps one lead per number, with its source, steps and consent, and never a location', async () => {
    let outs = await answerInbound(payload, msg({ body: 'Hola, quiero información de La Capital Medical Center (ref #la-capital story es)' }), NOW)
    expect(outs[0].buttons).toHaveLength(3)
    for (const b of ['lc:visit', 'lc:p:hialeah', 'lc:w:next', 'lc:t:am', 'lc:tr:bus']) outs = await answerInbound(payload, msg({ button: b }), NOW)
    outs = await answerInbound(payload, msg({ location: SOMEWHERE }), NOW)
    expect(outs[outs.length - 1].buttons?.map((b) => b.id)).toEqual(['lc:yes', 'lc:no'])
    await answerInbound(payload, msg({ button: 'lc:yes' }), NOW)

    const l = await lead()
    expect(l).toMatchObject({ source: 'story', status: 'ready', intent: 'visit', place: 'hialeah', when: 'next', timeOfDay: 'am', travel: 'bus' })
    expect(l.consentAt).toBeTruthy()
    const saved = JSON.stringify(l.messages)
    expect(saved).toContain('ubicación compartida')
    expect(saved).toContain('indicaciones de guagua enviadas')
    expect(saved).not.toContain(String(SOMEWHERE[0]))
    // Not even the stop they'd board at, which is near where they are.
    expect(saved).not.toContain('dc=')
    expect(saved).not.toMatch(/Camina \d+ min hasta la parada/)
    expect((await payload.count({ collection: 'hq-leads', where: { phone: { equals: phone } }, overrideAccess: true })).totalDocs).toBe(1)
  })

  it('answers an emergency with 911 and leaves the lead as it was', async () => {
    const before = await lead()
    const outs = await answerInbound(payload, msg({ body: 'Tengo dolor de pecho y no puedo respirar' }), NOW)
    expect(outs[0].text).toMatch(/llama al 911/)
    expect((await lead()).step).toBe(before.step)
  })

  it('BAJA unsubscribes the number everywhere', async () => {
    await payload.create({
      collection: 'vote-whatsapp-optins',
      data: { phone, lang: 'es', status: 'active', consentText: 'test', consentAt: NOW.toISOString(), test: true },
      overrideAccess: true,
    })
    const outs = await answerInbound(payload, msg({ body: 'BAJA' }), NOW)
    expect(outs[0].text).toMatch(/te dimos de baja/)
    expect((await lead()).optedOut).toBe(true)
    const optin = (await payload.find({ collection: 'vote-whatsapp-optins', where: { phone: { equals: phone } }, overrideAccess: true })).docs[0]
    expect(optin.status).toBe('unsubscribed')
    expect(await sendToLead(payload, (await lead()).id, 'hola', NOW)).toMatch(/BAJA\/STOP/)
  })

  it('a number that never wrote to a line gets the general answer', async () => {
    const outs = await answerInbound(payload, msg({ phone: '+13055550199', body: 'hola' }), NOW)
    expect(outs[0].text).toMatch(/Flamingo County/)
    expect(outs[0].text).toContain('/es/vota')
  })

  it('owner replies only to a one-lead alert, only within 24 hours', async () => {
    expect(leadFromText(`… #L12 …\n${REPLY_HINT}`)).toBe(12)
    expect(leadFromText('#L12 #L13')).toBeNull()
    expect(parseLeadStatusCallback('wl:v:7')).toEqual({ status: 'visited', id: 7 })
    expect(parseLeadStatusCallback('wl:z:7')).toBeNull()
    await payload.update({ collection: 'hq-leads', id: (await lead()).id, data: { optedOut: false }, overrideAccess: true })
    const later = new Date(NOW.getTime() + 25 * 3_600_000)
    expect(await sendToLead(payload, (await lead()).id, 'hola', later)).toMatch(/over 24 hours/)
  })

  it('the route: 404 unset, 403 unsigned, signed → TwiML text when sending isn’t set up', async () => {
    connect(false)
    const params = new URLSearchParams({ From: 'whatsapp:+13055550198', To: `whatsapp:${SENDER}`, Body: 'hola', ProfileName: 'Leo' })
    const req = (sig: string) => new Request(inboundUrl(), { method: 'POST', body: params.toString(), headers: { 'x-twilio-signature': sig } })
    expect((await POST(req('x'))).status).toBe(404)
    connect({})
    expect((await POST(req('bad'))).status).toBe(403)
    const res = await POST(req(twilioSignature(TOKEN, inboundUrl(), params)))
    expect(res.status).toBe(200)
    expect(await res.text()).toMatch(/<Message>Hola 👋 Este es el WhatsApp de Flamingo County/)
  })
})

/* ------------------------------------------------------ domino tournament */

describe('the domino tournament (pure)', () => {
  const EV = dominoEvent('2026-12-04T10:00|calle8', NOW)!
  const ANY = dominoEvent('2026-12-04T10:00|any', NOW)!
  const PAST = dominoEvent('2026-11-01T10:00|calle8', NOW)!
  const on: LeadState = { ...base, event: EV }

  const run = (inputs: Partial<Input>[], from: LeadState, first: { domino?: boolean } = {}) => {
    let s = { ...from }
    const turns = inputs.map((i, k) => {
      const t = turn(s, { ...noInput, ...i }, { fresh: k === 0, now: NOW, ...(k === 0 ? first : {}) })
      s = { ...s, ...t.set } as LeadState
      return t
    })
    return { s, turns }
  }

  it('reads LA_CAPITAL_DOMINO: Miami time, a place or any; anything else is off', () => {
    expect(EV).toMatchObject({ key: '2026-12-04T10:00', place: 'calle8', active: true })
    expect(EV.at.toISOString()).toBe('2026-12-04T15:00:00.000Z') // 10 AM EST
    expect(ANY.place).toBe('any')
    expect(PAST.active).toBe(false)
    for (const bad of [undefined, '', '2026-12-04 10:00|calle8', '2026-13-40T10:00|calle8', '2026-12-04T25:00|calle8', '2026-12-04T10:00|doral', '2026-12-04T10:00'])
      expect(dominoEvent(bad, NOW), String(bad)).toBeNull()
  })

  it('shows the button only while a tournament is set and still ahead', () => {
    const ids = (s: LeadState) => screen('menu', s)!.buttons!.map((b) => b.id)
    expect(ids(base)).toEqual(['lc:visit', 'lc:call', 'lc:dir'])
    expect(ids({ ...base, event: PAST })).toEqual(['lc:visit', 'lc:call', 'lc:dir'])
    expect(ids(on)).toEqual(['lc:dom', 'lc:visit', 'lc:call'])
    expect(screen('menu', on)!.text).toContain('escribe GUAGUA')
    // Typed DOMINÓ does nothing without one.
    const off = run([{ text: 'hola' }, { text: 'DOMINÓ' }], { ...base, event: PAST })
    expect(off.turns[1].set.step).not.toBe('dom')
  })

  it('fits WhatsApp and never mentions prizes, food, rides, health or insurance', () => {
    const words = /seguro|insurance|medicare|medicaid|gratis|free|premio|prize|comida|food|meal|almuerzo|lunch|transporte|ride|\$|s[ií]ntoma|symptom|24\/7|24 horas/i
    for (const lang of ['es', 'en'] as const)
      for (const event of [EV, ANY])
        for (const step of ['menu', 'dom', 'party', 'rsvp', 'rsvpDone'] as Step[]) {
          const out = screen(step, { ...base, lang, event, intent: 'domino', dominoParty: 2, dominoPlace: 'hialeah' })!
          expect(validOut(out), `${lang} ${step}`).toBeNull()
          const text = step === 'menu' ? out.text.split('\n').filter((l) => !/clínica, en persona|team, in person/.test(l)).join('\n') : out.text
          expect(asText({ ...out, text }), `${lang} ${step}`).not.toMatch(words)
        }
  })

  it('signs up from the link without the clinic consent: dom → how many → RSVP yes', () => {
    const { s, turns } = run(
      [{ text: 'Quiero apuntarme al torneo de dominó de La Capital (ref #la-capital ig-reel-domino es)' }, { button: 'lc:dyes' }, { text: 'somos dos' }, { button: 'lc:dok' }],
      on,
      { domino: true },
    )
    expect(turns[0].outs[0].text).toContain('Torneo de dominó en La Capital')
    expect(turns[0].outs[0].text).toContain('5351 SW 8th St')
    expect(turns[0].outs[0].buttons?.map((b) => b.id)).toEqual(['lc:dyes', 'lc:skip'])
    expect(turns[1].outs[0].buttons?.map((b) => b.id)).toEqual(['lc:n:1', 'lc:n:2']) // the place is fixed: no place question
    expect(turns[2].outs[0].text).toContain('Torneo de dominó · Calle 8 · Miami · 2 personas')
    expect(turns[3].alert).toBe('domino')
    expect(turns[3].set).toMatchObject({ dominoEvent: '2026-12-04T10:00' })
    expect(turns[3].set.dominoConsentText).toMatch(/apuntarte al torneo de dominó\? Solo para el torneo/)
    expect(turns[3].set.consentAt).toBeUndefined()
    expect(turns[3].outs[0].text).toMatch(/^¡Listo, te apuntamos! ✅/)
    expect(turns[3].outs[0].text).toContain('contesta a cualquier hora')
    expect(turns[3].outs[0].buttons?.map((b) => b.id)).toEqual(['lc:visit', 'lc:call', 'lc:dir'])
    expect(s).toMatchObject({ step: 'rsvpDone', intent: 'domino', dominoParty: 2, dominoPlace: 'calle8', status: 'asking' })
    expect(s.dominoAt).toBeTruthy()
  })

  it('a visit after signing up asks its own consent; saying no leaves the sign-up alone', () => {
    const signedUp: LeadState = { ...on, step: 'rsvpDone', status: 'asking', intent: 'domino', dominoParty: 1, dominoPlace: 'calle8', dominoAt: NOW.toISOString() }
    const yes = run([{ text: '' }, { button: 'lc:visit' }, { button: 'lc:p:hialeah' }, { button: 'lc:w:this' }, { button: 'lc:t:am' }, { button: 'lc:tr:car' }, { button: 'lc:yes' }], signedUp)
    // (the first turn is fresh → menu; tap "visit" from there)
    expect(yes.turns[6].outs[0].text).toMatch(/Listo ✅ Se lo pasamos/)
    expect(yes.turns[5].outs[0].text).toContain('Le pasamos tu nombre y este número a La Capital Medical Center para que te llamen')
    expect(yes.turns[6].alert).toBe('ready')
    expect(yes.s).toMatchObject({ status: 'ready', intent: 'visit', dominoParty: 1 })

    const fromDone = turn(signedUp, { ...noInput, button: 'lc:call' }, { fresh: false, now: NOW })
    expect(fromDone.set.intent).toBe('callback')
    const no = run([{ text: '' }, { button: 'lc:call' }, { button: 'lc:p:any' }, { button: 'lc:t:pm' }, { button: 'lc:no' }], signedUp)
    expect(no.turns.some((t) => t.alert === 'ready')).toBe(false)
    expect(no.s.dominoAt).toBe(signedUp.dominoAt)
  })

  it('asks the place only when the tournament says any; directions go to where they play', () => {
    const { s, turns } = run([{ text: 'x' }, { button: 'lc:dyes' }, { button: 'lc:p:hialeah' }, { button: 'lc:n:1' }, { text: 'sí' }, { button: 'lc:dir' }], { ...base, event: ANY }, { domino: true })
    expect(turns[1].outs[0].buttons?.map((b) => b.id)).toEqual(['lc:p:calle8', 'lc:p:hialeah'])
    expect(turns[1].outs[0].text).toMatch(/En cuál quieres jugar/)
    expect(turns[4].outs[0].text).toContain('1550 W 84th St')
    expect(turns[5].set).toMatchObject({ step: 'pin', intent: 'directions', place: 'hialeah' })
    expect(s.dominoPlace).toBe('hialeah')
  })

  it('declines, cancels, and the old links: nothing goes anywhere it shouldn’t', () => {
    const declined = run([{ text: 'x' }, { button: 'lc:dyes' }, { button: 'lc:n:1' }, { button: 'lc:no' }], on, { domino: true })
    expect(declined.turns.some((t) => t.alert)).toBe(false)
    expect(declined.turns[3].outs[0].text).toMatch(/no te apuntamos/)
    expect(declined.s.dominoAt).toBeUndefined()

    const signedUp: LeadState = { ...on, step: 'rsvpDone', status: 'asking', dominoParty: 2, dominoAt: NOW.toISOString() }
    const cancel = turn(signedUp, { ...noInput, text: 'CANCELAR' }, { fresh: false, now: NOW })
    expect(cancel.alert).toBe('cancel')
    expect(cancel.set).toMatchObject({ dominoAt: null, dominoParty: null, dominoEvent: null })
    expect(cancel.outs[0].text).toMatch(/te sacamos del torneo/)

    // The tournament's link after it's over: the usual menu.
    const over = run([{ text: 'Quiero apuntarme al torneo de dominó (ref #la-capital ig-reel-domino es)' }], { ...base, event: PAST }, { domino: true })
    expect(over.turns[0].outs[0].buttons?.map((b) => b.id)).toEqual(['lc:visit', 'lc:call', 'lc:dir'])

    // With it on, DOMINÓ typed anywhere starts it, and GUAGUA still finds the bus.
    expect(turn({ ...on, step: 'when', intent: 'visit' }, { ...noInput, text: 'Dominó' }, { fresh: false, now: NOW }).set.step).toBe('dom')
    expect(turn(on, { ...noInput, text: 'guagua' }, { fresh: false, now: NOW }).set).toMatchObject({ step: 'place', intent: 'directions' })
  })

  it('builds the link that opens on the sign-up', () => {
    const url = laCapitalDominoLink(SENDER, 'ig-reel-domino', 'es')
    expect(decodeURIComponent(url)).toBe('https://wa.me/17864604851?text=Quiero apuntarme al torneo de dominó de La Capital (ref #la-capital ig-reel-domino es)')
    expect(wantsDomino(decodeURIComponent(laCapitalDominoLink(SENDER, 'tt', 'en')))).toBe(true)
  })
})

describe('the domino tournament (database)', () => {
  let payload: Payload
  const phone = `+1786555${String(Date.now()).slice(-4)}`
  const msg = (m: Partial<Incoming>): Incoming => ({ phone, name: 'Rosa Díaz', body: '', button: null, location: null, ...m })

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })
  beforeEach(() => resetInboundLimits())
  afterEach(() => {
    delete process.env.LA_CAPITAL_DOMINO
  })
  afterAll(async () => {
    await payload.delete({ collection: 'hq-leads', where: { phone: { equals: phone } }, overrideAccess: true })
  })

  it('the reel’s link goes straight to the sign-up, keeps its source, and saves the RSVP apart from the clinic consent', async () => {
    process.env.LA_CAPITAL_DOMINO = '2026-12-04T10:00|calle8'
    const body = decodeURIComponent(laCapitalDominoLink(SENDER, 'ig-reel-domino', 'es').split('text=')[1])
    let outs = await answerInbound(payload, msg({ body }), NOW)
    expect(outs[0].buttons?.map((b) => b.id)).toEqual(['lc:dyes', 'lc:skip'])
    await answerInbound(payload, msg({ button: 'lc:dyes' }), NOW)
    await answerInbound(payload, msg({ button: 'lc:n:2' }), NOW)
    outs = await answerInbound(payload, msg({ button: 'lc:dok' }), NOW)
    expect(outs[0].text).toMatch(/te apuntamos/)

    const l = (await payload.find({ collection: 'hq-leads', where: { phone: { equals: phone } }, overrideAccess: true })).docs[0]
    expect(l).toMatchObject({ source: 'ig-reel-domino', intent: 'domino', dominoParty: 2, dominoEvent: '2026-12-04T10:00', dominoPlace: 'calle8', step: 'rsvpDone' })
    expect(l.dominoAt).toBeTruthy()
    expect(l.dominoConsentText).toMatch(/Solo para el torneo/)
    expect(l.consentAt ?? null).toBeNull()
    expect(l.status).not.toBe('ready')
  })

  it('without a tournament set, the same link opens the usual menu', async () => {
    await payload.delete({ collection: 'hq-leads', where: { phone: { equals: phone } }, overrideAccess: true })
    const outs = await answerInbound(payload, msg({ body: 'Quiero apuntarme al torneo de dominó de La Capital (ref #la-capital ig-reel-domino es)' }), NOW)
    expect(outs[0].buttons?.map((b) => b.id)).toEqual(['lc:visit', 'lc:call', 'lc:dir'])
  })
})
