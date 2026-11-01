// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import config from '@/payload.config'

import { decideDraft } from '@/lib/hq'
import {
  batchCallback,
  batchLine,
  decideBatch,
  parseBatchCallback,
  requestSocialBatch,
  socialBatchStatus,
} from '@/lib/socialBatches'
import { handleUpdate } from '@/lib/telegramBot'
import type { HqSocialDraft, User } from '@/payload-types'
import { makeHqMedia, withFbLink } from './helpers/facebook'

const OWNER = 1001
const STRANGER = 2002

describe('batch helpers', () => {
  it('parses only its own buttons, under Telegram’s 64 bytes', () => {
    expect(parseBatchCallback(batchCallback('approve', 123456789))).toEqual({ action: 'approve', id: 123456789 })
    expect(parseBatchCallback('sb:r:7')).toEqual({ action: 'reject', id: 7 })
    expect(Buffer.byteLength(batchCallback('approve', 123456789))).toBeLessThanOrEqual(64)
    expect(parseBatchCallback('sd:a:7')).toBeNull()
    expect(parseBatchCallback('sb:a:7; drop')).toBeNull()
  })

  it('lists a draft as id, platforms, language, Miami time, file and its first caption line, escaped', () => {
    const line = batchLine(
      1,
      {
        id: 247,
        caption: '\nHis hero <3: Cachao & the bass\nsecond line',
        platforms: ['instagram'],
        language: 'en',
        media: [5],
        scheduledFor: '2026-11-03T21:00:00Z',
      } as HqSocialDraft,
      { id: 5, mimeType: 'video/mp4' } as never,
      'https://hq.example',
    )
    expect(line).toBe(
      '1. <a href="https://hq.example/admin/collections/hq-social-drafts/247">#247</a> · instagram · EN · Tue, Nov 3, 4:00 PM · 🎬 video\n    His hero &lt;3: Cachao &amp; the bass',
    )
  })
})

/** Telegram and Postiz, recorded. Every Telegram message gets its own id. */
function fakeNetwork() {
  const calls: { url: string; method: string; body: unknown }[] = []
  let messageId = 500
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      let body: unknown = init?.body
      if (typeof body === 'string') body = JSON.parse(body)
      calls.push({ url, method: url.split('/').pop()!, body })
      if (url.includes('api.telegram.org')) return Response.json({ ok: true, result: { message_id: ++messageId } })
      if (url.endsWith('/integrations')) return Response.json([{ id: 'fb-live', identifier: 'facebook' }])
      if (url.endsWith('/upload')) return Response.json({ id: 'up1', path: 'https://postiz.example/up1.jpg' })
      if (url.endsWith('/posts')) return Response.json([{ postId: `p${calls.length}`, integration: 'fb-live' }])
      return new Response('not found', { status: 404 })
    }),
  )
  const telegram = () => calls.filter((c) => c.url.includes('api.telegram.org'))
  return {
    telegram,
    texts: () => telegram().filter((c) => c.method === 'sendMessage').map((c) => String((c.body as { text: string }).text)),
    cleared: () =>
      telegram()
        .filter((c) => c.method === 'editMessageReplyMarkup')
        .map((c) => (c.body as { message_id: number }).message_id),
    posts: () => calls.filter((c) => c.url.startsWith('https://postiz.test') && c.url.endsWith('/posts')),
  }
}

