// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { bracket, bracketSize, castVote, finalOrder, phaseOf, resetVoteLimits, seedOrder, stagesFor, talliesFor, type Tallies } from '@/lib/rankings'
import { urlsFor } from '@/lib/indexnow'

/**
 * Neighbors' rankings (lib/rankings.ts): a bracket seeded by nominations,
 * moved along by its own dates, decided by votes (a tie to the better seed),
 * and votes that count only in an open round, for a place in that game,
 * from a browser on our own site, with staff votes left out.
 */

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const browser = (extra: Record<string, string> = {}) =>
  new Headers({ 'user-agent': IPHONE, 'sec-fetch-site': 'same-origin', host: 'flamingocounty.com', ...extra })

const T = (iso: string) => new Date(iso).getTime()
const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((key) => ({ key, name: key.toUpperCase() }))
const rounds = [
  { stage: 'qf' as const, opensAt: '2026-11-10T05:00:00.000Z', closesAt: '2026-11-12T05:00:00.000Z' },
  { stage: 'sf' as const, opensAt: '2026-11-12T05:00:00.000Z', closesAt: '2026-11-14T05:00:00.000Z' },
  { stage: 'final' as const, opensAt: '2026-11-14T05:00:00.000Z', closesAt: '2026-11-16T05:00:00.000Z' },
]

describe('the bracket', () => {
  it('keeps the top two apart until the final', () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
    expect(seedOrder(4)).toEqual([1, 4, 2, 3])
    expect(stagesFor(8)).toEqual(['qf', 'sf', 'final'])
    expect(stagesFor(4)).toEqual(['sf', 'final'])
    expect(bracketSize(11)).toBe(8)
    expect(bracketSize(6)).toBe(4)
  })

  it('moves along by its dates', () => {
    const r = { entrants: eight, rounds }
    expect(phaseOf({ entrants: [], rounds: [] }, T('2026-11-11T00:00:00Z'))).toBe('nominating')
    expect(phaseOf(r, T('2026-11-09T00:00:00Z'))).toBe('nominating')
    expect(phaseOf(r, T('2026-11-11T00:00:00Z'))).toBe('voting')
    expect(phaseOf(r, T('2026-11-16T05:00:00Z'))).toBe('results')
    const gap = { entrants: eight, rounds: [rounds[0], { ...rounds[1], opensAt: '2026-11-13T05:00:00.000Z' }, rounds[2]] }
    expect(phaseOf(gap, T('2026-11-12T12:00:00Z'))).toBe('between')
  })

  it('advances the winner of each game, and a tie goes to the better seed', () => {
    const tallies: Tallies = {
      // 1v8: H upsets A; 4v5 tie → D; 2v7: B; 3v6: F upsets C
      qf: [{ a: 3, h: 9 }, { d: 4, e: 4 }, { b: 10, g: 2 }, { c: 1, f: 5 }],
      sf: [{ h: 7, d: 2 }, { b: 3, f: 3 }],
      final: [{ h: 4, b: 6 }],
    }
    const games = bracket({ entrants: eight, rounds }, tallies, T('2026-11-17T00:00:00Z'))
    expect(games[0].map((g) => g.winner?.key)).toEqual(['h', 'd', 'b', 'f'])
    expect(games[1].map((g) => [g.a?.key, g.b?.key, g.winner?.key])).toEqual([
      ['h', 'd', 'h'],
      ['b', 'f', 'b'],
    ])
    expect(games[2][0].winner?.key).toBe('b')
    expect(finalOrder({ entrants: eight }, games).map((e) => e.key)).toEqual(['b', 'h', 'd', 'f', 'a', 'c', 'e', 'g'])
  })

  it('decides nothing before a round closes', () => {
    const games = bracket({ entrants: eight, rounds }, { qf: [{ h: 9 }] }, T('2026-11-11T00:00:00Z'))
    expect(games[0][0].open).toBe(true)
    expect(games[0][0].winner).toBeNull()
    expect(games[1][0].a).toBeNull()
  })

  it('tells search engines about the ranking page in both languages', () => {
    expect(urlsFor('rankings', { slug: 'croquetas-hialeah' })).toEqual([
      'https://flamingocounty.com/en/rankings/croquetas-hialeah',
      'https://flamingocounty.com/es/rankings/croquetas-hialeah',
    ])
  })
})

