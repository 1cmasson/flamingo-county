// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import config from '@payload-config'
import { HQ_INTERNAL, cancelDraft, decideDraft, draftFingerprint } from '../../src/lib/hq'
import { facebookProblem, languageProblem, singleEventProblem, storyProblem } from '../../src/lib/postiz'
import { markPublished } from '../../src/lib/socialStats'
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

describe('storyProblem', () => {
  it('lets a post through, and a story on Instagram alone with one file', () => {
    expect(storyProblem('post', ['facebook', 'instagram', 'tiktok'], 3)).toBeNull()
    expect(storyProblem(null, ['facebook'], 0)).toBeNull()
    expect(storyProblem('story', ['instagram'], 1)).toBeNull()
  })
  it('refuses a story with another platform, or not exactly one file', () => {
    expect(storyProblem('story', ['facebook', 'instagram'], 1)).toMatch(/Instagram only.*facebook, instagram/)
    expect(storyProblem('story', ['tiktok'], 1)).toMatch(/Instagram only/)
    expect(storyProblem('story', ['instagram'], 0)).toMatch(/exactly one photo or video.*0 files/)
    expect(storyProblem('story', ['instagram'], 2)).toMatch(/2 files/)
  })
})

describe('singleEventProblem', () => {
  const page = 'https://flamingocounty.com/es/events/free-immigration-consultations-2026-10-14'
  it('lets a story, the weekly carousel and other posts through', () => {
    expect(singleEventProblem('story', `Consultas 👉 ${page}`)).toBeNull()
    expect(singleEventProblem('post', 'Lo que hay esta semana: https://flamingocounty.com/go/fb/72?to=/es/this-week')).toBeNull()
    expect(singleEventProblem(null, 'More Miami stories: https://flamingocounty.com/en/stories')).toBeNull()
    expect(singleEventProblem('post', 'All events: https://flamingocounty.com/es/events')).toBeNull()
  })
  it('refuses a feed post for one event, by its page or a /go/ link to it', () => {
    expect(singleEventProblem('post', `Consultas 👉 ${page}`)).toMatch(/Instagram story/)
    expect(singleEventProblem(undefined, `👉 ${page}`)).toMatch(/Instagram story/)
    expect(singleEventProblem('post', 'https://flamingocounty.com/go/fb/9?to=/en/events/noche-de-son')).toMatch(/Instagram story/)
  })
})

