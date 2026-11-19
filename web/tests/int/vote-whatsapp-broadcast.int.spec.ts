// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { resetOptinLimits, saveVoteOptin } from '@/lib/voteOptins'
import {
  VOTE_OFFER_EVENT,
  VOTE_TEMPLATES,
  decideVoteBroadcast,
  offerVoteBroadcasts,
  openVars,
  parseVoteBroadcastCallback,
  parseVoteResultCallback,
  resultAudienceCount,
  sendVoteResult,
  settleVoteWelcomes,
} from '@/lib/voteWhatsapp'
import { POLL_CLOSED_EVENT, POLL_TASK_PREFIX, announcePollWinners } from '@/lib/pollWinnerNotice'
import { sendMessage, telegramConfigured } from '@/lib/telegram'

/**
 * The weekly vote on WhatsApp (lib/voteWhatsapp.ts): the welcome when someone
 * signs up, and "the vote is open" only after the owner's Telegram tap, once
 * per number per vote, never to an unsubscribed number.
 */

vi.mock('@/lib/telegram', async (orig) => ({
  ...(await orig<typeof import('@/lib/telegram')>()),
  telegramConfigured: vi.fn(() => true),
  sendMessage: vi.fn(async () => ({ message_id: 1 })),
}))
const tg = vi.mocked(sendMessage)

type TwilioCall = { to: string; sid: string | null; vars: Record<string, string> | null }

/** Twilio's Messages API, mocked: records each send; `refuse` numbers get a 400. */
function fakeTwilio(refuse: string[] = []) {
  const calls: TwilioCall[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (!url.includes('api.twilio.com')) throw new Error(`unexpected fetch ${url}`)
      const form = new URLSearchParams(String(init?.body ?? ''))
      const to = (form.get('To') ?? '').replace('whatsapp:', '')
      const vars = form.get('ContentVariables')
      calls.push({ to, sid: form.get('ContentSid'), vars: vars ? JSON.parse(vars) : null })
      if (refuse.includes(to)) return Response.json({ message: 'nope' }, { status: 400 })
      return Response.json({ sid: 'SM1' }, { status: 201 })
    }),
  )
  return calls
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const browser = () => new Headers({ 'user-agent': IPHONE, 'sec-fetch-site': 'same-origin', host: 'flamingocounty.com' })

// Far from any other test's polls, so this one is the only vote open.
const OPENS = '2031-03-04T05:00:00.000Z'
const CLOSES = '2031-03-10T17:00:00.000Z'
const DURING = new Date('2031-03-05T15:00:00Z')
const AFTER = new Date('2031-03-11T15:00:00Z')

const P = {
  es: '+17865550301',
  en: '+17865550302',
  test: '+17865550303',
  baja: '+17865550304',
  voted: '+17865550305',
  welcomeEs: '+17865550306',
  welcomeEn: '+17865550307',
}
const ALL = Object.values(P)

describe('pure parts', () => {
  it('reads the offer buttons', () => {
    expect(parseVoteBroadcastCallback('vb:s:12')).toEqual({ action: 'send', pollId: 12 })
    expect(parseVoteBroadcastCallback('vb:k:12')).toEqual({ action: 'skip', pollId: 12 })
    expect(parseVoteBroadcastCallback('wl:c:12')).toBeNull()
  })

  it('quotes the question in its language, on one line, and tags the link as WhatsApp', () => {
    expect(openVars('es', '¿Qué cuento\ncuenta   Flacko?', 'semana-x')).toEqual({
      '1': '«¿Qué cuento cuenta Flacko?»',
      '2': 'https://flamingocounty.com/es/vota/semana-x?utm_source=whatsapp',
    })
    expect(openVars('en', 'Which story?', 'semana-x')['1']).toBe('“Which story?”')
  })
})

