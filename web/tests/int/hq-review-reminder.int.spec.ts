// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { reviewReminder } from '@/jobs/reviewReminder'
import { REVIEW_PREFIX } from '@/lib/growth'
import { parseDraftCallback } from '@/lib/hq'
import {
  REMINDER_EVENT,
  REVIEW_CALLBACK,
  isReminderTime,
  reminderText,
  sendReviewReminder,
  weekNumbers,
} from '@/lib/reviewReminder'
import { handleUpdate } from '@/lib/telegramBot'

/**
 * The Monday growth review reminder (lib/reviewReminder.ts): one message a
 * week with a ▶️ Run the review button that files the same task as /review.
 */

// Monday 2026-10-19, on a Miami (EDT, UTC−4) clock.
const MON_0730 = new Date('2026-10-19T11:30:00Z')
const MON_0805 = new Date('2026-10-19T12:05:00Z')
const MON_0905 = new Date('2026-10-19T13:05:00Z')
const TUE_0805 = new Date('2026-10-20T12:05:00Z')
const NEXT_MON_0805 = new Date('2026-10-26T12:05:00Z')

const OWNER = 1001
const STRANGER = 2002

function fakeTelegram(opts: { down?: boolean } = {}) {
  const sent: { method: string; body: Record<string, unknown> }[] = []
  let messageId = 900
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const method = String(input).split('/').pop()!
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
    sent.push({ method, body })
    if (opts.down && method === 'sendMessage') return Response.json({ ok: false, description: 'down' })
    return Response.json({ ok: true, result: { message_id: ++messageId } })
  })
  vi.stubGlobal('fetch', fetch)
  return { fetch, sent, of: (method: string) => sent.filter((s) => s.method === method) }
}

describe('reminder helpers', () => {
  it('fires on Mondays from 8 AM Miami time only', () => {
    expect(isReminderTime(MON_0730)).toBe(false)
    expect(isReminderTime(MON_0805)).toBe(true)
    expect(isReminderTime(MON_0905)).toBe(true)
    expect(isReminderTime(TUE_0805)).toBe(false)
    // After the clocks go back (Nov 2, EST, UTC−5): 12:05Z is 7:05 AM.
    expect(isReminderTime(new Date('2026-11-02T12:05:00Z'))).toBe(false)
    expect(isReminderTime(new Date('2026-11-02T13:05:00Z'))).toBe(true)
  })

  it('is just the reminder when there are no numbers', () => {
    expect(reminderText({ followers: null, reels: null, best: null })).toBe('📈 <b>Weekly growth review is ready to run.</b>')
  })

  it('is not mistaken for a draft button', () => {
    expect(parseDraftCallback(REVIEW_CALLBACK)).toBeNull()
  })
})

