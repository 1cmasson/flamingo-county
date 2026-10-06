// @vitest-environment node
// Node, not the suite's default jsdom: Payload's upload check runs file-type
// detection on the Buffer, which fails across jsdom's separate Uint8Array.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { configToJSONSchema, createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import config from '@/payload.config'

import { HQ_INTERNAL, decideDraft, draftFingerprint } from '@/lib/hq'
import { addMediaFromUrl, htmlToText, isPrivateAddress, socialReport } from '@/lib/mcpTools'
import type { HqSocialDraft, User } from '@/payload-types'
import { makeHqMedia, withFbLink } from './helpers/facebook'

/* ------------------------------------------------------------------------ */
/* Pure helpers                                                              */
/* ------------------------------------------------------------------------ */

describe('MCP helpers', () => {
  it('knows private and loopback addresses, v4 and v6', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '93.184.215.14', '2606:4700::1111']) {
      expect(isPrivateAddress(ip), ip).toBe(false)
    }
  })

  it('turns the Telegram brief into plain text', () => {
    expect(htmlToText('<b>HQ</b> &lt;3 &amp; more')).toBe('HQ <3 & more')
  })

  it('fingerprints what Approve would post, not how it is stored', () => {
    const base = { caption: 'Hola', media: [3, 4], platforms: ['instagram', 'facebook'], scheduledFor: '2026-10-05T23:00:00.000Z' } as Pick<HqSocialDraft, 'caption' | 'media' | 'platforms' | 'scheduledFor'>
    const sameAsObjects = { ...base, media: [{ id: 3 }, { id: 4 }], platforms: ['facebook', 'instagram'] } as typeof base
    expect(draftFingerprint(sameAsObjects)).toBe(draftFingerprint(base))
    expect(draftFingerprint({ ...base, caption: 'Hola!' })).not.toBe(draftFingerprint(base))
    expect(draftFingerprint({ ...base, media: [4, 3] })).not.toBe(draftFingerprint(base))
  })
})

/* ------------------------------------------------------------------------ */
/* Against the database                                                      */
/* ------------------------------------------------------------------------ */

const OWNER = '1001'

function fakeNetwork() {
  const calls: { url: string; body: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body })
      if (url.includes('api.telegram.org')) return Response.json({ ok: true, result: { message_id: 7 } })
      return new Response('unexpected', { status: 500 })
    }),
  )
  return {
    telegram: () => calls.filter((c) => c.url.includes('api.telegram.org')),
    postiz: () => calls.filter((c) => !c.url.includes('api.telegram.org')),
  }
}

