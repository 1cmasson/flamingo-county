// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import config from '@payload-config'
import { HQ_INTERNAL, cancelDraft, decideDraft, draftFingerprint } from '../../src/lib/hq'
import { facebookProblem } from '../../src/lib/postiz'
import { FB_LINK, makeHqMedia, withFbLink } from './helpers/facebook'

describe('facebookProblem', () => {
  it('lets other platforms and complete Facebook posts through', () => {
    expect(facebookProblem(['instagram'], 0, 'x')).toBeNull()
    expect(facebookProblem(['facebook'], 1, `hola ${FB_LINK}/go/fb/1`)).toBeNull()
    expect(facebookProblem(['facebook'], 1, 'see www.flamingocounty.com today')).toBeNull()
  })
  it('names what is missing', () => {
    expect(facebookProblem(['facebook'], 0, `hola ${FB_LINK}`)).toMatch(/photo or video/)
    expect(facebookProblem(['facebook'], 1, 'hola')).toMatch(/flamingocounty\.com link/)
    expect(facebookProblem(['facebook'], 0, 'hola')).toMatch(/photo or video and a flamingocounty\.com link/)
    expect(facebookProblem(['facebook'], 1, 'notflamingocounty.com.evil.io')).toMatch(/link/)
  })
})

describe('Facebook rule and cancelling, against the database', () => {
  let payload: Payload
  let mediaId: number
  const ids: number[] = []
  const calls: { url: string; method: string }[] = []

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    mediaId = await makeHqMedia(payload)
  })
  beforeEach(() => {
    calls.length = 0
    process.env.POSTIZ_API_URL = 'https://postiz.test/api/public/v1'
    process.env.POSTIZ_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET' })
      return new Response('{}', { status: 200 })
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.POSTIZ_API_URL
    delete process.env.POSTIZ_API_KEY
  })
  afterAll(async () => {
    for (const id of ids) await payload.delete({ collection: 'hq-social-drafts', id, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'hq-media', id: mediaId, overrideAccess: true }).catch(() => undefined)
  })

  const make = async (data: Record<string, unknown>, internal = true) => {
    const d = await payload.create({
      collection: 'hq-social-drafts',
      data: { caption: 'TEST', platforms: ['facebook'], scheduledFor: '2030-01-01T15:00:00Z', ...data } as never,
      overrideAccess: true,
      ...(internal ? { context: { [HQ_INTERNAL]: true } } : {}),
    })
    ids.push(d.id)
    return d
  }

  it('refuses to save a text-only Facebook draft, and one with no link', async () => {
    await expect(make({ caption: withFbLink('hola'), media: [] }, false)).rejects.toThrow()
    await expect(make({ caption: 'hola, no link', media: [mediaId] }, false)).rejects.toThrow()
    const ok = await make({ caption: withFbLink('hola'), media: [mediaId], status: 'rejected' }, false)
    expect(ok.id).toBeTruthy()
  })

  it('refuses at Approve a draft that breaks the rule, and leaves it pending', async () => {
    const d = await make({ caption: 'no link', media: [mediaId], status: 'pending' })
    await payload.update({ collection: 'hq-social-drafts', id: d.id, data: { previewedHash: draftFingerprint(d as never) }, overrideAccess: true, context: { [HQ_INTERNAL]: true } })
    const msg = await decideDraft(payload, d.id, 'approve')
    expect(msg).toMatch(/not posted/)
    expect(msg).toMatch(/flamingocounty\.com link/)
    expect((await payload.findByID({ collection: 'hq-social-drafts', id: d.id, overrideAccess: true })).status).toBe('pending')
    expect(calls).toHaveLength(0)
  })

  it('cancels a scheduled post in Postiz and rejects the draft', async () => {
    const d = await make({
      caption: withFbLink('x'), media: [mediaId], status: 'scheduled', publishAt: '2030-01-01T15:00:00Z',
      postizPosts: [{ platform: 'facebook', postId: 'abc123' }],
    })
    const out = await cancelDraft(payload, d.id, new Date('2029-12-31T00:00:00Z'))
    expect(out).toMatch(/removed from Postiz/)
    expect(calls).toEqual([{ url: 'https://postiz.test/api/public/v1/posts/abc123', method: 'DELETE' }])
    const after = await payload.findByID({ collection: 'hq-social-drafts', id: d.id, overrideAccess: true })
    expect(after.status).toBe('rejected')
  })

  it('refuses a post whose time has passed, and keeps the draft when Postiz fails', async () => {
    const past = await make({ caption: withFbLink('x'), media: [mediaId], status: 'scheduled', publishAt: '2020-01-01T15:00:00Z', postizPosts: [{ platform: 'facebook', postId: 'p1' }] })
    await expect(cancelDraft(payload, past.id)).rejects.toThrow(/gone out/)
    expect(calls).toHaveLength(0)

    const live = await make({ caption: withFbLink('x'), media: [mediaId], status: 'scheduled', publishAt: '2030-01-01T15:00:00Z', postizPosts: [{ platform: 'facebook', postId: 'p2' }] })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))
    await expect(cancelDraft(payload, live.id, new Date('2029-12-31T00:00:00Z'))).rejects.toThrow(/Postiz/)
    expect((await payload.findByID({ collection: 'hq-social-drafts', id: live.id, overrideAccess: true })).status).toBe('scheduled')
  })
})
