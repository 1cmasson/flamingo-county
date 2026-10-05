import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { buildBrief, isBriefHour, metricLine, sendBrief } from '@/lib/brief'
import { decideDraft, draftCallback, draftClashes, draftPreviewText, parseDraftCallback } from '@/lib/hq'
import { buildPostBody, isRunningCount, postIdsFrom, summarizeMetrics } from '@/lib/postiz'
import { collectChannelStats, collectPostStats, dueCheckpoints } from '@/lib/socialStats'
import { isBot, parseTrackedLink, safePath } from '@/lib/tracking'
import { GET as goRoute } from '@/app/go/[...slug]/route'
import { clip, esc } from '@/lib/telegram'
import { handleUpdate } from '@/lib/telegramBot'
import type { HqSocialDraft } from '@/payload-types'

const OWNER = '1001'
const STRANGER = 2002

/* ------------------------------------------------------------------------ */
/* Pure helpers                                                              */
/* ------------------------------------------------------------------------ */

describe('Postiz post body', () => {
  const integrations = { facebook: 'fb-1', instagram: 'ig-1', tiktok: 'tt-1' }
  const later = new Date('2026-10-02T15:00:00Z')
  const now = new Date('2026-10-01T12:00:00Z')

  it('fills every setting TikTok requires, and Instagram’s post_type', () => {
    const body = buildPostBody({
      caption: 'Son Thursday is back\nwith a full band',
      platforms: ['instagram', 'tiktok'],
      integrations,
      media: [{ id: 'm1', path: 'https://postiz.example/m1.mp4' }],
      scheduledFor: later,
      now,
    })
    expect(body.type).toBe('schedule')
    expect(body.date).toBe(later.toISOString())
    expect(body.posts[0]).toMatchObject({
      integration: { id: 'ig-1' },
      settings: { __type: 'instagram', post_type: 'post' },
    })
    expect(body.posts[1].settings).toEqual({
      __type: 'tiktok',
      title: 'Son Thursday is back',
      privacy_level: 'PUBLIC_TO_EVERYONE',
      duet: false,
      stitch: false,
      comment: true,
      autoAddMusic: 'no',
      brand_content_toggle: false,
      brand_organic_toggle: false,
      content_posting_method: 'DIRECT_POST',
    })
    expect(body.posts[1].value[0].image).toEqual([{ id: 'm1', path: 'https://postiz.example/m1.mp4' }])
  })

  it('posts now when the time has already passed', () => {
    const body = buildPostBody({
      caption: 'x',
      platforms: ['facebook'],
      integrations,
      media: [],
      scheduledFor: new Date('2026-09-01T00:00:00Z'),
      now,
    })
    expect(body.type).toBe('now')
    expect(body.date).toBe(now.toISOString())
  })

  it('refuses a platform with no connected channel', () => {
    expect(() =>
      buildPostBody({ caption: 'x', platforms: ['tiktok'], integrations: {}, media: [], scheduledFor: later, now }),
    ).toThrow(/tiktok/)
  })
})

describe('draft buttons', () => {
  it('round-trips and stays under Telegram’s 64-byte limit', () => {
    const data = draftCallback('approve', 123456789)
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64)
    expect(parseDraftCallback(data)).toEqual({ action: 'approve', id: 123456789 })
    expect(parseDraftCallback(draftCallback('reject', 7))).toEqual({ action: 'reject', id: 7 })
  })

  it('ignores anything else', () => {
    expect(parseDraftCallback('sd:x:1')).toBeNull()
    expect(parseDraftCallback('sd:a:1; drop')).toBeNull()
    expect(parseDraftCallback(undefined)).toBeNull()
  })

  it('escapes the caption in the preview', () => {
    const text = draftPreviewText(
      { id: 5, caption: '<b>2x1</b> & more', platforms: ['facebook'], scheduledFor: '2026-10-02T15:00:00Z' } as HqSocialDraft,
      2,
    )
    expect(text).toContain('&lt;b&gt;2x1&lt;/b&gt; &amp; more')
    expect(text).toContain('+2 more files')
  })

  it('warns about another draft within 3 hours, naming it', () => {
    const text = draftPreviewText(
      { id: 7, caption: 'Sabor Fest', platforms: ['facebook'], scheduledFor: '2026-10-08T23:00:00Z' } as HqSocialDraft,
      1,
      [{ id: 18, scheduledFor: '2026-10-08T23:00:00Z', caption: '🎃 Halloween en Hialeah 2026: la guía <b>\nNEXTLINE' }],
    )
    expect(text).toContain('⚠️ Within 3 h of draft #18 (Thu, Oct 8, 7:00 PM): 🎃 Halloween en Hialeah 2026: la guía &lt;b&gt;')
    expect(text).not.toContain('NEXTLINE')
    expect(draftPreviewText({ id: 7, caption: 'x', platforms: ['facebook'], scheduledFor: '2026-10-08T23:00:00Z' } as HqSocialDraft, 0)).not.toContain('⚠️')
  })
})