describe('the vote on WhatsApp', () => {
  let payload: Payload
  let pollId: number
  let otherPollId: number
  const slug = `vote-broadcast-test-${Date.now()}`

  const row = async (phone: string) =>
    (await payload.find({ collection: 'vote-whatsapp-optins', where: { phone: { equals: phone } }, depth: 0, overrideAccess: true })).docs[0]
  const mine = (calls: TwilioCall[]) => calls.filter((c) => ALL.includes(c.to))

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await payload.delete({ collection: 'vote-whatsapp-optins', where: { phone: { in: ALL } }, overrideAccess: true })
    const poll = await payload.create({
      collection: 'story-polls',
      locale: 'es',
      data: {
        slug,
        title: 'Tú escoges el cuento',
        question: '¿Qué cuento cuenta Flacko?',
        opensAt: OPENS,
        closesAt: CLOSES,
        options: [
          { key: 'a', title: 'La guerra de las bananas' },
          { key: 'b', title: 'El letrero' },
        ],
        _status: 'published',
      },
      overrideAccess: true,
    })
    pollId = poll.id
    await payload.update({
      collection: 'story-polls',
      id: pollId,
      locale: 'en',
      data: { title: 'You pick the story', question: 'Which story should Flacko tell?' },
      overrideAccess: true,
    })
    const other = await payload.create({
      collection: 'story-polls',
      data: { slug: `${slug}-old`, title: 'Old', question: '¿Vieja?', opensAt: '2031-02-01T05:00:00.000Z', closesAt: '2031-02-08T05:00:00.000Z', options: [{ key: 'a', title: 'A' }], _status: 'published' },
      overrideAccess: true,
    })
    otherPollId = other.id
  })

  const seed = async () => {
    await payload.delete({ collection: 'vote-whatsapp-optins', where: { phone: { in: ALL } }, overrideAccess: true })
    const base = { consentText: 'Sí', consentAt: '2031-02-02T12:00:00.000Z', poll: otherPollId }
    const make = (phone: string, data: Record<string, unknown>) =>
      payload.create({ collection: 'vote-whatsapp-optins', data: { phone, lang: 'es', status: 'active', ...base, ...data } as never, overrideAccess: true })
    await make(P.es, {})
    await make(P.en, { lang: 'en' })
    await make(P.test, { test: true })
    await make(P.baja, { status: 'unsubscribed' })
    // Signed up from this very vote: they've voted, so they're not told it's open.
    await make(P.voted, { poll: pollId })
  }

  beforeEach(async () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACtest'
    process.env.TWILIO_AUTH_TOKEN = 'token'
    process.env.WHATSAPP_SENDER_NUMBER = '+17864604851'
    delete process.env.HQ_VOTE_BROADCAST
    resetOptinLimits()
    tg.mockReset()
    tg.mockResolvedValue({ message_id: 1 })
    vi.mocked(telegramConfigured).mockReturnValue(true)
    await payload.delete({ collection: 'hq-events', where: { type: { equals: VOTE_OFFER_EVENT } }, overrideAccess: true })
    await seed()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.TWILIO_ACCOUNT_SID
    delete process.env.TWILIO_AUTH_TOKEN
    delete process.env.WHATSAPP_SENDER_NUMBER
  })

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'vote-whatsapp-optins', where: { phone: { in: ALL } }, overrideAccess: true })
    await payload.delete({ collection: 'hq-events', where: { type: { equals: VOTE_OFFER_EVENT } }, overrideAccess: true })
    for (const id of [pollId, otherPollId]) await payload.delete({ collection: 'story-polls', id, overrideAccess: true }).catch(() => undefined)
  })

  it('welcomes a new number once, in its language, and again only after BAJA', async () => {
    const calls = fakeTwilio()
    const save = (phone: string, lang: string) =>
      saveVoteOptin(payload, { slug, phone, consent: true, lang }, browser(), DURING.getTime())

    await save(P.welcomeEs, 'es')
    await save(P.welcomeEn, 'en')
    await settleVoteWelcomes()
    expect(mine(calls)).toEqual([
      { to: P.welcomeEs, sid: VOTE_TEMPLATES.welcome.es, vars: null },
      { to: P.welcomeEn, sid: VOTE_TEMPLATES.welcome.en, vars: null },
    ])

    // Saving the same active number again isn't a new sign-up.
    await save(P.welcomeEs, 'es')
    await settleVoteWelcomes()
    expect(mine(calls)).toHaveLength(2)

    // BAJA, then the box ticked again: welcomed again.
    await payload.update({ collection: 'vote-whatsapp-optins', where: { phone: { equals: P.welcomeEs } }, data: { status: 'unsubscribed' }, overrideAccess: true })
    await save(P.welcomeEs, 'es')
    await settleVoteWelcomes()
    expect(mine(calls)).toHaveLength(3)
  })

  it('a failed welcome never breaks the sign-up', async () => {
    fakeTwilio([P.welcomeEs])
    const out = await saveVoteOptin(payload, { slug, phone: P.welcomeEs, consent: true, lang: 'es' }, browser(), DURING.getTime())
    await settleVoteWelcomes()
    expect(out.ok).toBe(true)
    expect((await row(P.welcomeEs))?.status).toBe('active')
  })

  it('offers an open vote to the owner once, and sends nothing by itself', async () => {
    const calls = fakeTwilio()
    const extra = (
      await payload.find({
        collection: 'vote-whatsapp-optins',
        where: { and: [{ status: { equals: 'active' } }, { phone: { not_in: ALL } }] },
        limit: 0,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })
    ).docs.filter((d) => d.poll !== pollId && d.lastPollSentId !== pollId).length

    expect(await offerVoteBroadcasts(payload, DURING)).toBe(1)
    expect(await offerVoteBroadcasts(payload, DURING)).toBe(0)
    expect(tg).toHaveBeenCalledTimes(1)
    const [text, opts] = tg.mock.calls[0]
    expect(text).toContain('Votación abierta: Tú escoges el cuento')
    expect(text).toContain('«¿Qué cuento cuenta Flacko?»')
    expect(opts?.keyboard?.inline_keyboard[0].map((b) => b.callback_data)).toEqual([`vb:s:${pollId}`, `vb:k:${pollId}`])
    expect(opts?.keyboard?.inline_keyboard[0][0].text).toBe(`📣 Enviar a ${3 + extra}`)
    expect(calls).toHaveLength(0)
  })

  it('a failed offer is tried again the next hour', async () => {
    fakeTwilio()
    tg.mockRejectedValueOnce(new Error('down'))
    await expect(offerVoteBroadcasts(payload, DURING)).rejects.toThrow('down')
    expect(await offerVoteBroadcasts(payload, DURING)).toBe(1)
  })

  it('is off with HQ_VOTE_BROADCAST=off, and closed votes are not offered', async () => {
    fakeTwilio()
    process.env.HQ_VOTE_BROADCAST = 'off'
    expect(await offerVoteBroadcasts(payload, DURING)).toBe(0)
    delete process.env.HQ_VOTE_BROADCAST
    expect(await offerVoteBroadcasts(payload, AFTER)).toBe(0)
    expect(tg).not.toHaveBeenCalled()
  })

  it('Send: only active numbers that haven’t had it, each in its language, never twice', async () => {
    const calls = fakeTwilio()
    const out = await decideVoteBroadcast(payload, pollId, 'send', DURING)
    const got = mine(calls)
    expect(got.map((c) => c.to).sort()).toEqual([P.es, P.en, P.test].sort())
    expect(got.find((c) => c.to === P.es)).toEqual({
      to: P.es,
      sid: VOTE_TEMPLATES.open.es,
      vars: { '1': '«¿Qué cuento cuenta Flacko?»', '2': `https://flamingocounty.com/es/vota/${slug}?utm_source=whatsapp` },
    })
    expect(got.find((c) => c.to === P.en)).toEqual({
      to: P.en,
      sid: VOTE_TEMPLATES.open.en,
      vars: { '1': '“Which story should Flacko tell?”', '2': `https://flamingocounty.com/en/vota/${slug}?utm_source=whatsapp` },
    })
    expect(out.retry).toBe(0)
    expect(out.text).toMatch(/^📣 Enviado a \d+\.$/)
    expect((await row(P.es))?.lastPollSentId).toBe(pollId)

    // A second tap: nobody gets it again.
    const before = mine(calls).length
    const again = await decideVoteBroadcast(payload, pollId, 'send', DURING)
    expect(mine(calls)).toHaveLength(before)
    expect(again.text).toContain('Ya les había llegado')
  })

  it('one refused number doesn’t stop the rest, and a retry sends only that one', async () => {
    const calls = fakeTwilio([P.en])
    const out = await decideVoteBroadcast(payload, pollId, 'send', DURING)
    expect(mine(calls).map((c) => c.to).sort()).toEqual([P.es, P.en, P.test].sort())
    expect(out.retry).toBe(1)
    expect(out.text).toContain('fallaron 1')
    expect((await row(P.en))?.lastPollSentId ?? null).toBeNull()
    expect((await row(P.es))?.lastPollSentId).toBe(pollId)

    const retry = fakeTwilio()
    await decideVoteBroadcast(payload, pollId, 'send', DURING)
    expect(mine(retry).map((c) => c.to)).toEqual([P.en])
  })

  it('a BAJA between the offer and the tap is respected', async () => {
    const calls = fakeTwilio()
    await payload.update({ collection: 'vote-whatsapp-optins', where: { phone: { equals: P.test } }, data: { status: 'unsubscribed' }, overrideAccess: true })
    await decideVoteBroadcast(payload, pollId, 'send', DURING)
    expect(mine(calls).map((c) => c.to)).not.toContain(P.test)
  })

  it('Skip sends nothing, and a closed vote sends nothing', async () => {
    const calls = fakeTwilio()
    await offerVoteBroadcasts(payload, DURING)
    const out = await decideVoteBroadcast(payload, pollId, 'skip', DURING)
    expect(out.text).toContain('No se envió')
    const ev = (await payload.find({ collection: 'hq-events', where: { type: { equals: VOTE_OFFER_EVENT } }, depth: 0, overrideAccess: true })).docs[0]
    expect(ev?.data).toMatchObject({ state: 'skipped' })
    const late = await decideVoteBroadcast(payload, pollId, 'send', AFTER)
    expect(late.text).toContain('ya cerró')
    expect(calls).toHaveLength(0)
  })

  it('without Twilio set up, a tap says so and sends nothing', async () => {
    const calls = fakeTwilio()
    delete process.env.TWILIO_ACCOUNT_SID
    const out = await decideVoteBroadcast(payload, pollId, 'send', DURING)
    expect(out.text).toContain('no está configurado')
    expect(calls).toHaveLength(0)
  })
  describe('the winner', () => {
    const cleanup = async () => {
      await payload.delete({ collection: 'story-poll-votes', where: { poll: { equals: pollId } }, overrideAccess: true })
      await payload.delete({ collection: 'hq-events', where: { type: { equals: POLL_CLOSED_EVENT } }, overrideAccess: true })
      await payload.delete({ collection: 'hq-tasks', where: { title: { contains: POLL_TASK_PREFIX } }, overrideAccess: true })
    }
    beforeEach(async () => {
      await cleanup()
      await payload.create({ collection: 'story-poll-votes', data: { poll: pollId, option: 'a' }, overrideAccess: true })
    })
    afterAll(cleanup)

    it('reads its button', () => {
      expect(parseVoteResultCallback('vr:s:12')).toBe(12)
      expect(parseVoteResultCallback('vb:s:12')).toBeNull()
    })

    it('goes only to numbers tied to this vote, after it closes, once each', async () => {
      fakeTwilio()
      await decideVoteBroadcast(payload, pollId, 'send', DURING)
      const early = fakeTwilio()
      expect((await sendVoteResult(payload, pollId, DURING)).text).toContain('sigue abierta')
      expect(early).toHaveLength(0)

      expect(await resultAudienceCount(payload, pollId)).toBe(4)
      const calls = fakeTwilio()
      const out = await sendVoteResult(payload, pollId, AFTER)
      const got = mine(calls)
      expect(got.map((c) => c.to).sort()).toEqual([P.es, P.en, P.test, P.voted].sort())
      expect(got.find((c) => c.to === P.es)).toEqual({
        to: P.es,
        sid: VOTE_TEMPLATES.result.es,
        vars: { '1': 'La guerra de las bananas', '2': `https://flamingocounty.com/es/vota/${slug}?utm_source=whatsapp` },
      })
      expect(got.find((c) => c.to === P.en)?.sid).toBe(VOTE_TEMPLATES.result.en)
      expect(out.text).toBe('📣 Ganador enviado a 4.')

      const again = fakeTwilio()
      expect((await sendVoteResult(payload, pollId, AFTER)).text).toContain('Ya les había llegado')
      expect(mine(again)).toHaveLength(0)
    })

    it('a refused number is retried alone', async () => {
      fakeTwilio([P.voted])
      const out = await sendVoteResult(payload, pollId, AFTER)
      expect(out.retry).toBe(1)
      const retry = fakeTwilio()
      await sendVoteResult(payload, pollId, AFTER)
      expect(mine(retry).map((c) => c.to)).toEqual([P.voted])
    })

    it('the owner’s winner message carries the button with the count', async () => {
      fakeTwilio()
      expect(await announcePollWinners(payload, AFTER)).toBe(1)
      const call = tg.mock.calls.find((c) => String(c[0]).includes('Vote closed'))
      expect(call?.[1]).toEqual({ keyboard: { inline_keyboard: [[{ text: '📣 Enviar ganador a 1', callback_data: `vr:s:${pollId}` }]] } })
    })
  })
})
