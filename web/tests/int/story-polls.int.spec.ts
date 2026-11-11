// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalReq, getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import {
  castPollVote,
  currentPollSlug,
  pollPhase,
  pollTally,
  pollWinner,
  resetPollVoteLimits,
  siteVotesFor,
  votedCookie,
  votedFor,
} from '@/lib/storyPolls'
import { cleanSuggestion, resetSuggestionLimits, suggestStory } from '@/lib/storySuggestions'
import { POST as voteRoute } from '@/app/api/story-polls/vote/route'
import { decidePublish, requestPublish } from '@/lib/publishRequests'

/**
 * The weekly story vote (lib/storyPolls.ts): moved along by its own dates,
 * the split = site votes (no staff tests) + comments counted by hand, a tie
 * to the option listed first, one vote per browser per poll (its cookie),
 * an address cap as the backstop, and suggestions that are just words.
 */

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const browser = (extra: Record<string, string> = {}) =>
  new Headers({ 'user-agent': IPHONE, 'sec-fetch-site': 'same-origin', host: 'flamingocounty.com', ...extra })

const T = (iso: string) => new Date(iso).getTime()
const opensAt = '2026-11-11T05:00:00.000Z'
const closesAt = '2026-11-16T04:59:00.000Z'
const four = [
  { key: 'jack-tigertail', title: 'Jack Tigertail' },
  { key: 'carol-city', title: 'Carol City' },
  { key: 'emilio-parte-2', title: 'Emilio 2' },
  { key: 'chiquita', title: 'Chiquita' },
]

describe('the poll', () => {
  it('moves along by its dates', () => {
    const poll = { opensAt, closesAt }
    expect(pollPhase(poll, T('2026-11-10T12:00:00Z'))).toBe('upcoming')
    expect(pollPhase(poll, T(opensAt))).toBe('open')
    expect(pollPhase(poll, T('2026-11-13T12:00:00Z'))).toBe('open')
    expect(pollPhase(poll, T(closesAt))).toBe('closed')
    expect(pollPhase({ opensAt: '', closesAt: '' }, T('2026-11-13T12:00:00Z'))).toBe('upcoming')
  })

  it('adds the counted comments to the site’s votes, and ignores keys no longer in the poll', () => {
    const options = four.map((o, i) => ({ ...o, commentVotes: i === 1 ? 5 : null }))
    const tally = pollTally({ options }, { 'jack-tigertail': 3, 'carol-city': 1, gone: 9 })
    expect(tally).toEqual({ counts: { 'jack-tigertail': 3, 'carol-city': 6, 'emilio-parte-2': 0, chiquita: 0 }, total: 9 })
    expect(pollWinner({ options }, tally)?.key).toBe('carol-city')
  })

  it('gives a tie to the option listed first, and nobody wins without votes', () => {
    const tie = pollTally({ options: four }, { chiquita: 4, 'carol-city': 4 })
    expect(pollWinner({ options: four }, tie)?.key).toBe('carol-city')
    expect(pollWinner({ options: four }, pollTally({ options: four }, {}))).toBeNull()
  })

  it('reads this browser’s vote from its cookie, only for a key in the poll', () => {
    const poll = { id: 7, options: four }
    expect(votedCookie(7)).toBe('fc.poll.7')
    expect(votedFor(poll, 'fc.lang=es; fc.poll.7=chiquita')).toBe('chiquita')
    expect(votedFor(poll, 'fc.poll.8=chiquita')).toBeNull()
    expect(votedFor(poll, 'fc.poll.7=nope')).toBeNull()
    expect(votedFor(poll, null)).toBeNull()
  })

  it('takes a suggestion that is just words about a story', () => {
    expect(cleanSuggestion('  La historia del   Orange Bowl ')).toBe('La historia del Orange Bowl')
    expect(cleanSuggestion('mira www.example.com')).toBeNull()
    expect(cleanSuggestion('llama al 305 555 1234')).toBeNull()
    expect(cleanSuggestion('el tour de $20')).toBeNull()
    expect(cleanSuggestion('ok')).toBeNull()
    expect(cleanSuggestion('x'.repeat(141))).toBeNull()
    expect(cleanSuggestion(42)).toBeNull()
  })
})