describe('brief clock', () => {
  // Runs hourly; only 7:xx on a Miami clock sends, across daylight saving.
  it('sends at 11:30 UTC in daylight time', () => {
    expect(isBriefHour(new Date('2026-07-01T11:30:00Z'))).toBe(true)
    expect(isBriefHour(new Date('2026-07-01T12:30:00Z'))).toBe(false)
  })
  it('sends at 12:30 UTC in standard time', () => {
    expect(isBriefHour(new Date('2026-12-01T11:30:00Z'))).toBe(false)
    expect(isBriefHour(new Date('2026-12-01T12:30:00Z'))).toBe(true)
  })
})

describe('telegram text', () => {
  it('escapes HTML and clips to the limit', () => {
    expect(esc('a<b>&c')).toBe('a&lt;b&gt;&amp;c')
    expect(clip('abcdef', 4)).toBe('abc…')
    expect(clip('abc', 4)).toBe('abc')
  })
})

describe('Postiz analytics', () => {
  const series = (label: string, totals: (string | number)[], change: number | null = null) => ({
    label,
    data: totals.map((total, i) => ({ total, date: `2026-10-0${i + 1}` })),
    percentageChange: change,
  })

  it('keeps the latest value and the sum of each series', () => {
    // Postiz's percentageChange is a placeholder on the live instance; it is not kept.
    expect(summarizeMetrics([series('Reach', ['100', '250', 'n/a'], 5), series('Followers', [40, 42])])).toEqual({
      Reach: { latest: 250, sum: 350 },
      Followers: { latest: 42, sum: 82 },
    })
    expect(summarizeMetrics(null)).toEqual({})
  })

  it('reads running counts at their latest value and flows as a sum', () => {
    expect(isRunningCount('Page followers')).toBe(true)
    expect(isRunningCount('Total Likes')).toBe(true)
    expect(isRunningCount('Reach')).toBe(false)
    expect(metricLine('Page followers', { latest: 1250, sum: 8000 })).toBe('Page followers 1,250')
    expect(metricLine('Reach', { latest: 300, sum: 1240 })).toBe('Reach 1,240')
  })

  it('reads post ids out of every reply shape, and nothing out of an unknown one', () => {
    const channels = { facebook: 'fb-live', instagram: 'ig-live' }
    expect(postIdsFrom([{ postId: 'p1', integration: 'fb-live' }], channels)).toEqual([
      { platform: 'facebook', postId: 'p1' },
    ])
    expect(postIdsFrom({ posts: [{ id: 'p2', integration: { id: 'ig-live' } }] }, channels)).toEqual([
      { platform: 'instagram', postId: 'p2' },
    ])
    expect(postIdsFrom([{ postId: 'p3', integration: 'someone-else' }], channels)).toEqual([])
    expect(postIdsFrom({ message: 'ok' }, channels)).toEqual([])
  })
})

describe('stats checkpoints', () => {
  const publishAt = new Date('2026-10-01T12:00:00Z')
  const at = (hours: number) => new Date(publishAt.getTime() + hours * 3_600_000)

  it('comes due at 24h, 3d and 7d, and stops retrying 48h later', () => {
    expect(dueCheckpoints(publishAt, at(23), new Set())).toEqual([])
    expect(dueCheckpoints(publishAt, at(25), new Set())).toEqual(['24h'])
    expect(dueCheckpoints(publishAt, at(25), new Set(['24h']))).toEqual([])
    expect(dueCheckpoints(publishAt, at(71), new Set())).toEqual(['24h'])
    expect(dueCheckpoints(publishAt, at(80), new Set())).toEqual(['3d'])
    expect(dueCheckpoints(publishAt, at(170), new Set())).toEqual(['7d'])
    expect(dueCheckpoints(publishAt, at(217), new Set())).toEqual([])
  })
})

