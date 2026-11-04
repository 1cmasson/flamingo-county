// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import config from '@payload-config'
import { HQ_INTERNAL, cancelDraft, decideDraft, draftFingerprint, moveDraftToCloud } from '../../src/lib/hq'
import { buildPostBody, connectedChannels, newPostsBackend } from '../../src/lib/postiz'
import { markPublished } from '../../src/lib/socialStats'
import { makeHqMedia } from './helpers/facebook'

const HETZNER = 'https://postiz.test/api/public/v1'
const CLOUD = 'https://cloud.postiz.test/public/v1'

function setEnv(newPosts?: 'cloud') {
  process.env.POSTIZ_API_URL = HETZNER
  process.env.POSTIZ_API_KEY = 'hetzner-key'
  process.env.POSTIZ_CLOUD_API_URL = CLOUD
  process.env.POSTIZ_CLOUD_API_KEY = 'cloud-key'
  if (newPosts) process.env.POSTIZ_NEW_POSTS = newPosts
  else delete process.env.POSTIZ_NEW_POSTS
}
function clearEnv() {
  for (const k of ['POSTIZ_API_URL', 'POSTIZ_API_KEY', 'POSTIZ_CLOUD_API_URL', 'POSTIZ_CLOUD_API_KEY', 'POSTIZ_NEW_POSTS']) {
    delete process.env[k]
  }
}

type Call = { url: string; method: string; auth: string | null; body: unknown }

/** Both Postiz backends with their own channel names, plus Telegram. */
function fakeNetwork(opts: { states?: Record<string, { id: string; state: string }[]>; failHetznerDelete?: boolean } = {}) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const auth = new Headers(init?.headers).get('Authorization')
      let body: unknown = init?.body
      if (typeof body === 'string') body = JSON.parse(body)
      calls.push({ url, method, auth, body })
      if (url.includes('api.telegram.org')) return Response.json({ ok: true, result: { message_id: 7 } })
      const cloud = url.startsWith(CLOUD)
      if (url.endsWith('/integrations')) {
        return Response.json(
          cloud
            ? [
                { id: 'c-ig', identifier: 'instagram-standalone' },
                { id: 'c-tt', identifier: 'tiktok-business' },
                { id: 'c-rd', identifier: 'reddit' },
              ]
            : [
                { id: 'h-fb', identifier: 'facebook' },
                { id: 'h-ig', identifier: 'instagram' },
              ],
        )
      }
      if (url.endsWith('/upload')) return Response.json({ id: 'up', path: `${cloud ? 'cloud' : 'hetzner'}/up.png` })
      if (url.endsWith('/posts') && method === 'POST') {
        return Response.json([{ postId: cloud ? 'cloud-1' : 'hz-1', integration: cloud ? 'c-ig' : 'h-ig' }])
      }
      if (url.includes('/posts?')) return Response.json({ posts: opts.states?.[cloud ? 'cloud' : 'hetzner'] ?? [] })
      if (method === 'DELETE') {
        if (!cloud && opts.failHetznerDelete) return new Response('boom', { status: 500 })
        return Response.json({ id: url.split('/posts/')[1] })
      }
      return new Response('not found', { status: 404 })
    }),
  )
  return {
    calls,
    postiz: () => calls.filter((c) => !c.url.includes('api.telegram.org')),
  }
}

describe('Postiz backends, pure', () => {
  afterEach(clearEnv)

  it('names Cloud channels by their own provider ids', () => {
    const args = {
      caption: 'Hola\nmore',
      platforms: ['instagram', 'tiktok'] as const,
      integrations: { instagram: 'ig', tiktok: 'tt' },
      media: [{ id: 'm', path: 'p' }],
      scheduledFor: new Date('2031-01-01T15:00:00Z'),
      now: new Date('2030-01-01T00:00:00Z'),
    }
    const cloud = buildPostBody({ ...args, platforms: [...args.platforms], backend: 'cloud' })
    expect(cloud.posts.map((p) => p.settings.__type)).toEqual(['instagram-standalone', 'tiktok-business'])
    expect(cloud.posts[1].settings).toMatchObject({ content_posting_method: 'DIRECT_POST', title: 'Hola' })
    const hetzner = buildPostBody({ ...args, platforms: [...args.platforms] })
    expect(hetzner.posts.map((p) => p.settings.__type)).toEqual(['instagram', 'tiktok'])
  })

  it('has no Facebook on Cloud', () => {
    expect(() =>
      buildPostBody({
        caption: 'x',
        platforms: ['facebook'],
        integrations: { facebook: 'fb' },
        media: [],
        scheduledFor: new Date('2031-01-01T15:00:00Z'),
        backend: 'cloud',
      }),
    ).toThrow(/no facebook channel/)
  })

  it('sends new posts to Cloud only when switched on and configured', () => {
    setEnv()
    expect(newPostsBackend()).toBe('hetzner')
    process.env.POSTIZ_NEW_POSTS = 'cloud'
    expect(newPostsBackend()).toBe('cloud')
    delete process.env.POSTIZ_CLOUD_API_KEY
    expect(newPostsBackend()).toBe('hetzner')
  })

  it('maps Cloud integrations back to HQ platform names, with the Cloud key', async () => {
    setEnv()
    const net = fakeNetwork()
    expect(await connectedChannels('cloud')).toEqual({ instagram: 'c-ig', tiktok: 'c-tt' })
    expect(await connectedChannels('hetzner')).toEqual({ facebook: 'h-fb', instagram: 'h-ig' })
    expect(net.calls.map((c) => [c.url, c.auth])).toEqual([
      [`${CLOUD}/integrations`, 'cloud-key'],
      [`${HETZNER}/integrations`, 'hetzner-key'],
    ])
    vi.unstubAllGlobals()
  })
})