describe('voting', () => {
  let payload: Payload
  let pollId: number
  const slug = `story-poll-test-${Date.now()}`
  const during = T('2026-11-13T12:00:00Z')

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const poll = await payload.create({
      collection: 'story-polls',
      data: {
        slug,
        title: 'Tú escoges',
        question: '¿Cuál?',
        opensAt,
        closesAt,
        options: four.map((o) => (o.key === 'chiquita' ? { ...o, commentVotes: 10 } : o)),
        _status: 'published',
      },
      overrideAccess: true,
    })
    pollId = poll.id
  })

  beforeEach(() => {
    resetPollVoteLimits()
    resetSuggestionLimits()
  })

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'story-poll-votes', where: { poll: { equals: pollId } }, overrideAccess: true })
    await payload.delete({ collection: 'story-poll-suggestions', where: { poll: { equals: pollId } }, overrideAccess: true })
    await payload.delete({ collection: 'story-polls', id: pollId, overrideAccess: true }).catch(() => undefined)
  })

  it('counts a vote for a story in an open poll and answers with the split, comments included', async () => {
    const out = await castPollVote(payload, { slug, pick: 'carol-city', utm: 'ig' }, browser(), during)
    expect(out).toMatchObject({ ok: true, pollId, pick: 'carol-city', total: 11 })
    expect(out.ok && out.counts).toEqual({ 'jack-tigertail': 0, 'carol-city': 1, 'emilio-parte-2': 0, chiquita: 10 })
    const { docs } = await payload.find({ collection: 'story-poll-votes', where: { poll: { equals: pollId } }, overrideAccess: true })
    expect(docs[0]).toMatchObject({ option: 'carol-city', source: 'instagram', lang: 'es', test: false })
  })

  it('refuses a key not in the poll, before it opens, after it closes, bots, other sites and unknown polls', async () => {
    expect(await castPollVote(payload, { slug, pick: 'nope' }, browser(), during)).toMatchObject({ ok: false, reason: 'invalid' })
    expect(await castPollVote(payload, { slug, pick: 'chiquita' }, browser(), T('2026-11-10T00:00:00Z'))).toMatchObject({ ok: false, reason: 'closed' })
    expect(await castPollVote(payload, { slug, pick: 'chiquita' }, browser(), T('2026-11-17T00:00:00Z'))).toMatchObject({ ok: false, reason: 'closed' })
    expect(
      await castPollVote(payload, { slug, pick: 'chiquita' }, browser({ 'user-agent': 'facebookexternalhit/1.1' }), during),
    ).toMatchObject({ ok: false, reason: 'refused' })
    expect(await castPollVote(payload, { slug, pick: 'chiquita' }, browser({ 'sec-fetch-site': 'cross-site' }), during)).toMatchObject({
      ok: false,
      reason: 'refused',
    })
    expect(await castPollVote(payload, { slug: 'nope', pick: 'chiquita' }, browser(), during)).toMatchObject({ ok: false, reason: 'not-found' })
    expect(await castPollVote(payload, { slug: 'Bad Slug!', pick: 'chiquita' }, browser(), during)).toMatchObject({ ok: false, reason: 'not-found' })
  })

  it('refuses a second vote from a browser that already voted, and shows it the split', async () => {
    const before = await siteVotesFor(payload, pollId)
    const out = await castPollVote(payload, { slug, pick: 'chiquita' }, browser({ cookie: `${votedCookie(pollId)}=carol-city` }), during)
    expect(out).toMatchObject({ ok: false, reason: 'already', pick: 'carol-city' })
    expect(await siteVotesFor(payload, pollId)).toEqual(before)
  })

  it('caps one address per poll per day', async () => {
    const from = browser({ 'cf-connecting-ip': '203.0.113.9' })
    const results = []
    for (let i = 0; i < 32; i++) results.push(await castPollVote(payload, { slug, pick: 'jack-tigertail' }, from, during))
    expect(results.filter((r) => r.ok)).toHaveLength(30)
    expect(results.at(-1)).toMatchObject({ ok: false, reason: 'busy' })
    // The next Miami day starts a new count.
    expect(await castPollVote(payload, { slug, pick: 'jack-tigertail' }, from, during + 86_400_000 - 1)).toMatchObject({ ok: true })
  })

  it('takes a staff vote as a test, left out of every count but shown to the voter', async () => {
    const before = await siteVotesFor(payload, pollId)
    const out = await castPollVote(payload, { slug, pick: 'emilio-parte-2' }, browser({ cookie: 'fc-self=1' }), during)
    expect(out).toMatchObject({ ok: true })
    expect(out.ok && out.counts['emilio-parte-2']).toBe((before['emilio-parte-2'] ?? 0) + 1)
    expect(await siteVotesFor(payload, pollId)).toEqual(before)
  })

  it('leaves the browser a cookie with only the key picked, so it votes once', async () => {
    // The route votes "now", so this poll is open around the real clock.
    const live = await payload.create({
      collection: 'story-polls',
      data: {
        slug: `${slug}-live`,
        title: 'Live',
        question: '¿Cuál?',
        opensAt: new Date(Date.now() - 3_600_000).toISOString(),
        closesAt: new Date(Date.now() + 86_400_000).toISOString(),
        options: four,
        _status: 'published',
      },
      overrideAccess: true,
    })
    const req = (cookie?: string) =>
      new Request('https://flamingocounty.com/api/story-polls/vote', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': IPHONE, 'sec-fetch-site': 'same-origin', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({ slug: `${slug}-live`, pick: 'chiquita', lang: 'en' }),
      })
    try {
      const res = await voteRoute(req())
      expect(res.status).toBe(201)
      expect(res.headers.get('cache-control')).toBe('no-store')
      const set = res.headers.get('set-cookie') ?? ''
      expect(set).toMatch(new RegExp(`^fc\\.poll\\.${live.id}=chiquita; Path=/; Max-Age=\\d+; SameSite=Lax; HttpOnly; Secure$`))
      const again = await voteRoute(req(`fc.poll.${live.id}=chiquita`))
      expect(again.status).toBe(409)
      expect(again.headers.get('set-cookie')).toBeNull()
      expect(await again.json()).toMatchObject({ ok: false, reason: 'already', pick: 'chiquita', total: 1 })
    } finally {
      await payload.delete({ collection: 'story-poll-votes', where: { poll: { equals: live.id } }, overrideAccess: true })
      await payload.delete({ collection: 'story-polls', id: live.id, overrideAccess: true })
    }
  })

  it('lets an admin preview vote on an unpublished draft, as a test, and nobody else', async () => {
    const draftSlug = `${slug}-draft`
    const draft = await payload.create({
      collection: 'story-polls',
      data: { slug: draftSlug, title: 'Draft', question: '¿Cuál?', opensAt, closesAt, options: four },
      draft: true,
      overrideAccess: true,
    })
    try {
      expect(await castPollVote(payload, { slug: draftSlug, pick: 'chiquita' }, browser(), during)).toMatchObject({ ok: false, reason: 'not-found' })
      // A preview is never refused for a cookie: the admin tries it as often as they like.
      expect(
        await castPollVote(payload, { slug: draftSlug, pick: 'chiquita' }, browser({ cookie: `${votedCookie(draft.id)}=chiquita` }), during, {
          preview: true,
        }),
      ).toMatchObject({ ok: true })
      expect(await siteVotesFor(payload, draft.id)).toEqual({})
    } finally {
      await payload.delete({ collection: 'story-poll-votes', where: { poll: { equals: draft.id } }, overrideAccess: true })
      await payload.delete({ collection: 'story-polls', id: draft.id, overrideAccess: true })
    }
  })

  it('stores a suggestion, refuses links, and caps an address', async () => {
    const from = browser({ 'cf-connecting-ip': '203.0.113.10' })
    expect(await suggestStory(payload, { slug, text: 'El Orange Bowl', utm: 'ig' }, from, during)).toEqual({ ok: true })
    expect(await suggestStory(payload, { slug, text: 'https://spam.example' }, from, during)).toMatchObject({ ok: false, reason: 'invalid' })
    expect(await suggestStory(payload, { slug: 'nope', text: 'El Orange Bowl' }, from, during)).toMatchObject({ ok: false, reason: 'not-found' })
    expect(await suggestStory(payload, { slug, text: 'Otra historia' }, from, during)).toEqual({ ok: true })
    expect(await suggestStory(payload, { slug, text: 'Y otra más' }, from, during)).toEqual({ ok: true })
    expect(await suggestStory(payload, { slug, text: 'Una cuarta' }, from, during)).toMatchObject({ ok: false, reason: 'busy' })
    const { docs } = await payload.find({
      collection: 'story-poll-suggestions',
      where: { poll: { equals: pollId } },
      sort: 'createdAt',
      overrideAccess: true,
    })
    expect(docs[0]).toMatchObject({ text: 'El Orange Bowl', source: 'instagram', test: false })
  })
})