describe('tracking links', () => {
  it('maps platform aliases and tags the landing page', () => {
    expect(parseTrackedLink(['ig'], null)).toEqual({
      source: 'instagram',
      draftId: undefined,
      location: '/?utm_source=instagram&utm_medium=social&utm_campaign=bio',
    })
    expect(parseTrackedLink(['FB', '12'], '/es/events?city=hialeah')).toEqual({
      source: 'facebook',
      draftId: 12,
      location: '/es/events?city=hialeah&utm_source=facebook&utm_medium=social&utm_campaign=draft-12',
    })
    expect(parseTrackedLink(['qr'], null)?.location).toContain('utm_medium=offline')
  })

  it('never redirects off the site', () => {
    for (const to of ['//evil.com', '/\\evil.com', 'https://evil.com', 'evil.com', '/%2F%2Fevil.com']) {
      expect(new URL(safePath(to), 'https://flamingocounty.com').host).toBe('flamingocounty.com')
    }
  })

  it('rejects malformed links', () => {
    expect(parseTrackedLink(['ig', 'abc'], null)).toBeNull()
    expect(parseTrackedLink(['ig', '1', 'extra'], null)).toBeNull()
    expect(parseTrackedLink(['bad source!'], null)).toBeNull()
  })

  it('does not count link previews and crawlers', () => {
    expect(isBot('facebookexternalhit/1.1')).toBe(true)
    expect(isBot('TelegramBot (like TwitterBot)')).toBe(true)
    expect(isBot(null)).toBe(true)
    expect(
      isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 350.0'),
    ).toBe(false)
  })
})

/* ------------------------------------------------------------------------ */
/* Against the database                                                      */
/* ------------------------------------------------------------------------ */

type Call = { url: string; body: unknown }

/**
 * Stand-in for both APIs. Records every call; Telegram always succeeds, Postiz
 * answers the three endpoints the approval uses.
 */
