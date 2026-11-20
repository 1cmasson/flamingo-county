// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { asksForStats, hqStats, isOwnerWhatsapp, statsText, votesText, type HqStats } from '@/lib/hqStats'
import { validOut } from '@/lib/whatsapp'
import { answerInbound, resetInboundLimits } from '@/lib/whatsappInbound'

/**
 * The owner's numbers: one summary for Telegram (/stats) and his own
 * WhatsApp ("stats"), test rows left out, nobody else gets them.
 */

const sample: HqStats = {
  poll: {
    title: 'Elige la historia <1>',
    phase: 'open',
    total: 6,
    options: [
      { title: 'Bananas', n: 4 },
      { title: 'Capone', n: 2 },
    ],
    bySource: { instagram: 5, direct: 1 },
  },
  optins: { active: 1, newThisWeek: 1 },
  leads: { total: 3, newThisWeek: 2, waiting: 1, byStatus: { ready: 1, called: 1, visited: 1 }, bySource: { 'ig-reel-abuela': 2 } },
  coupons: { takenThisWeek: 0, usedThisWeek: 0 },
  domino: { event: '2026-12-04T10:00', rsvps: 3, people: 5, alsoAsked: 1 },
}

describe('the words', () => {
  it('says every number, escaped for Telegram and plain for WhatsApp', () => {
    const tg = statsText(sample, true)
    expect(tg).toContain('<b>📊 Últimos 7 días</b>')
    expect(tg).toContain('6 votos · instagram 5, direct 1')
    expect(tg).toContain('1 suscrito · 1 nuevo')
    expect(tg).toContain('2 nuevos · 1 esperando · 3 en total · ig-reel-abuela 2')
    expect(tg).toContain('llamados 1 · vinieron 1 · no vinieron 0')
    expect(tg).toContain('0 sacados · 0 usados')
    expect(tg).toContain('🎲 Torneo de dominó (12/04): 3 apuntados · 5 personas · 1 también pidió visita o llamada')
    expect(statsText({ ...sample, domino: { event: null, rsvps: 0, people: 0, alsoAsked: 0 } }, true)).not.toContain('dominó')
    const wa = statsText(sample, false)
    expect(wa).toContain('*📊 Últimos 7 días*')
    expect(wa).not.toMatch(/<\/?b>/)
  })

  it('splits the vote option by option, escaping the title for Telegram', () => {
    expect(votesText(sample, true)).toContain('Elige la historia &lt;1&gt;')
    expect(votesText(sample, false)).toContain('• Bananas: 4 (67%)')
    expect(votesText({ ...sample, poll: null }, false)).toBe('No hay votación publicada.')
  })

  it('hears the word or a stats button, nothing else', () => {
    expect(asksForStats('Stats', null)).toBe(true)
    expect(asksForStats(' estadísticas ', null)).toBe(true)
    expect(asksForStats('números', null)).toBe(true)
    expect(asksForStats('stats please tell me', null)).toBe(false)
    expect(asksForStats('', 'st:votes')).toBe(true)
    expect(asksForStats('', 'lc:visit')).toBe(false)
  })
})

describe('the owner asking on WhatsApp (database)', () => {
  let payload: Payload
  const OWNER = '+13055550100'
  const STRANGER = '+13055550199'
  const tag = `stats-test-${Date.now()}`

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const base = { flow: tag, lang: 'es' as const, status: 'ready' as const }
    await payload.create({ collection: 'hq-leads', data: { ...base, phone: '+13055550111', source: 'ig-reel-abuela' }, overrideAccess: true })
    await payload.create({ collection: 'hq-leads', data: { ...base, phone: '+13055550112', test: true }, overrideAccess: true })
    const at = new Date().toISOString()
    await payload.create({
      collection: 'hq-leads',
      data: { ...base, phone: '+13055550114', intent: 'domino', dominoAt: at, dominoEvent: '2026-12-04T10:00', dominoParty: 2, consentAt: at },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'hq-leads',
      data: { ...base, phone: '+13055550115', test: true, dominoAt: at, dominoEvent: '2026-12-04T10:00', dominoParty: 2 },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'vote-whatsapp-optins',
      data: { phone: '+13055550113', lang: 'es', status: 'active', consentText: tag, consentAt: new Date().toISOString() },
      overrideAccess: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.OWNER_WHATSAPP
    resetInboundLimits()
  })

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'hq-leads', where: { flow: { equals: tag } }, overrideAccess: true })
    await payload.delete({ collection: 'vote-whatsapp-optins', where: { consentText: { equals: tag } }, overrideAccess: true })
  })

  it('counts real rows only', async () => {
    const s = await hqStats(payload)
    const real = await payload.count({ collection: 'hq-leads', where: { test: { not_equals: true } }, overrideAccess: true })
    expect(s.leads.total).toBe(real.totalDocs)
    expect(s.leads.bySource['ig-reel-abuela']).toBeGreaterThanOrEqual(1)
    expect(s.optins.active).toBeGreaterThanOrEqual(1)
  })

  it('counts the tournament sign-ups set now, their people, and who also asked the clinic', async () => {
    const prev = process.env.LA_CAPITAL_DOMINO
    process.env.LA_CAPITAL_DOMINO = '2026-12-04T10:00|calle8'
    try {
      const real = await payload.count({
        collection: 'hq-leads',
        where: { and: [{ test: { not_equals: true } }, { dominoEvent: { equals: '2026-12-04T10:00' } }, { dominoAt: { exists: true } }] },
        overrideAccess: true,
      })
      const s = await hqStats(payload, new Date('2026-11-20T12:00:00Z'))
      expect(s.domino.event).toBe('2026-12-04T10:00')
      expect(s.domino.rsvps).toBe(real.totalDocs)
      expect(s.domino.people).toBeGreaterThanOrEqual(2)
      expect(s.domino.alsoAsked).toBeGreaterThanOrEqual(1)
      process.env.LA_CAPITAL_DOMINO = '2027-01-08T10:00|calle8'
      expect((await hqStats(payload, new Date('2026-11-20T12:00:00Z'))).domino.rsvps).toBe(0)
    } finally {
      if (prev === undefined) delete process.env.LA_CAPITAL_DOMINO
      else process.env.LA_CAPITAL_DOMINO = prev
    }
  })

  it('answers the owner with the numbers and three buttons; a stranger gets the usual reply', async () => {
    process.env.OWNER_WHATSAPP = '305 555 0100'
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}')))
    expect(isOwnerWhatsapp(OWNER)).toBe(true)

    const outs = await answerInbound(payload, { phone: OWNER, name: 'Carlos', body: 'stats', button: null, location: null })
    expect(outs).toHaveLength(1)
    expect(outs[0].text).toContain('Últimos 7 días')
    expect(outs[0].buttons?.map((b) => b.id)).toEqual(['st:sum', 'st:votes', 'st:leads'])
    expect(validOut(outs[0])).toBeNull()

    const leads = await answerInbound(payload, { phone: OWNER, name: 'Carlos', body: 'Pedidos', button: 'st:leads', location: null })
    expect(leads[0].text).not.toMatch(/<[^>]+>/)
    expect(validOut(leads[0])).toBeNull()

    const other = await answerInbound(payload, { phone: STRANGER, name: 'X', body: 'stats', button: null, location: null })
    expect(other[0].text).not.toContain('Últimos 7 días')
    expect(other[0].buttons).toBeUndefined()
  })
})