describe('languageProblem', () => {
  // The two cross-language lines that were on Andy García Part 1, and the mural's ES block.
  const es = 'Parte 1 de 2 🎬\n\nEn 1961, un niño de cinco años salió de La Habana con una maleta.\n\nLa parte 2 sale hoy a las 7 PM. Síguenos para que no te la pierdas.'
  const en = "Part 1 of 2 🎬\n\nIn 1961, a five-year-old left Havana with one bag.\n\nPart 2 drops today at 8 PM. Follow so you don't miss it."
  it('lets one-language captions, bilingual drafts and stories through', () => {
    expect(languageProblem('es', 'post', `${es}\n\nLogo de The Godfather Part III (1990), Paramount Pictures, solo para identificarla.\n\n#ExilioCubano #Miami`)).toBeNull()
    expect(languageProblem('en', 'post', `${en}\n\nLunch at La Mano Hispana in Hialeah, the best of the neighborhood.`)).toBeNull()
    expect(languageProblem('both', 'post', `${es}\n\n${en}`)).toBeNull()
    expect(languageProblem(null, 'post', `${es}\n\n${en}`)).toBeNull()
    expect(languageProblem('es', 'story', `${es}\n\n${en}`)).toBeNull()
  })
  it('refuses a block or a note in the other language', () => {
    expect(languageProblem('es', 'post', `${es}\n\nIn English: Part 2 drops today at 8 PM.`)).toMatch(/Spanish post.*In English: Part 2/)
    expect(languageProblem('en', 'post', `${en}\n\nEn español: la parte 2 sale hoy a las 7 PM.`)).toMatch(/English post.*En español/)
    expect(languageProblem('en', null, 'Overnight, they painted over the salsa legends mural on Calle Ocho.\n\nDe la noche a la mañana taparon el mural de las leyendas de la salsa en la Calle Ocho.')).toMatch(/English only.*De la noche/)
    expect(languageProblem('es', 'post', `${es}\n\n${en}`)).toMatch(/Spanish only/)
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

  it('refuses to save a story with Facebook in it, or with more than one file', async () => {
    const second = await makeHqMedia(payload)
    try {
      const story = { format: 'story', caption: withFbLink('Noche de son'), status: 'rejected' }
      await expect(make({ ...story, platforms: ['facebook', 'instagram'], media: [mediaId] }, false)).rejects.toMatchObject({
        data: { errors: [expect.objectContaining({ path: 'media', message: expect.stringMatching(/Instagram only/) })] },
      })
      await expect(make({ ...story, platforms: ['instagram'], media: [mediaId, second] }, false)).rejects.toThrow()
      const ok = await make({ ...story, platforms: ['instagram'], media: [mediaId] }, false)
      expect(ok.format).toBe('story')
    } finally {
      await payload.delete({ collection: 'hq-media', id: second, overrideAccess: true }).catch(() => undefined)
    }
  })

  it('refuses at Approve a story that names Facebook, saved around the check', async () => {
    const d = await make({ format: 'story', caption: withFbLink('x'), platforms: ['facebook', 'instagram'], media: [mediaId], status: 'pending' })
    await payload.update({ collection: 'hq-social-drafts', id: d.id, data: { previewedHash: draftFingerprint(d as never) }, overrideAccess: true, context: { [HQ_INTERNAL]: true } })
    const msg = await decideDraft(payload, d.id, 'approve')
    expect(msg).toMatch(/not posted.*Instagram only/)
    expect((await payload.findByID({ collection: 'hq-social-drafts', id: d.id, overrideAccess: true })).status).toBe('pending')
    expect(calls).toHaveLength(0)
  })

  it('refuses to save a feed post for a single event, and takes it as a story', async () => {
    const caption = `Consultas de inmigración gratis\n👉 ${FB_LINK}/es/events/free-immigration-consultations-2026-10-14`
    await expect(make({ caption, platforms: ['instagram'], media: [mediaId], status: 'rejected' }, false)).rejects.toMatchObject({
      data: { errors: [expect.objectContaining({ path: 'caption', message: expect.stringMatching(/Instagram story/) })] },
    })
    const ok = await make({ caption, format: 'story', platforms: ['instagram'], media: [mediaId], status: 'rejected' }, false)
    expect(ok.format).toBe('story')
  })

  it('refuses to save an English post with a Spanish block, and at Approve one saved around the check', async () => {
    const caption = withFbLink('Overnight, they painted over the salsa legends mural on Calle Ocho.\n\nDe la noche a la mañana taparon el mural de las leyendas de la salsa en la Calle Ocho.')
    await expect(make({ caption, language: 'en', media: [mediaId], status: 'rejected' }, false)).rejects.toMatchObject({
      data: { errors: [expect.objectContaining({ path: 'caption', message: expect.stringMatching(/English only/) })] },
    })
    const both = await make({ caption, language: 'both', media: [mediaId], status: 'rejected' }, false)
    expect(both.language).toBe('both')

    const d = await make({ caption, language: 'en', media: [mediaId], status: 'pending' })
    await payload.update({ collection: 'hq-social-drafts', id: d.id, data: { previewedHash: draftFingerprint(d as never) }, overrideAccess: true, context: { [HQ_INTERNAL]: true } })
    expect(await decideDraft(payload, d.id, 'approve')).toMatch(/not posted.*English only/)
    expect(calls).toHaveLength(0)
  })

  it('refuses at Approve a single-event feed post saved around the check', async () => {
    const d = await make({ caption: `x ${FB_LINK}/es/events/noche-de-son`, platforms: ['instagram'], media: [mediaId], status: 'pending' })
    await payload.update({ collection: 'hq-social-drafts', id: d.id, data: { previewedHash: draftFingerprint(d as never) }, overrideAccess: true, context: { [HQ_INTERNAL]: true } })
    expect(await decideDraft(payload, d.id, 'approve')).toMatch(/not posted.*Instagram story/)
    expect(calls).toHaveLength(0)
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

describe('marking drafts published', () => {
  let payload: Payload
  let mediaId: number
  const ids: number[] = []
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    mediaId = await makeHqMedia(payload)
  })
  afterEach(() => vi.unstubAllGlobals())
  afterAll(async () => {
    for (const id of ids) await payload.delete({ collection: 'hq-social-drafts', id, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'hq-media', id: mediaId, overrideAccess: true }).catch(() => undefined)
  })
  const scheduled = async (postId: string, publishAt: string, platforms: string[] = ['facebook']) => {
    const d = await payload.create({
      collection: 'hq-social-drafts',
      data: {
        caption: withFbLink('x'), platforms, media: [mediaId], scheduledFor: publishAt, publishAt, status: 'scheduled',
        postizPosts: platforms.map((platform) => ({ platform, postId: `${postId}-${platform}` })),
      } as never,
      overrideAccess: true,
      context: { [HQ_INTERNAL]: true },
    })
    ids.push(d.id)
    return d
  }
  const stub = (posts: { id: string; state: string }[]) => {
    process.env.POSTIZ_API_URL = 'https://postiz.test/api/public/v1'
    process.env.POSTIZ_API_KEY = 'k'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ posts }), { status: 200 })))
  }
  const status = async (id: number) => (await payload.findByID({ collection: 'hq-social-drafts', id, overrideAccess: true })).status

  it('marks a draft published when every Postiz post is PUBLISHED, and leaves the rest', async () => {
    const now = new Date('2031-01-02T00:00:00Z')
    const live = await scheduled('a', '2031-01-01T15:00:00Z')
    const queued = await scheduled('b', '2031-01-01T15:00:00Z')
    const half = await scheduled('c', '2031-01-01T15:00:00Z', ['facebook', 'instagram'])
    const missing = await scheduled('d', '2031-01-01T15:00:00Z')
    const future = await scheduled('e', '2031-02-01T15:00:00Z')
    stub([
      { id: 'a-facebook', state: 'PUBLISHED' }, { id: 'b-facebook', state: 'QUEUE' },
      { id: 'c-facebook', state: 'PUBLISHED' }, { id: 'c-instagram', state: 'ERROR' },
      { id: 'e-facebook', state: 'PUBLISHED' },
    ])
    expect(await markPublished(payload, now)).toBe(1)
    expect(await status(live.id)).toBe('published')
    expect(await status(queued.id)).toBe('scheduled')
    expect(await status(half.id)).toBe('scheduled')
    expect(await status(missing.id)).toBe('scheduled')
    expect(await status(future.id)).toBe('scheduled')
  })
})