describe('Postiz backends, against the database', () => {
  let payload: Payload
  let mediaId: number
  const ids: number[] = []

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    mediaId = await makeHqMedia(payload)
  })
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.TELEGRAM_OWNER_CHAT_ID = '1'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    clearEnv()
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_OWNER_CHAT_ID
  })
  afterAll(async () => {
    for (const id of ids) {
      await payload.delete({ collection: 'hq-social-drafts', id, overrideAccess: true }).catch(() => undefined)
      await payload.delete({
        collection: 'hq-events',
        where: { and: [{ refCollection: { equals: 'hq-social-drafts' } }, { refId: { equals: String(id) } }] },
        overrideAccess: true,
      })
    }
    await payload.delete({ collection: 'hq-media', id: mediaId, overrideAccess: true }).catch(() => undefined)
  })

  const make = async (data: Record<string, unknown>) => {
    const d = await payload.create({
      collection: 'hq-social-drafts',
      data: {
        caption: 'TEST cloud',
        platforms: ['instagram'],
        media: [mediaId],
        scheduledFor: '2031-01-01T15:00:00Z',
        ...data,
      } as never,
      overrideAccess: true,
      context: { [HQ_INTERNAL]: true },
    })
    ids.push(d.id)
    return d
  }
  const read = (id: number) => payload.findByID({ collection: 'hq-social-drafts', id, overrideAccess: true })

  it('schedules an approved draft on Cloud when switched on, and records it', async () => {
    setEnv('cloud')
    const net = fakeNetwork()
    const d = await make({ status: 'pending' })
    await payload.update({
      collection: 'hq-social-drafts',
      id: d.id,
      data: { previewedHash: draftFingerprint(d as never) },
      overrideAccess: true,
      context: { [HQ_INTERNAL]: true },
    })
    expect(await decideDraft(payload, d.id, 'approve')).toMatch(/scheduled/)
    const postiz = net.postiz()
    expect(postiz.every((c) => c.url.startsWith(CLOUD) && c.auth === 'cloud-key')).toBe(true)
    const create = postiz.find((c) => c.url.endsWith('/posts'))!.body as { posts: { settings: { __type: string } }[] }
    expect(create.posts[0].settings.__type).toBe('instagram-standalone')
    const after = await read(d.id)
    expect(after).toMatchObject({ status: 'scheduled', postizBackend: 'cloud' })
    expect(after.postizPosts).toMatchObject([{ platform: 'instagram', postId: 'cloud-1' }])
  })

  it('cancels each draft on the backend that holds it', async () => {
    setEnv('cloud')
    const net = fakeNetwork()
    const old = await make({ status: 'scheduled', publishAt: '2031-01-01T15:00:00Z', postizPosts: [{ platform: 'instagram', postId: 'old1' }] })
    const now = new Date('2030-12-31T00:00:00Z')
    await cancelDraft(payload, old.id, now)
    const fresh = await make({
      status: 'scheduled',
      publishAt: '2031-01-01T15:00:00Z',
      postizBackend: 'cloud',
      postizPosts: [{ platform: 'instagram', postId: 'new1' }],
    })
    await cancelDraft(payload, fresh.id, now)
    expect(net.postiz().map((c) => [c.method, c.url])).toEqual([
      ['DELETE', `${HETZNER}/posts/old1`],
      ['DELETE', `${CLOUD}/posts/new1`],
    ])
  })

  it('settles each draft from its own backend, and never reads a missing id as failed', async () => {
    setEnv('cloud')
    const at = '2031-03-01T15:00:00Z'
    const old = await make({ status: 'scheduled', publishAt: at, postizPosts: [{ platform: 'instagram', postId: 'h-A' }] })
    const fresh = await make({
      status: 'scheduled',
      publishAt: at,
      postizBackend: 'cloud',
      postizPosts: [{ platform: 'instagram', postId: 'c-B' }],
    })
    const net = fakeNetwork({
      states: { hetzner: [{ id: 'h-A', state: 'PUBLISHED' }], cloud: [{ id: 'c-B', state: 'ERROR' }] },
    })
    await markPublished(payload, new Date('2031-03-02T00:00:00Z'))
    expect((await read(old.id)).status).toBe('published')
    expect((await read(fresh.id)).status).toBe('failed')
    const lists = net.postiz().filter((c) => c.url.includes('/posts?'))
    expect(lists.map((c) => c.url.startsWith(CLOUD) ? 'cloud' : 'hetzner').sort()).toEqual(['cloud', 'hetzner'])
  })

  it('moves an Instagram draft: creates on Cloud, saves, then deletes on Hetzner', async () => {
    setEnv('cloud')
    const net = fakeNetwork()
    const d = await make({
      status: 'scheduled',
      publishAt: '2031-01-01T15:00:00Z',
      format: 'story',
      postizPosts: [{ platform: 'instagram', postId: 'hz-old' }],
    })
    const msg = await moveDraftToCloud(payload, d.id, new Date('2030-12-31T00:00:00Z'))
    expect(msg).toMatch(/moved to Postiz Cloud/)
    const postiz = net.postiz().map((c) => `${c.method} ${c.url.startsWith(CLOUD) ? 'cloud' : 'hetzner'}${new URL(c.url).pathname.replace(/.*\/public\/v1/, '')}`)
    expect(postiz).toEqual(['GET cloud/integrations', 'POST cloud/upload', 'POST cloud/posts', 'DELETE hetzner/posts/hz-old'])
    const create = net.postiz().find((c) => c.method === 'POST' && c.url.endsWith('/posts'))!.body as {
      date: string
      type: string
      posts: { settings: Record<string, unknown> }[]
    }
    expect(create).toMatchObject({ type: 'schedule', date: '2031-01-01T15:00:00.000Z' })
    expect(create.posts[0].settings).toEqual({ __type: 'instagram-standalone', post_type: 'story' })
    const after = await read(d.id)
    expect(after).toMatchObject({ status: 'scheduled', postizBackend: 'cloud', publishAt: '2031-01-01T15:00:00.000Z' })
    expect(after.postizPosts).toMatchObject([{ platform: 'instagram', postId: 'cloud-1' }])
  })

  it('keeps the Cloud record when the Hetzner delete fails, and says so', async () => {
    setEnv('cloud')
    fakeNetwork({ failHetznerDelete: true })
    const d = await make({ status: 'scheduled', publishAt: '2031-01-01T15:00:00Z', postizPosts: [{ platform: 'instagram', postId: 'hz-x' }] })
    expect(await moveDraftToCloud(payload, d.id, new Date('2030-12-31T00:00:00Z'))).toMatch(/hz-x could not be deleted/)
    expect((await read(d.id)).postizBackend).toBe('cloud')
  })

  it('refuses to move what it should not', async () => {
    setEnv('cloud')
    const net = fakeNetwork()
    const now = new Date('2030-12-31T00:00:00Z')
    const fb = await make({ status: 'scheduled', platforms: ['facebook', 'instagram'], caption: 'x https://flamingocounty.com', publishAt: '2031-01-01T15:00:00Z', postizPosts: [{ platform: 'facebook', postId: 'f' }] })
    await expect(moveDraftToCloud(payload, fb.id, now)).rejects.toThrow(/Instagram-only/)
    const already = await make({ status: 'scheduled', publishAt: '2031-01-01T15:00:00Z', postizBackend: 'cloud', postizPosts: [{ platform: 'instagram', postId: 'c' }] })
    await expect(moveDraftToCloud(payload, already.id, now)).rejects.toThrow(/already on Postiz Cloud/)
    const soon = await make({ status: 'scheduled', publishAt: '2030-12-31T00:01:00Z', postizPosts: [{ platform: 'instagram', postId: 's' }] })
    await expect(moveDraftToCloud(payload, soon.id, now)).rejects.toThrow(/too soon/)
    const pending = await make({ status: 'rejected' })
    await expect(moveDraftToCloud(payload, pending.id, now)).rejects.toThrow(/only a scheduled draft/)
    expect(net.postiz()).toHaveLength(0)
  })
})
