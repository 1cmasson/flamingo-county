import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { buildBrief, isBriefHour, sendBrief } from '@/lib/brief'
import { decideDraft, draftCallback, draftPreviewText, parseDraftCallback } from '@/lib/hq'
import { buildPostBody } from '@/lib/postiz'
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

/* ------------------------------------------------------------------------ */
/* Against the database                                                      */
/* ------------------------------------------------------------------------ */

type Call = { url: string; body: unknown }

/**
 * Stand-in for both APIs. Records every call; Telegram always succeeds, Postiz
 * answers the three endpoints the approval uses.
 */
function fakeNetwork() {
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
  const created: { collection: 'listing-requests' | 'hq-social-drafts' | 'hq-tasks'; id: number }[] = []

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
})
