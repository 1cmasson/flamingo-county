// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { normalizePhone, resetOptinLimits, saveVoteOptin } from '@/lib/voteOptins'
import { storyPollCopy } from '@/lib/storyPollCopy'
import { POST as optinRoute } from '@/app/api/story-polls/whatsapp-optin/route'

/**
 * "Want to vote every week?" (lib/voteOptins.ts): a WhatsApp number in E.164
 * with the site's own consent sentence, one row per number, only while the
 * poll is open, only with the box ticked, and the vote's abuse guards.
 */

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const browser = (extra: Record<string, string> = {}) =>
  new Headers({ 'user-agent': IPHONE, 'sec-fetch-site': 'same-origin', host: 'flamingocounty.com', ...extra })

const T = (iso: string) => new Date(iso).getTime()
const opensAt = '2026-11-11T05:00:00.000Z'
const closesAt = '2026-11-16T04:59:00.000Z'
const during = T('2026-11-13T12:00:00Z')

describe('normalizePhone', () => {
  it('reads a US number however it is typed, as +1', () => {
    expect(normalizePhone('786 555 1234')).toBe('+17865551234')
    expect(normalizePhone('(786) 555-1234')).toBe('+17865551234')
    expect(normalizePhone('1-786-555-1234')).toBe('+17865551234')
    expect(normalizePhone('+1 786 555 1234')).toBe('+17865551234')
  })

  it('takes other countries with + , 00 or 011', () => {
    expect(normalizePhone('+53 5 123 4567')).toBe('+5351234567')
    expect(normalizePhone('0052 55 1234 5678')).toBe('+525512345678')
    expect(normalizePhone('011 58 412 123 4567')).toBe('+584121234567')
  })

  it('refuses what is not a phone number', () => {
    expect(normalizePhone('555 1234')).toBeNull()
    expect(normalizePhone('+1 786 555 12345')).toBeNull()
    expect(normalizePhone('+12345')).toBeNull()
    expect(normalizePhone('+1234567890123456')).toBeNull()
    expect(normalizePhone('786-555-ABCD')).toBeNull()
    expect(normalizePhone('786+5551234')).toBeNull()
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone(7865551234)).toBeNull()
  })
})