describe('the current poll', () => {
  let payload: Payload
  const ids: number[] = []
  const tag = `current-poll-${Date.now()}`
  const make = async (suffix: string, opens: string, closes: string, published = true) => {
    const doc = await payload.create({
      collection: 'story-polls',
      data: {
        slug: `${tag}-${suffix}`,
        title: suffix,
        question: '?',
        opensAt: opens,
        closesAt: closes,
        options: four,
        ...(published ? { _status: 'published' as const } : {}),
      },
      draft: !published,
      overrideAccess: true,
    })
    ids.push(doc.id)
  }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    // Far from any other test's dates, so only these count.
    await make('last-week', '2031-03-03T05:00:00.000Z', '2031-03-10T04:59:00.000Z')
    await make('this-week', '2031-03-10T05:00:00.000Z', '2031-03-17T04:59:00.000Z')
    await make('next-week', '2031-03-17T05:00:00.000Z', '2031-03-24T04:59:00.000Z')
    await make('draft', '2031-03-12T05:00:00.000Z', '2031-03-19T04:59:00.000Z', false)
  })

  afterAll(async () => {
    for (const id of ids) await payload.delete({ collection: 'story-polls', id, overrideAccess: true }).catch(() => undefined)
  })

  it('is the one open now, else the last to close; never a draft', async () => {
    expect(await currentPollSlug(payload, T('2031-03-13T12:00:00Z'))).toBe(`${tag}-this-week`)
    expect(await currentPollSlug(payload, T('2031-04-01T12:00:00Z'))).toBe(`${tag}-next-week`)
  })
})