describe('voting', () => {
  let payload: Payload
  let cityId: number
  let rankingId: number
  const slug = `ranking-test-${Date.now()}`
  const during = T('2026-11-11T00:00:00Z')

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const city = await payload.create({ collection: 'cities', data: { slug: `${slug}-city`, name: 'Test City' } as never, overrideAccess: true })
    cityId = city.id
    const ranking = await payload.create({
      collection: 'rankings',
      data: {
        slug,
        city: city.id,
        title: 'Test croquetas',
        question: 'Where?',
        entrants: eight,
        rounds,
        _status: 'published',
      },
      overrideAccess: true,
    })
    rankingId = ranking.id
  })

  beforeEach(() => resetVoteLimits())

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'ranking-votes', where: { ranking: { equals: rankingId } }, overrideAccess: true })
    await payload.delete({ collection: 'rankings', id: rankingId, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'cities', id: cityId, overrideAccess: true }).catch(() => undefined)
  })

  it('counts a vote for a place in an open game and answers with the new count', async () => {
    const out = await castVote(payload, { slug, matchup: 0, pick: 'h', utm: 'ig' }, browser(), during)
    expect(out).toEqual({ ok: true, stage: 'qf', matchup: 0, votes: [0, 1] })
    const tallies = await talliesFor(payload, rankingId)
    expect(tallies.qf?.[0]).toEqual({ h: 1 })
    const { docs } = await payload.find({ collection: 'ranking-votes', where: { ranking: { equals: rankingId } }, overrideAccess: true })
    expect(docs[0]).toMatchObject({ stage: 'qf', matchup: 0, entrant: 'h', source: 'instagram', test: false })
  })

  it('refuses a place not in that game, a closed round, bots and other sites', async () => {
    expect(await castVote(payload, { slug, matchup: 0, pick: 'b' }, browser(), during)).toMatchObject({ ok: false, reason: 'invalid' })
    expect(await castVote(payload, { slug, matchup: 0, pick: 'h' }, browser(), T('2026-11-09T00:00:00Z'))).toMatchObject({
      ok: false,
      reason: 'closed',
    })
    expect(await castVote(payload, { slug, matchup: 9, pick: 'h' }, browser(), during)).toMatchObject({ ok: false, reason: 'closed' })
    expect(await castVote(payload, { slug, matchup: 0, pick: 'h' }, browser({ 'user-agent': 'facebookexternalhit/1.1' }), during)).toMatchObject({
      ok: false,
      reason: 'refused',
    })
    expect(await castVote(payload, { slug, matchup: 0, pick: 'h' }, browser({ 'sec-fetch-site': 'cross-site' }), during)).toMatchObject({
      ok: false,
      reason: 'refused',
    })
    expect(await castVote(payload, { slug: 'nope', matchup: 0, pick: 'h' }, browser(), during)).toMatchObject({ ok: false, reason: 'not-found' })
  })

  it('caps one address per game per day', async () => {
    const from = browser({ 'cf-connecting-ip': '203.0.113.7' })
    const results = []
    for (let i = 0; i < 10; i++) results.push(await castVote(payload, { slug, matchup: 1, pick: 'd' }, from, during))
    expect(results.filter((r) => r.ok)).toHaveLength(8)
    expect(results.at(-1)).toMatchObject({ ok: false, reason: 'busy' })
    // Another game is its own count.
    expect(await castVote(payload, { slug, matchup: 2, pick: 'b' }, from, during)).toMatchObject({ ok: true })
  })

  it('takes a staff vote as a test, left out of every count', async () => {
    const before = await talliesFor(payload, rankingId)
    const out = await castVote(payload, { slug, matchup: 3, pick: 'f' }, browser({ cookie: 'fc-self=1' }), during)
    expect(out).toMatchObject({ ok: true })
    expect((await talliesFor(payload, rankingId)).qf?.[3]).toEqual(before.qf?.[3])
  })

  it('lets an admin preview vote on an unpublished draft, as a test, and nobody else', async () => {
    const draftSlug = `${slug}-draft`
    const draft = await payload.create({
      collection: 'rankings',
      data: { slug: draftSlug, city: cityId, title: 'Draft', question: 'Where?', entrants: eight, rounds },
      draft: true,
      overrideAccess: true,
    })
    try {
      expect(await castVote(payload, { slug: draftSlug, matchup: 0, pick: 'a' }, browser(), during)).toMatchObject({ ok: false, reason: 'not-found' })
      expect(await castVote(payload, { slug: draftSlug, matchup: 0, pick: 'a' }, browser(), during, { preview: true })).toMatchObject({ ok: true })
      expect(await talliesFor(payload, draft.id)).toEqual({})
    } finally {
      await payload.delete({ collection: 'ranking-votes', where: { ranking: { equals: draft.id } }, overrideAccess: true })
      await payload.delete({ collection: 'rankings', id: draft.id, overrideAccess: true })
    }
  })
})