describe('the weekly review reminder', () => {
  let payload: Payload
  const statIds: number[] = []

  const reminders = () =>
    payload.count({ collection: 'hq-events', where: { type: { equals: REMINDER_EVENT } }, overrideAccess: true }).then((r) => r.totalDocs)
  const openReviews = () =>
    payload
      .find({
        collection: 'hq-tasks',
        where: { and: [{ title: { contains: REVIEW_PREFIX } }, { status: { not_equals: 'done' } }] },
        depth: 0,
        overrideAccess: true,
      })
      .then((r) => r.docs)
  const tap = (from = OWNER, chat: { id: number; type?: string } = { id: from, type: 'private' }) =>
    handleUpdate(payload, {
      callback_query: { id: 'cb', from: { id: from }, data: REVIEW_CALLBACK, message: { chat, message_id: 42 } },
    })

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  beforeEach(async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.TELEGRAM_OWNER_CHAT_ID = String(OWNER)
    delete process.env.HQ_REVIEW_REMINDER
    await payload.delete({ collection: 'hq-events', where: { type: { equals: REMINDER_EVENT } }, overrideAccess: true })
    await payload.delete({ collection: 'hq-tasks', where: { title: { contains: REVIEW_PREFIX } }, overrideAccess: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_OWNER_CHAT_ID
    delete process.env.HQ_REVIEW_REMINDER
  })

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'hq-events', where: { type: { equals: REMINDER_EVENT } }, overrideAccess: true })
    await payload.delete({ collection: 'hq-tasks', where: { title: { contains: REVIEW_PREFIX } }, overrideAccess: true })
    if (statIds.length) await payload.delete({ collection: 'hq-social-stats', where: { id: { in: statIds } }, overrideAccess: true })
  })

  it('sends once a week, with the button, however many times the job runs', async () => {
    const tg = fakeTelegram()
    expect(await sendReviewReminder(payload, MON_0730)).toBe(false)
    expect(await sendReviewReminder(payload, MON_0805)).toBe(true)
    // The same hour retried, the next hour, the next day: nothing more.
    expect(await sendReviewReminder(payload, MON_0805)).toBe(false)
    expect(await sendReviewReminder(payload, MON_0905)).toBe(false)
    expect(await sendReviewReminder(payload, TUE_0805)).toBe(false)

    const sends = tg.of('sendMessage')
    expect(sends).toHaveLength(1)
    expect(String(sends[0].body.text)).toContain('Weekly growth review is ready to run.')
    expect(sends[0].body.reply_markup).toEqual({ inline_keyboard: [[{ text: '▶️ Run the review', callback_data: REVIEW_CALLBACK }]] })
    expect(await reminders()).toBe(1)
    // Filing a task is the button's job, not the reminder's.
    expect(await openReviews()).toHaveLength(0)

    expect(await sendReviewReminder(payload, NEXT_MON_0805)).toBe(true)
    expect(tg.of('sendMessage')).toHaveLength(2)
  })

  it('the hourly job itself sends once, retried or not', async () => {
    const tg = fakeTelegram()
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(MON_0805)
      // A function handler, not a file path: see src/jobs/reviewReminder.ts.
      const handler = reviewReminder.handler as (args: never) => Promise<{ output: { sent: boolean } }>
      const run = () => handler({ req: { payload } } as never)
      expect((await run()).output.sent).toBe(true)
      expect((await run()).output.sent).toBe(false)
      vi.setSystemTime(MON_0905)
      expect((await run()).output.sent).toBe(false)
    } finally {
      vi.useRealTimers()
    }
    expect(tg.of('sendMessage')).toHaveLength(1)
  })

  it('two runs at once still send one', async () => {
    const tg = fakeTelegram()
    const results = await Promise.all([sendReviewReminder(payload, MON_0805), sendReviewReminder(payload, MON_0805)])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(tg.of('sendMessage')).toHaveLength(1)
  })

  it('a failed send is tried again on the next run', async () => {
    fakeTelegram({ down: true })
    await expect(sendReviewReminder(payload, MON_0805)).rejects.toThrow(/Telegram sendMessage failed/)
    expect(await reminders()).toBe(0)
    const tg = fakeTelegram()
    expect(await sendReviewReminder(payload, MON_0905)).toBe(true)
    expect(tg.of('sendMessage')).toHaveLength(1)
  })

  it('switched off, sends nothing and writes nothing', async () => {
    const tg = fakeTelegram()
    process.env.HQ_REVIEW_REMINDER = 'off'
    expect(await sendReviewReminder(payload, MON_0805)).toBe(false)
    expect(tg.fetch).not.toHaveBeenCalled()
    expect(await reminders()).toBe(0)
  })

  it('without Telegram, sends nothing and does not use up the week', async () => {
    const tg = fakeTelegram()
    delete process.env.TELEGRAM_BOT_TOKEN
    expect(await sendReviewReminder(payload, MON_0805)).toBe(false)
    expect(tg.fetch).not.toHaveBeenCalled()
    expect(await reminders()).toBe(0)
  })

  it('the owner’s tap files exactly one review task, and a second tap says so', async () => {
    const tg = fakeTelegram()
    await tap()
    const open = await openReviews()
    expect(open).toHaveLength(1)
    expect(open[0]).toMatchObject({ assignee: 'claude', status: 'open' })
    expect(open[0].title.startsWith(REVIEW_PREFIX)).toBe(true)
    expect(open[0].detail).toContain('Run the review button')

    const edits = tg.of('editMessageText')
    expect(edits).toHaveLength(1)
    expect(edits[0].body).toMatchObject({
      chat_id: OWNER,
      message_id: 42,
      text: 'Review requested ✅ — Claude will run it at the next session.',
      reply_markup: { inline_keyboard: [] },
    })

    await tap()
    expect(await openReviews()).toHaveLength(1)
    expect(tg.of('editMessageText')[1].body.text).toBe(`Already requested ✅ — task #${open[0].id} is waiting for Claude.`)
  })

  it('a double tap racing itself files one task', async () => {
    fakeTelegram()
    await Promise.all([tap(), tap()])
    expect(await openReviews()).toHaveLength(1)
  })

  it('points at a review asked for with /review instead of filing another', async () => {
    const tg = fakeTelegram()
    await handleUpdate(payload, { message: { chat: { id: OWNER, type: 'private' }, from: { id: OWNER }, text: '/review' } })
    const [task] = await openReviews()
    await tap()
    expect(await openReviews()).toHaveLength(1)
    expect(tg.of('editMessageText')[0].body.text).toContain(`task #${task.id}`)
  })

  it('ignores anyone else’s tap, and the owner’s tap in a group', async () => {
    const tg = fakeTelegram()
    await tap(STRANGER)
    await tap(OWNER, { id: -100123, type: 'supergroup' })
    expect(await openReviews()).toHaveLength(0)
    expect(tg.fetch).not.toHaveBeenCalled()
  })

  it('falls back to a reply when the message can no longer be edited', async () => {
    const sent: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const method = String(input).split('/').pop()!
        sent.push(method)
        if (method === 'editMessageText') return Response.json({ ok: false, description: "Bad Request: message can't be edited" })
        return Response.json({ ok: true, result: { message_id: 1 } })
      }),
    )
    await tap()
    expect(await openReviews()).toHaveLength(1)
    expect(sent).toContain('sendMessage')
  })

  it('reads last week’s followers and reels, ranking each reel by its latest reading', async () => {
    const now = new Date()
    const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()
    const stat = async (data: Record<string, unknown>) => {
      const doc = await payload.create({ collection: 'hq-social-stats', data: data as never, overrideAccess: true })
      statIds.push(doc.id)
    }
    const fol = (label: string, n: number) => ({ [label]: { latest: n, sum: n }, Reach: { latest: 5, sum: 50 } })
    await stat({ kind: 'channel', platform: 'instagram', metrics: fol('Followers', 100), createdAt: ago(170) })
    await stat({ kind: 'channel', platform: 'instagram', metrics: fol('Followers', 112), createdAt: ago(2) })
    await stat({ kind: 'channel', platform: 'facebook', metrics: fol('Page followers', 50), createdAt: ago(170) })
    await stat({ kind: 'channel', platform: 'facebook', metrics: fol('Page followers', 52), createdAt: ago(2) })

    const reel = (platform: string, mediaId: string, checkpoint: string, metrics: Record<string, number>) =>
      stat({
        kind: 'reel',
        source: 'graph',
        platform,
        mediaId,
        checkpoint,
        metrics,
        caption: `HQ-TEST ${mediaId}\nsecond line`,
        permalink: `https://www.instagram.com/reel/${mediaId}/`,
        mediaPublishedAt: ago(80),
      })
    // Reel A shone at 1h on a tiny reach, then settled: its 3d reading is what counts.
    await reel('instagram', 'rr-a', '1h', { reach: 4, shares: 1 })
    await reel('instagram', 'rr-a', '3d', { reach: 1000, shares: 5 })
    await reel('instagram', 'rr-b', '24h', { reach: 500, shares: 10 })
    // B's Facebook twin: not another reel.
    await reel('facebook', 'rr-fb-b', '24h', { post_impressions_unique: 300, 'post_video_social_actions.share': 3 })
    // Posted last night: only a 3h reading so far. Counted, not ranked.
    await reel('instagram', 'rr-c', '3h', { reach: 20, shares: 5 })

    const n = await weekNumbers(payload, now)
    expect(n.followers).toEqual({
      total: 14,
      byPlatform: expect.arrayContaining([
        { platform: 'instagram', gained: 12 },
        { platform: 'facebook', gained: 2 },
      ]),
    })
    expect(n.reels).toBe(3)
    expect(n.best).toMatchObject({ platform: 'instagram', sharesPerReach: 0.02 })
    expect(n.best?.caption).toContain('rr-b')

    const text = reminderText(n)
    expect(text).toContain('+14 followers (')
    expect(text).toContain('3 reels posted')
    expect(text).toContain('<a href="https://www.instagram.com/reel/rr-b/">“HQ-TEST rr-b”</a> on instagram, 2 shares per 100 reached')
    expect(text).not.toContain('second line')
  })
})