describe('a batch of drafts goes out only on the owner’s one tap', () => {
  let payload: Payload
  let mediaId: number
  let user: User
  let mcpReq: PayloadRequest
  const drafts: number[] = []

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    mediaId = await makeHqMedia(payload)
    user = await payload.create({
      collection: 'users',
      data: { email: `batch-test-${Date.now()}@example.com`, password: 'not-a-real-password-1' },
      overrideAccess: true,
    })
    mcpReq = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    mcpReq.payloadAPI = 'MCP'
  })

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.TELEGRAM_OWNER_CHAT_ID = String(OWNER)
    process.env.POSTIZ_API_URL = 'https://postiz.test/api/public/v1'
    process.env.POSTIZ_API_KEY = 'test-key'
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_OWNER_CHAT_ID
    delete process.env.POSTIZ_API_URL
    delete process.env.POSTIZ_API_KEY
    await payload.delete({ collection: 'hq-social-batches', where: { id: { exists: true } }, overrideAccess: true })
  })

  afterAll(async () => {
    if (!payload) return
    for (const id of drafts) await payload.delete({ collection: 'hq-social-drafts', id, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'hq-events', where: { type: { like: 'social.batch' } }, overrideAccess: true })
    await payload.delete({ collection: 'hq-media', id: mediaId, overrideAccess: true }).catch(() => undefined)
    if (user) await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
  })

  /** A pending Facebook draft whose own preview has gone out. */
  const newDraft = async (caption: string, hoursAhead: number) => {
    const draft = await payload.create({
      collection: 'hq-social-drafts',
      data: {
        caption: withFbLink(caption),
        media: [mediaId],
        platforms: ['facebook'],
        language: 'es',
        scheduledFor: new Date(Date.now() + hoursAhead * 3_600_000).toISOString(),
      } as HqSocialDraft,
      overrideAccess: true,
    })
    drafts.push(draft.id)
    await vi.waitFor(async () => {
      const fresh = await payload.findByID({ collection: 'hq-social-drafts', id: draft.id, overrideAccess: true })
      expect(fresh.previewedHash).toBeTruthy()
    })
    return payload.findByID({ collection: 'hq-social-drafts', id: draft.id, overrideAccess: true })
  }

  const tap = (id: number, action: 'a' | 'r' = 'a', from = OWNER) =>
    handleUpdate(payload, {
      callback_query: { id: 'cb', from: { id: from }, data: `sb:${action}:${id}`, message: { chat: { id: from }, message_id: 9 } },
    })
  const statusOf = async (id: number) => (await payload.findByID({ collection: 'hq-social-drafts', id, overrideAccess: true })).status

  it('lists every draft in one message with Approve all / Reject all, and approves nothing yet', async () => {
    const net = fakeNetwork()
    const a = await newDraft('HQ-TEST Cachao ES', 30)
    const b = await newDraft('HQ-TEST Emilio ES', 50)
    const { batchId, drafts: listed } = await requestSocialBatch(payload, { draftIds: [b.id, a.id, a.id], note: 'Semana del 2 de nov.' })
    expect(listed).toEqual([a.id, b.id]) // in time order, once each

    const msg = net.texts().at(-1)!
    expect(msg).toContain(`Approve these 2 posts? Batch #${batchId}`)
    expect(msg).toContain('Semana del 2 de nov.')
    expect(msg.indexOf('HQ-TEST Cachao ES')).toBeLessThan(msg.indexOf('HQ-TEST Emilio ES'))
    expect(msg).toContain('facebook · ES')
    const kb = (net.telegram().at(-1)!.body as { reply_markup: { inline_keyboard: { text: string; callback_data: string }[][] } }).reply_markup
    expect(kb.inline_keyboard[0].map((x) => [x.text, x.callback_data])).toEqual([
      ['✅ Approve all 2', `sb:a:${batchId}`],
      ['✖️ Reject all', `sb:r:${batchId}`],
    ])
    expect(net.posts()).toHaveLength(0)
    expect([await statusOf(a.id), await statusOf(b.id)]).toEqual(['pending', 'pending'])
  })

  it('a stranger’s tap does nothing', async () => {
    const net = fakeNetwork()
    const a = await newDraft('HQ-TEST stranger 1', 30)
    const b = await newDraft('HQ-TEST stranger 2', 50)
    const { batchId } = await requestSocialBatch(payload, { draftIds: [a.id, b.id] })
    await tap(batchId, 'a', STRANGER)
    expect((await socialBatchStatus(payload, batchId)).status).toBe('pending')
    expect(net.posts()).toHaveLength(0)
  })

  it('Approve all schedules each draft once through Postiz, and clears their own buttons', async () => {
    const net = fakeNetwork()
    const a = await newDraft('HQ-TEST approve 1', 30)
    const b = await newDraft('HQ-TEST approve 2', 50)
    const { batchId } = await requestSocialBatch(payload, { draftIds: [a.id, b.id] })
    await tap(batchId)
    await vi.waitFor(async () => expect((await socialBatchStatus(payload, batchId)).status).toBe('approved'))
    await vi.waitFor(() => expect(net.texts().at(-1)).toContain(`Batch #${batchId}: 2 of 2 scheduled.`))

    expect([await statusOf(a.id), await statusOf(b.id)]).toEqual(['scheduled', 'scheduled'])
    expect(net.posts()).toHaveLength(2)
    expect(net.cleared()).toEqual(expect.arrayContaining([a.telegramMessageId, b.telegramMessageId]))

    // A second tap, a redelivered webhook, or the drafts' own buttons: nothing more goes out.
    expect(await decideBatch(payload, batchId, 'approve')).toMatch(/already approved/)
    await tap(batchId)
    await vi.waitFor(() => expect(net.texts().at(-1)).toMatch(/already approved/))
    expect(await decideDraft(payload, a.id, 'approve')).toMatch(/already scheduled/)
    expect(net.posts()).toHaveLength(2)
  })

  it('schedules once when two taps arrive together', async () => {
    const net = fakeNetwork()
    const a = await newDraft('HQ-TEST race 1', 30)
    const b = await newDraft('HQ-TEST race 2', 50)
    const { batchId } = await requestSocialBatch(payload, { draftIds: [a.id, b.id] })
    const outcomes = await Promise.all([decideBatch(payload, batchId, 'approve'), decideBatch(payload, batchId, 'approve')])
    expect(outcomes.filter((o) => o.includes('2 of 2 scheduled'))).toHaveLength(1)
    expect(net.posts()).toHaveLength(2)
  })

  it('skips a draft edited after the list went out, and posts the rest', async () => {
    const net = fakeNetwork()
    const a = await newDraft('HQ-TEST edited', 30)
    const b = await newDraft('HQ-TEST untouched', 50)
    const { batchId } = await requestSocialBatch(payload, { draftIds: [a.id, b.id] })
    await payload.update({ collection: 'hq-social-drafts', id: a.id, data: { caption: withFbLink('HQ-TEST edited again') }, overrideAccess: true })

    const outcome = await decideBatch(payload, batchId, 'approve')
    expect(outcome).toContain('1 of 2 scheduled')
    expect(outcome).toContain(`Draft #${a.id} changed after the list was sent`)
    expect([await statusOf(a.id), await statusOf(b.id)]).toEqual(['pending', 'scheduled'])
    expect(net.posts()).toHaveLength(1)
    expect((await socialBatchStatus(payload, batchId)).items).toEqual([
      { draft: a.id, outcome: expect.stringContaining('changed after the list') },
      { draft: b.id, outcome: expect.stringContaining('scheduled') },
    ])
  })

  it('Reject all rejects every draft and never touches Postiz', async () => {
    const net = fakeNetwork()
    const a = await newDraft('HQ-TEST reject 1', 30)
    const b = await newDraft('HQ-TEST reject 2', 50)
    const { batchId } = await requestSocialBatch(payload, { draftIds: [a.id, b.id] })
    expect(await decideBatch(payload, batchId, 'reject')).toContain('rejected')
    expect([await statusOf(a.id), await statusOf(b.id)]).toEqual(['rejected', 'rejected'])
    expect(net.posts()).toHaveLength(0)
  })

  it('an unanswered batch expires', async () => {
    const net = fakeNetwork()
    const a = await newDraft('HQ-TEST expire 1', 30)
    const b = await newDraft('HQ-TEST expire 2', 50)
    const { batchId } = await requestSocialBatch(payload, { draftIds: [a.id, b.id] })
    expect(await decideBatch(payload, batchId, 'approve', new Date(Date.now() + 73 * 3_600_000))).toMatch(/expired/)
    expect(await statusOf(a.id)).toBe('pending')
    expect(net.posts()).toHaveLength(0)
  })

  it('refuses drafts that are not pending, missing, alone, or not yet previewed — filing nothing', async () => {
    fakeNetwork()
    const a = await newDraft('HQ-TEST refuse 1', 30)
    const b = await newDraft('HQ-TEST refuse 2', 50)
    await expect(requestSocialBatch(payload, { draftIds: [a.id] })).rejects.toThrow(/at least 2/)
    await expect(requestSocialBatch(payload, { draftIds: [a.id, 99999999] })).rejects.toThrow(/#99999999 does not exist/)
    await decideDraft(payload, b.id, 'reject')
    await expect(requestSocialBatch(payload, { draftIds: [a.id, b.id] })).rejects.toThrow(/is rejected, not pending/)

    // Saved, but its own preview hasn't gone out yet: the owner hasn't seen it whole.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })))
    const unseen = await payload.create({
      collection: 'hq-social-drafts',
      data: { caption: withFbLink('HQ-TEST unseen'), media: [mediaId], platforms: ['facebook'], scheduledFor: new Date(Date.now() + 86_400_000).toISOString() } as HqSocialDraft,
      overrideAccess: true,
    })
    drafts.push(unseen.id)
    fakeNetwork()
    await expect(requestSocialBatch(payload, { draftIds: [a.id, unseen.id] })).rejects.toThrow(/own preview hasn't gone out/)
    expect((await payload.find({ collection: 'hq-social-batches', overrideAccess: true })).totalDocs).toBe(0)
  })

  it('MCP can’t create or approve a batch', async () => {
    const net = fakeNetwork()
    const a = await newDraft('HQ-TEST mcp 1', 30)
    const b = await newDraft('HQ-TEST mcp 2', 50)
    const { batchId } = await requestSocialBatch(payload, { draftIds: [a.id, b.id] })
    await payload
      .update({ collection: 'hq-social-batches', id: batchId, data: { status: 'approved' }, req: mcpReq, overrideAccess: false })
      .catch(() => undefined)
    expect((await socialBatchStatus(payload, batchId)).status).toBe('pending')
    await expect(
      payload.create({ collection: 'hq-social-batches', data: { status: 'approved' }, req: mcpReq, overrideAccess: false }),
    ).rejects.toThrow()
    expect(net.posts()).toHaveLength(0)
  })
})
