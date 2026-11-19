// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { POLL_CLOSED_EVENT, POLL_TASK_PREFIX, announcePollWinners, winnerText } from '@/lib/pollWinnerNotice'

/**
 * The fan-vote winner announcement (lib/pollWinnerNotice.ts): once a weekly
 * story vote closes, one Telegram message with the split and one task to
 * build the winner. Once per poll however often the job runs.
 */

const OWNER = 1001
const OPENS = '2026-11-18T21:00:00.000Z'
const CLOSES = '2026-11-24T17:00:00.000Z' // Tue Nov 24, noon in Miami (EST)
const BEFORE = new Date('2026-11-24T16:59:00Z')
const AT_1205 = new Date('2026-11-24T17:05:00Z')
const AT_1305 = new Date('2026-11-24T18:05:00Z')
const WEEK_LATER = new Date('2026-12-01T17:05:00Z')

const options = [
  { key: 'jack-tigertail', title: 'The man on the Hialeah sign' },
  { key: 'emilio-parte-2', title: 'Emilio Estefan, part 2' },
  { key: 'chiquita', title: 'The Banana Wars', commentVotes: 2 },
]

function fakeTelegram(opts: { down?: boolean } = {}) {
  const sent: { method: string; body: Record<string, unknown> }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const method = String(input).split('/').pop()!
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      sent.push({ method, body })
      if (opts.down && method === 'sendMessage') return Response.json({ ok: false, description: 'down' })
      return Response.json({ ok: true, result: { message_id: 1 } })
    }),
  )
  return { of: (method: string) => sent.filter((s) => s.method === method) }
}

describe('winnerText', () => {
  const poll = { id: 1, slug: 'semana-25-nov-2026', title: 'You pick', winnerPostsOn: '2026-11-25T05:00:00.000Z', options }

  it('leads with the winner, then every option in ballot order', () => {
    const text = winnerText(poll, { 'jack-tigertail': 1, 'emilio-parte-2': 3, chiquita: 3 }, 7)
    // A tie goes to the option listed first.
    expect(text).toContain('🏆 <b>Emilio Estefan, part 2</b>: 3 of 7 votes (43%)')
    expect(text).toContain('Posts Wednesday, Nov 25.')
    expect(text.indexOf('The man on the Hialeah sign: 1')).toBeLessThan(text.indexOf('The Banana Wars: 3'))
    expect(text).toContain('https://flamingocounty.com/en/vota/semana-25-nov-2026')
  })

  it('says so when nobody voted', () => {
    expect(winnerText(poll, {}, 0)).toContain('No votes, so no winner.')
  })
})

describe('announcing a closed poll', () => {
  let payload: Payload
  let pollId: number
  const slug = `poll-winner-test-${Date.now()}`

  const events = () =>
    payload
      .count({ collection: 'hq-events', where: { and: [{ type: { equals: POLL_CLOSED_EVENT } }, { refId: { equals: String(pollId) } }] }, overrideAccess: true })
      .then((r) => r.totalDocs)
  const tasks = () =>
    payload
      .find({ collection: 'hq-tasks', where: { title: { contains: POLL_TASK_PREFIX } }, depth: 0, overrideAccess: true })
      .then((r) => r.docs)

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const poll = await payload.create({
      collection: 'story-polls',
      locale: 'en',
      data: { slug, title: 'You pick', question: 'Which?', opensAt: OPENS, closesAt: CLOSES, winnerPostsOn: '2026-11-25T05:00:00.000Z', options, _status: 'published' },
      overrideAccess: true,
    })
    pollId = poll.id
    for (const option of ['jack-tigertail', 'chiquita']) {
      await payload.create({ collection: 'story-poll-votes', data: { poll: pollId, option }, overrideAccess: true })
    }
  })

  beforeEach(async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.TELEGRAM_OWNER_CHAT_ID = String(OWNER)
    delete process.env.HQ_POLL_WINNER
    await payload.delete({ collection: 'hq-events', where: { type: { equals: POLL_CLOSED_EVENT } }, overrideAccess: true })
    await payload.delete({ collection: 'hq-tasks', where: { title: { contains: POLL_TASK_PREFIX } }, overrideAccess: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_OWNER_CHAT_ID
    delete process.env.HQ_POLL_WINNER
  })

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'hq-events', where: { type: { equals: POLL_CLOSED_EVENT } }, overrideAccess: true })
    await payload.delete({ collection: 'hq-tasks', where: { title: { contains: POLL_TASK_PREFIX } }, overrideAccess: true })
    await payload.delete({ collection: 'story-poll-votes', where: { poll: { equals: pollId } }, overrideAccess: true })
    await payload.delete({ collection: 'story-polls', id: pollId, overrideAccess: true }).catch(() => undefined)
  })

  it('waits for the close, then announces once with the winner and files one task', async () => {
    const tg = fakeTelegram()
    expect(await announcePollWinners(payload, BEFORE)).toBe(0)
    expect(await announcePollWinners(payload, AT_1205)).toBe(1)
    expect(await announcePollWinners(payload, AT_1205)).toBe(0)
    expect(await announcePollWinners(payload, AT_1305)).toBe(0)

    const sends = tg.of('sendMessage')
    expect(sends).toHaveLength(1)
    // 1 site vote + 2 counted comments beats 1 site vote.
    expect(String(sends[0].body.text)).toContain('🏆 <b>The Banana Wars</b>: 3 of 4 votes (75%)')
    expect(await events()).toBe(1)
    const filed = await tasks()
    expect(filed).toHaveLength(1)
    expect(filed[0]).toMatchObject({ assignee: 'claude', status: 'open' })
    expect(filed[0].title).toBe(`${POLL_TASK_PREFIX}The Banana Wars (Wednesday, Nov 25)`)
  })

  it('leaves a poll that closed long ago alone', async () => {
    const tg = fakeTelegram()
    expect(await announcePollWinners(payload, WEEK_LATER)).toBe(0)
    expect(tg.of('sendMessage')).toHaveLength(0)
  })

  it('tries again next hour when the send fails, and can be switched off', async () => {
    fakeTelegram({ down: true })
    await expect(announcePollWinners(payload, AT_1205)).rejects.toThrow()
    expect(await events()).toBe(0)

    process.env.HQ_POLL_WINNER = 'off'
    const tg = fakeTelegram()
    expect(await announcePollWinners(payload, AT_1305)).toBe(0)
    delete process.env.HQ_POLL_WINNER
    expect(await announcePollWinners(payload, AT_1305)).toBe(1)
    expect(tg.of('sendMessage')).toHaveLength(1)
  })
})