describe('the owner’s path: a draft over MCP, both languages, then the Publish tap', () => {
  let payload: Payload
  let pollId = 0
  let userId = 0
  const slug = `story-poll-publish-${Date.now()}`

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.TELEGRAM_OWNER_CHAT_ID = '1001'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ok: true, result: { message_id: 1 } })),
    )
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_OWNER_CHAT_ID
    if (!payload) return
    await payload.delete({ collection: 'hq-publish-requests', where: { collection: { equals: 'story-polls' } }, overrideAccess: true })
    if (pollId) await payload.delete({ collection: 'story-polls', id: pollId, overrideAccess: true }).catch(() => undefined)
    if (userId) await payload.delete({ collection: 'users', id: userId, overrideAccess: true }).catch(() => undefined)
  })

  it('takes only drafts over MCP, keeps each language through the other’s update, and goes live on the tap', async () => {
    const user = await payload.create({
      collection: 'users',
      data: { email: `poll-publish-${Date.now()}@example.com`, password: 'not-a-real-password-1' },
      overrideAccess: true,
    })
    userId = user.id
    const req = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    req.payloadAPI = 'MCP'
    const data = {
      slug,
      title: 'Tú escoges la historia del miércoles',
      question: '¿Qué historia contamos?',
      opensAt: '2031-05-05T00:00:00-05:00',
      closesAt: '2031-05-10T23:59:00-05:00',
      options: four.map((o) => ({ key: o.key, title: `${o.title} (es)` })),
    }
    await expect(payload.create({ collection: 'story-polls', data, locale: 'es', req })).rejects.toThrow(/draft: true/)
    // Even asking for published, an MCP save stays a draft.
    const draft = await payload.create({ collection: 'story-polls', data: { ...data, _status: 'published' }, locale: 'es', draft: true, req })
    pollId = draft.id
    expect(draft._status).toBe('draft')

    // The other language: the same row ids, or the Spanish titles would be lost.
    const saved = await payload.findByID({ collection: 'story-polls', id: draft.id, draft: true, locale: 'es', overrideAccess: true })
    await payload.update({
      collection: 'story-polls',
      id: draft.id,
      locale: 'en',
      draft: true,
      data: {
        title: 'You pick Wednesday’s story',
        question: 'Which story?',
        options: (saved.options ?? []).map((o, i) => ({ id: o.id, key: o.key, title: `${four[i].title} (en)`, commentVotes: i === 0 ? 2 : null })),
      },
      req,
    })
    expect(await getPublished()).toBeNull()

    const { requestId } = await requestPublish(payload, { collection: 'story-polls', id: draft.id })
    expect(await decidePublish(payload, requestId, 'publish')).toMatch(/Published/i)

    const es = await getPublished('es')
    const en = await getPublished('en')
    expect(es?._status).toBe('published')
    expect(es?.options?.map((o) => o.title)).toEqual(four.map((o) => `${o.title} (es)`))
    expect(en?.options?.map((o) => o.title)).toEqual(four.map((o) => `${o.title} (en)`))
    expect(es?.options?.[0].commentVotes).toBe(2)
    expect(es?.closesAt).toBe('2031-05-11T04:59:00.000Z')
    expect(await currentPollSlug(payload, T('2031-05-07T12:00:00Z'))).toBe(slug)
  })

  async function getPublished(locale: 'es' | 'en' = 'es') {
    const { docs } = await payload.find({
      collection: 'story-polls',
      where: { and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }] },
      locale,
      overrideAccess: true,
    })
    return docs[0] ?? null
  }
})