describe('saving an opt-in', () => {
  let payload: Payload
  let pollId: number
  const slug = `vote-optin-test-${Date.now()}`
  const phones = ['+17865550101', '+17865550102', '+17865550103', '+5351234567']

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await payload.delete({ collection: 'vote-whatsapp-optins', where: { phone: { in: phones } }, overrideAccess: true })
    const poll = await payload.create({
      collection: 'story-polls',
      data: {
        slug,
        title: 'Tú escoges',
        question: '¿Cuál?',
        opensAt,
        closesAt,
        options: [
          { key: 'a', title: 'A' },
          { key: 'b', title: 'B' },
        ],
        _status: 'published',
      },
      overrideAccess: true,
    })
    pollId = poll.id
  })
  beforeEach(() => resetOptinLimits())

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'vote-whatsapp-optins', where: { phone: { in: phones } }, overrideAccess: true })
    await payload.delete({ collection: 'story-polls', id: pollId, overrideAccess: true }).catch(() => undefined)
  })

  const rows = async (phone: string) =>
    (await payload.find({ collection: 'vote-whatsapp-optins', where: { phone: { equals: phone } }, overrideAccess: true, depth: 0 })).docs

  it('keeps the number in E.164 with the site’s own consent sentence, its source and when', async () => {
    const out = await saveVoteOptin(
      payload,
      { slug, phone: '(786) 555-0101', consent: true, lang: 'es', utm: 'ig', consentText: 'made up' } as never,
      browser(),
      during,
    )
    expect(out).toEqual({ ok: true, created: true })
    const [row] = await rows('+17865550101')
    expect(row).toMatchObject({
      phone: '+17865550101',
      lang: 'es',
      poll: pollId,
      consentText: storyPollCopy('es').optinConsent,
      source: 'instagram',
      status: 'active',
      test: false,
    })
    expect(new Date(row.consentAt).getTime()).toBe(during)
  })

  it('never adds a second row for the same number: it updates the language and keeps the first consent', async () => {
    const later = during + 3_600_000
    expect(await saveVoteOptin(payload, { slug, phone: '+1 786 555 0101', consent: true, lang: 'en' }, browser(), later)).toEqual({
      ok: true,
      created: false,
    })
    const found = await rows('+17865550101')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ lang: 'en', consentText: storyPollCopy('es').optinConsent })
    expect(new Date(found[0].consentAt).getTime()).toBe(during)
  })

  it('makes an unsubscribed number active again, from its new consent', async () => {
    const [row] = await rows('+17865550101')
    await payload.update({ collection: 'vote-whatsapp-optins', id: row.id, data: { status: 'unsubscribed' }, overrideAccess: true })
    const again = during + 7_200_000
    await saveVoteOptin(payload, { slug, phone: '7865550101', consent: true, lang: 'en' }, browser(), again)
    const [now] = await rows('+17865550101')
    expect(now).toMatchObject({ status: 'active', consentText: storyPollCopy('en').optinConsent })
    expect(new Date(now.consentAt).getTime()).toBe(again)
  })

  it('needs the box ticked and a real number', async () => {
    expect(await saveVoteOptin(payload, { slug, phone: '7865550102', consent: false }, browser(), during)).toEqual({ ok: false, reason: 'consent' })
    expect(await saveVoteOptin(payload, { slug, phone: '7865550102', consent: 'true' }, browser(), during)).toEqual({ ok: false, reason: 'consent' })
    expect(await saveVoteOptin(payload, { slug, phone: '555 0102', consent: true }, browser(), during)).toEqual({ ok: false, reason: 'phone' })
    expect(await rows('+17865550102')).toHaveLength(0)
  })

  it('refuses before the poll opens, after it closes, unknown polls, bots and other sites', async () => {
    const ok = { slug, phone: '7865550102', consent: true }
    expect(await saveVoteOptin(payload, ok, browser(), T('2026-11-10T00:00:00Z'))).toEqual({ ok: false, reason: 'closed' })
    expect(await saveVoteOptin(payload, ok, browser(), T('2026-11-17T00:00:00Z'))).toEqual({ ok: false, reason: 'closed' })
    expect(await saveVoteOptin(payload, { ...ok, slug: 'no-such-poll' }, browser(), during)).toEqual({ ok: false, reason: 'not-found' })
    expect(await saveVoteOptin(payload, ok, browser({ 'user-agent': 'facebookexternalhit/1.1' }), during)).toEqual({ ok: false, reason: 'refused' })
    expect(await saveVoteOptin(payload, ok, browser({ 'sec-fetch-site': 'cross-site' }), during)).toEqual({ ok: false, reason: 'refused' })
    expect(await rows('+17865550102')).toHaveLength(0)
  })

  it('marks a staff device’s sign-up as a test', async () => {
    await saveVoteOptin(payload, { slug, phone: '+53 5 123 4567', consent: true }, browser({ cookie: 'fc-self=1' }), during)
    expect((await rows('+5351234567'))[0]).toMatchObject({ test: true, lang: 'es' })
  })

  it('caps one address per day, without writing the address down', async () => {
    const h = browser({ 'cf-connecting-ip': '203.0.113.9' })
    const results = []
    for (let i = 0; i < 11; i++) results.push((await saveVoteOptin(payload, { slug, phone: '7865550103', consent: true }, h, during)).ok)
    expect(results.filter(Boolean)).toHaveLength(10)
    expect(await saveVoteOptin(payload, { slug, phone: '7865550103', consent: true }, h, during)).toEqual({ ok: false, reason: 'busy' })
    expect(JSON.stringify(await rows('+17865550103'))).not.toMatch(/203\.0\.113/)
  })

  it('answers a refusal over the route with a 4xx and no caching', async () => {
    // The route uses the real clock, so the poll may be open (no consent: 400) or closed (409).
    const res = await optinRoute(
      new Request('http://localhost/api/story-polls/whatsapp-optin', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': IPHONE, 'sec-fetch-site': 'same-origin' },
        body: JSON.stringify({ slug, phone: '7865550102', consent: false }),
      }),
    )
    expect([400, 409]).toContain(res.status)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const bad = await optinRoute(new Request('http://localhost/api/story-polls/whatsapp-optin', { method: 'POST', body: 'nope' }))
    expect(bad.status).toBe(400)
  })
})