describe('MCP against the database', () => {
  let payload: Payload
  let user: User
  let mcpReq: PayloadRequest
  const drafts: number[] = []
  let mediaId: number

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    mediaId = await makeHqMedia(payload)
    user = await payload.create({
      collection: 'users',
      data: { email: `mcp-test-${Date.now()}@example.com`, password: 'not-a-real-password-1' },
      overrideAccess: true,
    })
    // What the MCP endpoint hands every tool: the key's user, flagged as MCP.
    mcpReq = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    mcpReq.payloadAPI = 'MCP'
  })

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.TELEGRAM_OWNER_CHAT_ID = OWNER
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_OWNER_CHAT_ID
  })

  afterAll(async () => {
    if (!payload) return
    for (const id of drafts) {
      await payload.delete({ collection: 'hq-social-drafts', id, overrideAccess: true }).catch(() => undefined)
    }
    await payload.delete({ collection: 'hq-events', where: { refCollection: { equals: 'hq-social-drafts' } }, overrideAccess: true })
    if (mediaId) await payload.delete({ collection: 'hq-media', id: mediaId, overrideAccess: true }).catch(() => undefined)
    if (user) await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
  })

  /** A draft written the way Claude writes one, waited on until its preview has landed. */
  const claudeDraft = async (data: Partial<HqSocialDraft>) => {
    const draft = await payload.create({
      collection: 'hq-social-drafts',
      data: {
        caption: withFbLink('MCP-TEST caption'),
        media: [mediaId],
        platforms: ['facebook'],
        scheduledFor: new Date(Date.now() + 86_400_000).toISOString(),
        ...data,
      } as HqSocialDraft,
      req: mcpReq,
      overrideAccess: false,
    })
    drafts.push(draft.id)
    await vi.waitFor(async () => {
      const fresh = await payload.findByID({ collection: 'hq-social-drafts', id: draft.id, overrideAccess: true })
      expect(fresh.previewedHash).toBeTruthy()
    })
    return draft
  }

  it('does not make Claude send a status it may not set', async () => {
    // The MCP tool input schemas are built from this JSON schema.
    const schema = configToJSONSchema(payload.config, payload.db.defaultIDType)
    const required = (schema.definitions?.['hq-social-drafts'] as { required?: string[] }).required ?? []
    expect(required).not.toContain('status')
    expect(required).toEqual(expect.arrayContaining(['caption', 'platforms', 'scheduledFor']))

    fakeNetwork()
    const draft = await claudeDraft({})
    expect(draft.status).toBe('pending')
  })

  it('lets Claude write a draft but never set its status', async () => {
    fakeNetwork()
    const draft = await claudeDraft({ status: 'scheduled' })
    expect(draft.status).toBe('pending')

    await payload.update({
      collection: 'hq-social-drafts',
      id: draft.id,
      data: { status: 'approved', caption: withFbLink('MCP-TEST edited by Claude') },
      req: mcpReq,
      overrideAccess: false,
    })
    const fresh = await payload.findByID({ collection: 'hq-social-drafts', id: draft.id, overrideAccess: true })
    expect(fresh.status).toBe('pending')
    expect(fresh.caption).toBe(withFbLink('MCP-TEST edited by Claude'))
  })

  it('re-previews a pending draft that is edited, and approves only what was shown', async () => {
    const net = fakeNetwork()
    const draft = await claudeDraft({})
    const before = net.telegram().length

    await payload.update({
      collection: 'hq-social-drafts',
      id: draft.id,
      data: { caption: withFbLink('MCP-TEST second version') },
      req: mcpReq,
      overrideAccess: false,
    })
    await vi.waitFor(() => expect(net.telegram().length).toBeGreaterThan(before))
    // With a photo the preview goes out as multipart form data, not JSON.
    const sent = net.telegram().at(-1)!.body
    const text = sent instanceof FormData ? JSON.stringify([...sent.entries()].filter(([, v]) => typeof v === 'string')) : JSON.stringify(sent)
    expect(text).toContain('MCP-TEST second version')
  })

  it('refuses to approve content the owner has not seen', async () => {
    const net = fakeNetwork()
    const draft = await claudeDraft({})
    // A change that slips past the hook (here, written as HQ bookkeeping):
    // the preview the owner holds no longer matches.
    await payload.update({
      collection: 'hq-social-drafts',
      id: draft.id,
      data: { caption: 'MCP-TEST swapped after preview' },
      overrideAccess: true,
      context: { [HQ_INTERNAL]: true },
    })
    const outcome = await decideDraft(payload, draft.id, 'approve')
    expect(outcome).toContain('changed since that preview')
    expect(net.postiz()).toHaveLength(0)
    const fresh = await payload.findByID({ collection: 'hq-social-drafts', id: draft.id, overrideAccess: true })
    expect(fresh.status).toBe('pending')
  })

  it('reports published posts with their furthest checkpoint and clicks', async () => {
    fakeNetwork()
    const draft = await claudeDraft({ pillar: 'event', language: 'es' })
    await payload.update({
      collection: 'hq-social-drafts',
      id: draft.id,
      data: { status: 'scheduled', publishAt: new Date(Date.now() - 4 * 86_400_000).toISOString() },
      overrideAccess: true,
      context: { [HQ_INTERNAL]: true },
    })
    const stat = (checkpoint: '24h' | '3d', likes: number) =>
      payload.create({
        collection: 'hq-social-stats',
        data: { kind: 'post', platform: 'facebook', checkpoint, draft: draft.id, metrics: { Likes: { latest: likes, sum: likes } } },
        overrideAccess: true,
      })
    const s1 = await stat('24h', 4)
    const s2 = await stat('3d', 11)
    const click = await payload.create({ collection: 'hq-clicks', data: { source: 'facebook', draft: draft.id }, overrideAccess: true })

    const report = await socialReport(payload, 28)
    const row = report.posts.find((p) => p.draft === draft.id)!
    expect(row).toMatchObject({ pillar: 'event', language: 'es', linkClicks: 1 })
    expect(row.results.facebook).toEqual({ checkpoint: '3d', metrics: { Likes: 11 } })

    for (const [collection, id] of [['hq-social-stats', s1.id], ['hq-social-stats', s2.id], ['hq-clicks', click.id]] as const) {
      await payload.delete({ collection, id, overrideAccess: true })
    }
  })

  it('only fetches media from public https hosts, without following redirects', async () => {
    await expect(addMediaFromUrl(mcpReq, 'http://example.com/a.jpg')).rejects.toThrow(/https/)
    await expect(addMediaFromUrl(mcpReq, 'https://127.0.0.1/a.jpg')).rejects.toThrow(/public/)
    await expect(addMediaFromUrl(mcpReq, 'https://localhost/a.jpg')).rejects.toThrow(/public/)
    await expect(addMediaFromUrl(mcpReq, 'https://169.254.169.254/latest/meta-data')).rejects.toThrow(/public/)

    let redirectMode: RequestRedirect | undefined
    // A tiny real PNG, served by a stubbed fetch from a public IP literal.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        redirectMode = init?.redirect
        return new Response(png, { headers: { 'content-type': 'image/png' } })
      }),
    )
    const media = await addMediaFromUrl(mcpReq, 'https://93.184.215.14/photos/flamingo.png', 'MCP-TEST')
    expect(redirectMode).toBe('error')
    // Stored as JPEG, which Instagram requires.
    expect(media.mimeType).toBe('image/jpeg')
    expect(media.filename).toMatch(/\.jpg$/)
    await payload.delete({ collection: 'hq-media', id: media.id, overrideAccess: true })

    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })))
    await expect(addMediaFromUrl(mcpReq, 'https://93.184.215.14/page')).rejects.toThrow(/JPEG, PNG or MP4/)
  })
})