function fakeNetwork(
  opts: { postStats?: Record<string, unknown[]>; listed?: unknown[] } = {},
) {
  const { postStats = {}, listed = [] } = opts
  const calls: Call[] = []
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    let body: unknown = init?.body
    if (typeof body === 'string') body = JSON.parse(body)
    calls.push({ url, body })
    if (url.includes('api.telegram.org')) return Response.json({ ok: true, result: { message_id: 42 } })
    if (url.endsWith('/integrations')) {
      return Response.json([
        { id: 'fb-live', identifier: 'facebook' },
        { id: 'ig-off', identifier: 'instagram', disabled: true },
        { id: 'tt-live', platform: 'tiktok' },
      ])
    }
    if (url.endsWith('/upload')) return Response.json({ id: 'up1', path: 'https://postiz.example/up1.jpg' })
    if (url.endsWith('/posts')) return Response.json([{ postId: 'p1', integration: 'fb-live' }])
    if (url.includes('/posts?')) return Response.json({ posts: listed })
    if (url.includes('/analytics/post/')) {
      const id = url.split('/analytics/post/')[1].split('?')[0]
      return Response.json(postStats[id] ?? [])
    }
    if (url.includes('/analytics/')) {
      return Response.json([{ label: 'Page followers', data: [{ total: '120' }, { total: '125' }], percentageChange: 4 }])
    }
    return new Response('not found', { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return {
    calls,
    telegram: () => calls.filter((c) => c.url.includes('api.telegram.org')),
    postiz: () => calls.filter((c) => c.url.startsWith('https://postiz.test')),
  }
}

describe('HQ against the database', () => {
  let payload: Payload
  const created: {
    collection: 'listing-requests' | 'hq-social-drafts' | 'hq-tasks' | 'hq-social-stats' | 'hq-clicks'
    id: number
  }[] = []

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.TELEGRAM_OWNER_CHAT_ID = OWNER
    process.env.POSTIZ_API_URL = 'https://postiz.test/api/public/v1'
    process.env.POSTIZ_API_KEY = 'test-key'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_OWNER_CHAT_ID
    delete process.env.POSTIZ_API_URL
    delete process.env.POSTIZ_API_KEY
  })

  afterAll(async () => {
    if (!payload) return
    for (const { collection, id } of created) {
      await payload.delete({ collection, id, overrideAccess: true }).catch(() => undefined)
      await payload.delete({
        collection: 'hq-events',
        where: { and: [{ refCollection: { equals: collection } }, { refId: { equals: String(id) } }] },
        overrideAccess: true,
      })
    }
  })

  const newDraft = async (data: Partial<HqSocialDraft>) => {
    const draft = await payload.create({
      collection: 'hq-social-drafts',
      data: {
        caption: 'HQ-TEST caption',
        platforms: ['facebook'],
        scheduledFor: new Date(Date.now() + 86_400_000).toISOString(),
        ...data,
      } as HqSocialDraft,
      overrideAccess: true,
    })
    created.push({ collection: 'hq-social-drafts', id: draft.id })
    // The Telegram preview runs in the background and saves its message id
    // when done. Payload writes the whole record back on update, so a test
    // update racing it would be overwritten with the pending draft — wait.
    await vi.waitFor(async () => {
      const fresh = await payload.findByID({ collection: 'hq-social-drafts', id: draft.id, overrideAccess: true })
      expect(fresh.telegramMessageId).toBeTruthy()
    })
    return draft
  }

  it('logs a listing request and pings the owner', async () => {
    const net = fakeNetwork()
    const req = await payload.create({
      collection: 'listing-requests',
      data: { business: 'HQ-TEST Ventanita', phone: '305-000-0000', story: '<script>' },
      overrideAccess: true,
    })
    created.push({ collection: 'listing-requests', id: req.id })

    const events = await payload.find({
      collection: 'hq-events',
      where: { and: [{ refCollection: { equals: 'listing-requests' } }, { refId: { equals: String(req.id) } }] },
      overrideAccess: true,
    })
    expect(events.docs).toHaveLength(1)
    expect(events.docs[0]).toMatchObject({ type: 'listing_request.created', status: 'new' })

    await vi.waitFor(() => expect(net.telegram()).toHaveLength(1))
    const sent = net.telegram()[0].body as { chat_id: string; text: string }
    expect(sent.chat_id).toBe(OWNER)
    expect(sent.text).toContain('HQ-TEST Ventanita')
    expect(sent.text).toContain('&lt;script&gt;')
  })

  it('still saves the request when Telegram is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const req = await payload.create({
      collection: 'listing-requests',
      data: { business: 'HQ-TEST Offline', phone: '305-000-0001' },
      overrideAccess: true,
    })
    created.push({ collection: 'listing-requests', id: req.id })
    expect(req.id).toBeTruthy()
  })

  it('refuses an Instagram draft with no media', async () => {
    fakeNetwork()
    await expect(newDraft({ platforms: ['instagram'] })).rejects.toThrow()
  })

  it('previews a new draft in Telegram with approve and reject buttons', async () => {
    const net = fakeNetwork()
    const draft = await newDraft({})
    await vi.waitFor(async () => {
      const fresh = await payload.findByID({ collection: 'hq-social-drafts', id: draft.id, overrideAccess: true })
      expect(fresh.telegramMessageId).toBe(42)
    })
    const preview = net.telegram()[0].body as { reply_markup: { inline_keyboard: { callback_data: string }[][] } }
    expect(preview.reply_markup.inline_keyboard[0].map((b) => b.callback_data)).toEqual([
      draftCallback('approve', draft.id),
      draftCallback('reject', draft.id),
    ])
  })

  it('reject never touches Postiz', async () => {
    const net = fakeNetwork()
    const draft = await newDraft({})
    const outcome = await decideDraft(payload, draft.id, 'reject')
    expect(outcome).toContain('rejected')
    expect(net.postiz()).toHaveLength(0)
    const fresh = await payload.findByID({ collection: 'hq-social-drafts', id: draft.id, overrideAccess: true })
    expect(fresh.status).toBe('rejected')
  })

  it('approve schedules through Postiz once, even on a double tap', async () => {
    const net = fakeNetwork()
    const draft = await newDraft({})

    const outcome = await decideDraft(payload, draft.id, 'approve')
    expect(outcome).toContain('scheduled')
    const post = net.postiz().find((c) => c.url.endsWith('/posts'))!.body as ReturnType<typeof buildPostBody>
    expect(post.type).toBe('schedule')
    expect(post.posts[0].integration.id).toBe('fb-live')
    const saved = await payload.findByID({ collection: 'hq-social-drafts', id: draft.id, overrideAccess: true })
    expect(saved.publishAt).toBe(post.date)
    expect(saved.postizPosts?.map((p) => [p.platform, p.postId])).toEqual([['facebook', 'p1']])

    const again = await decideDraft(payload, draft.id, 'approve')
    expect(again).toContain('already scheduled')
    expect(net.postiz().filter((c) => c.url.endsWith('/posts'))).toHaveLength(1)
  })

  it('schedules once when two taps arrive at the same time', async () => {
    const net = fakeNetwork()
    const draft = await newDraft({})
    const outcomes = await Promise.all([
      decideDraft(payload, draft.id, 'approve'),
      decideDraft(payload, draft.id, 'approve'),
    ])
    expect(outcomes.filter((o) => o.includes('scheduled on'))).toHaveLength(1)
    expect(net.postiz().filter((c) => c.url.endsWith('/posts'))).toHaveLength(1)
  })

  it('finds a channel whichever key Postiz names the platform under', async () => {
    fakeNetwork()
    const { connectedChannels } = await import('@/lib/postiz')
    expect(await connectedChannels()).toEqual({ facebook: 'fb-live', tiktok: 'tt-live' })
  })

  it('marks the draft failed, with the reason, when Postiz has no channel for it', async () => {
    fakeNetwork()
    const draft = await newDraft({})
    // Facebook disconnected in Postiz since the draft was written.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        String(input).endsWith('/integrations')
          ? Response.json([])
          : Response.json({ ok: true, result: { message_id: 1 } }),
      ),
    )
    const outcome = await decideDraft(payload, draft.id, 'approve')
    expect(outcome).toContain('failed')
    const fresh = await payload.findByID({ collection: 'hq-social-drafts', id: draft.id, overrideAccess: true })
    expect(fresh.status).toBe('failed')
    expect(fresh.error).toMatch(/facebook/)
  })

  it('ignores the owner too, anywhere but their own chat with the bot', async () => {
    const net = fakeNetwork()
    const group = -100123
    await handleUpdate(payload, { message: { chat: { id: group, type: 'group' }, from: { id: Number(OWNER) }, text: '/brief' } })
    await handleUpdate(payload, {
      callback_query: { id: 'cb', from: { id: Number(OWNER) }, data: 'sd:r:1', message: { chat: { id: group, type: 'supergroup' }, message_id: 1 } },
    })
    // A stranger's private chat, with the owner's id forged as sender, is ignored too.
    await handleUpdate(payload, { message: { chat: { id: STRANGER, type: 'private' }, from: { id: Number(OWNER) }, text: '/brief' } })
    expect(net.telegram()).toHaveLength(0)
  })

  it('ignores strangers and files /task for Claude from the owner', async () => {
    const net = fakeNetwork()
    await handleUpdate(payload, { message: { chat: { id: STRANGER }, from: { id: STRANGER }, text: '/task HQ-TEST nope' } })
    expect(net.telegram()).toHaveLength(0)

    await handleUpdate(payload, {
      message: { chat: { id: Number(OWNER) }, from: { id: Number(OWNER) }, text: '/task HQ-TEST call El Gallo back' },
    })
    const tasks = await payload.find({
      collection: 'hq-tasks',
      where: { title: { equals: 'HQ-TEST call El Gallo back' } },
      overrideAccess: true,
    })
    expect(tasks.docs[0]).toMatchObject({ assignee: 'claude', status: 'open' })
    created.push({ collection: 'hq-tasks', id: tasks.docs[0].id })
    expect((net.telegram()[0].body as { text: string }).text).toContain(`#${tasks.docs[0].id}`)
  })

  it('builds a brief that lists what is waiting', async () => {
    const brief = await buildBrief(payload)
    expect(brief).toContain('Flamingo HQ')
    expect(brief).toContain('Waiting on you')
    expect(brief).toMatch(/new listing request/)
  })

  it('sends the brief once and counts the next one from it', async () => {
    const net = fakeNetwork()
    const before = new Date()
    expect(await sendBrief(payload)).toBe(true)
    expect(net.telegram()).toHaveLength(1)
    expect((net.telegram()[0].body as { text: string }).text).toContain('Flamingo HQ')

    const logged = await payload.find({
      collection: 'hq-events',
      where: { and: [{ type: { equals: 'brief.sent' } }, { createdAt: { greater_than_equal: before.toISOString() } }] },
      overrideAccess: true,
    })
    expect(logged.docs).toHaveLength(1)
    // The brief row itself never shows up as news in the next brief.
    expect(await buildBrief(payload)).not.toContain('Brief sent')
    await payload.delete({ collection: 'hq-events', id: logged.docs[0].id, overrideAccess: true })
  })

  it('does nothing without Telegram configured', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN
    const net = fakeNetwork()
    expect(await sendBrief(payload)).toBe(false)
    expect(net.calls).toHaveLength(0)
  })

  /** A draft already approved and published `hoursAgo` ago, as the stats job finds it. */
  const publishedDraft = async (hoursAgo: number, postizPosts: { platform: string; postId: string }[]) => {
    fakeNetwork()
    const draft = await newDraft({})
    const publishAt = new Date(Date.now() - hoursAgo * 3_600_000).toISOString()
    await payload.update({
      collection: 'hq-social-drafts',
      id: draft.id,
      data: { status: 'scheduled', publishAt, postizPosts },
      overrideAccess: true,
      context: { hqInternal: true },
    })
    return { ...draft, publishAt }
  }

  const statsFor = async (draftId: number) => {
    const { docs } = await payload.find({
      collection: 'hq-social-stats',
      where: { draft: { equals: draftId } },
      overrideAccess: true,
    })
    docs.forEach((d) => created.push({ collection: 'hq-social-stats', id: d.id }))
    return docs
  }

  it('finds the drafts within 3 hours of a new one, and only those still going out', async () => {
    fakeNetwork()
    const at = Date.now() + 10 * 86_400_000
    const iso = (h: number) => new Date(at + h * 3_600_000).toISOString()
    const near = await newDraft({ scheduledFor: iso(2), caption: 'HQ-TEST near\nsecond line' })
    const far = await newDraft({ scheduledFor: iso(3.5) })
    const gone = await newDraft({ scheduledFor: iso(-1) })
    await payload.update({ collection: 'hq-social-drafts', id: gone.id, data: { status: 'rejected' }, overrideAccess: true, context: { hqInternal: true } })
    const self = await newDraft({ scheduledFor: iso(0) })
    const clashes = await draftClashes(payload, self)
    expect(clashes.map((c) => c.id)).toEqual([near.id])
    expect(clashes[0].caption).toContain('HQ-TEST near')
    expect(far.id).toBeTruthy()
  })

  it('takes a post checkpoint once, and waits while Postiz has no numbers yet', async () => {
    const draft = await publishedDraft(25, [{ platform: 'facebook', postId: 'live-1' }])

    fakeNetwork({ postStats: {} })
    expect(await collectPostStats(payload)).toBe(0) // not matched yet: retry next hour

    fakeNetwork({ postStats: { 'live-1': [{ label: 'Posts Engagement', data: [{ total: '7' }, { total: '5' }] }] } })
    await collectPostStats(payload)
    await collectPostStats(payload) // a second run must not duplicate
    const rows = await statsFor(draft.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'post', platform: 'facebook', checkpoint: '24h', postizPostId: 'live-1' })
    expect(rows[0].metrics).toEqual({ 'Posts Engagement': { latest: 5, sum: 12 } })
  })

  it('finds the post id in Postiz when the create reply had none', async () => {
    const draft = await publishedDraft(25, [])
    fakeNetwork({
      listed: [{ id: 'found-1', publishDate: draft.publishAt, integration: { id: 'fb-live' } }],
      postStats: { 'found-1': [{ label: 'Page Impressions', data: [{ total: '40' }] }] },
    })
    await collectPostStats(payload)
    const fresh = await payload.findByID({ collection: 'hq-social-drafts', id: draft.id, overrideAccess: true })
    expect(fresh.postizPosts?.map((p) => p.postId)).toEqual(['found-1'])
    expect(await statsFor(draft.id)).toHaveLength(1)
  })

  it('follows a post moved in the Postiz calendar, and does not measure it before it goes out', async () => {
    const draft = await publishedDraft(25, [
      { platform: 'facebook', postId: 'moved-fb' },
      { platform: 'instagram', postId: 'moved-ig' },
    ])
    const movedTo = new Date(Date.now() + 5 * 24 * 3_600_000)
    fakeNetwork({
      listed: [
        { id: 'moved-fb', publishDate: movedTo.toISOString(), integration: { id: 'fb-live' } },
        { id: 'moved-ig', publishDate: new Date(movedTo.getTime() + 60_000).toISOString(), integration: { id: 'ig-off' } },
        { id: 'someone-else', publishDate: new Date().toISOString(), integration: { id: 'fb-live' } },
      ],
      postStats: { 'moved-fb': [{ label: 'Page Impressions', data: [{ total: '0' }] }] },
    })
    await collectPostStats(payload)
    const fresh = await payload.findByID({ collection: 'hq-social-drafts', id: draft.id, overrideAccess: true })
    expect(fresh.publishAt).toBe(movedTo.toISOString())
    expect(fresh.scheduledFor).toBe(movedTo.toISOString())
    expect(await statsFor(draft.id)).toHaveLength(0)
  })

  it('leaves a draft alone when Postiz no longer lists its posts', async () => {
    const draft = await publishedDraft(30, [{ platform: 'facebook', postId: 'gone-1' }])
    fakeNetwork({ listed: [] })
    await collectPostStats(payload)
    const fresh = await payload.findByID({ collection: 'hq-social-drafts', id: draft.id, overrideAccess: true })
    expect(fresh.publishAt).toBe(draft.publishAt)
  })

  it('snapshots each account once a day', async () => {
    fakeNetwork()
    const first = await collectChannelStats(payload)
    expect(first).toBe(2) // facebook and tiktok; instagram is disabled in the fake
    expect(await collectChannelStats(payload)).toBe(0)
    const { docs } = await payload.find({
      collection: 'hq-social-stats',
      where: { kind: { equals: 'channel' } },
      overrideAccess: true,
    })
    docs.forEach((d) => created.push({ collection: 'hq-social-stats', id: d.id }))
    expect(docs[0].metrics).toMatchObject({ 'Page followers': { latest: 125 } })
  })

  const go = (path: string, ua: string | null) => {
    const url = new URL(path, 'https://flamingocounty.com')
    const slug = url.pathname.replace(/^\/go\//, '').split('/')
    return goRoute(new Request(url, { headers: ua ? { 'user-agent': ua } : {} }), {
      params: Promise.resolve({ slug }),
    })
  }
  const phone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Instagram 350.0'

  it('counts a human click on a tracking link and sends them on', async () => {
    fakeNetwork()
    const draft = await newDraft({})
    const res = await go(`/go/fb/${draft.id}?to=/es/events`, phone)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(
      `/es/events?utm_source=facebook&utm_medium=social&utm_campaign=draft-${draft.id}`,
    )
    const { docs } = await payload.find({
      collection: 'hq-clicks',
      where: { draft: { equals: draft.id } },
      overrideAccess: true,
    })
    docs.forEach((d) => created.push({ collection: 'hq-clicks', id: d.id }))
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ source: 'facebook', to: '/es/events' })
  })

  it('does not count a link preview, and never redirects off the site', async () => {
    const before = await payload.count({ collection: 'hq-clicks', overrideAccess: true })
    const res = await go('/go/ig?to=//evil.com', 'facebookexternalhit/1.1')
    expect(res.headers.get('location')).toBe('/?utm_source=instagram&utm_medium=social&utm_campaign=bio')
    expect((await payload.count({ collection: 'hq-clicks', overrideAccess: true })).totalDocs).toBe(before.totalDocs)
  })

  it('puts account numbers, post results and clicks in the brief', async () => {
    const brief = await buildBrief(payload)
    expect(brief).toContain('<b>Socials</b>')
    expect(brief).toContain('facebook: Page followers 125')
    expect(brief).toMatch(/Post #\d+ on facebook at 24h/)
    expect(brief).toMatch(/Link clicks: facebook \d+/)
  })
})
