// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import config from '@/payload.config'

import {
  collectGraphTelemetry,
  dueAccountDays,
  graphSummary,
  hourLabel,
  onlineByMiamiHour,
  resetGraphTelemetryState,
} from '@/lib/graphTelemetry'
import { dueMarketBucket, median, scorePosts, type Snapshot } from '@/lib/market'
import { parseBreakdownRows } from '@/lib/metaAccount'
import { graphUsagePct, otherManagedUsernames, resetGraphUsage, type MeAccount } from '@/lib/metaGraph'
import { isMiamiDadeCity, miamiDadeShare, MIAMI_DADE_PLACES } from '@/lib/miamiDade'
import { socialReport } from '@/lib/mcpTools'
import type { User } from '@/payload-types'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/* ------------------------------------------------------------------------ */
/* Pure helpers                                                              */
/* ------------------------------------------------------------------------ */

describe('which account days are due', () => {
  // 7:30 AM in Miami (EDT) on Tue Oct 20.
  const now = new Date('2026-10-20T11:30:00Z')

  it('reads a day six hours after it ends, never before, and catches up three days', () => {
    expect(dueAccountDays(now, new Map()).map((d) => [d.day, d.action])).toEqual([
      ['2026-10-17', 'create'],
      ['2026-10-18', 'create'],
      ['2026-10-19', 'create'],
    ])
    // 5:59 AM Miami: yesterday is not over long enough yet.
    const early = new Date('2026-10-20T09:59:00Z')
    expect(dueAccountDays(early, new Map()).map((d) => d.day)).not.toContain('2026-10-19')
  })

  it('never reads a day twice, except once more after 48 hours', () => {
    const read = new Map([
      ['2026-10-17', 3330],
      ['2026-10-18', 1890],
      ['2026-10-19', 450],
    ])
    // Same hour: nothing. 10-17 was first read after 48h already, so it is settled.
    expect(dueAccountDays(now, read)).toEqual([])
    // A day later: 10-18 is now 55 hours over and its reading was 31 hours in.
    const later = new Date(now.getTime() + DAY)
    expect(dueAccountDays(later, read).map((d) => [d.day, d.action])).toEqual([
      ['2026-10-18', 'settle'],
      ['2026-10-20', 'create'],
    ])
  })
})

describe('Miami-Dade cities', () => {
  it('knows the 34 municipalities and the unincorporated places, in Meta’s "City, State" labels', () => {
    expect(MIAMI_DADE_PLACES).toContain('HIALEAH GARDENS')
    for (const label of [
      'Miami, Florida',
      'Hialeah, Florida',
      'Miami Lakes, Florida',
      'Miami Gardens, Florida',
      'Doral, Florida',
      'Homestead, Florida',
      'Kendall, Florida',
      'Opa-locka, Florida',
      'Opa Locka, Florida',
      'Indian Creek, Florida',
      'The Hammocks, Florida',
      'Westchester, FL',
    ]) {
      expect(isMiamiDadeCity(label), label).toBe(true)
    }
    for (const label of ['Miami, Oklahoma', 'Fort Lauderdale, Florida', 'Hollywood, Florida', 'Miami', 'Kendall Park, New Jersey']) {
      expect(isMiamiDadeCity(label), label).toBe(false)
    }
  })

  it('computes the share over every follower (a floor) and over the listed cities', () => {
    const md = miamiDadeShare(
      { 'Miami, Florida': 100, 'Hialeah, Florida': 60, 'Opa-locka, Florida': 10, 'Fort Lauderdale, Florida': 30, 'Miami, Oklahoma': 5 },
      400,
    )
    expect(md).toEqual({
      followers: 170,
      share: 0.425,
      shareOfListed: 0.8293,
      listed: 205,
      cities: { 'Miami, Florida': 100, 'Hialeah, Florida': 60, 'Opa-locka, Florida': 10 },
    })
    expect(miamiDadeShare({}, 400)).toMatchObject({ followers: 0, share: 0, shareOfListed: null })
    expect(miamiDadeShare({ 'Miami, Florida': 5 }, null).share).toBeNull()
  })
})

describe('breakdown rows', () => {
  it('flattens follow_type and drops the timeframe dimension', () => {
    expect(
      parseBreakdownRows([
        {
          name: 'follows_and_unfollows',
          total_value: {
            value: 7,
            breakdowns: [
              {
                dimension_keys: ['follow_type'],
                results: [
                  { dimension_values: ['FOLLOWER'], value: 5 },
                  { dimension_values: ['NON_FOLLOWER'], value: 2 },
                ],
              },
            ],
          },
        } as never,
        {
          name: 'follower_demographics',
          total_value: {
            breakdowns: [{ dimension_keys: ['timeframe', 'city'], results: [{ dimension_values: ['THIS_MONTH', 'Miami, Florida'], value: 9 }] }],
          },
        } as never,
      ]),
    ).toEqual({
      follows_and_unfollows: 7,
      'follows_and_unfollows.FOLLOWER': 5,
      'follows_and_unfollows.NON_FOLLOWER': 2,
      'follower_demographics.Miami, Florida': 9,
    })
  })
})

describe('followers online', () => {
  it('turns Meta’s hour keys into Miami hours and skips empty days', () => {
    const online = onlineByMiamiHour([
      {
        name: 'online_followers',
        values: [
          { value: { '16': 50, '17': 40, '3': 5 }, end_time: '2026-10-19T07:00:00+0000' },
          { value: { '16': 30 }, end_time: '2026-10-20T07:00:00+0000' },
          { value: {}, end_time: '2026-10-21T07:00:00+0000' },
        ],
      } as never,
    ])
    // Key 16 of the day ending 07:00 UTC is 23:00 UTC, 7 PM in Miami.
    expect(online).toEqual({ byHour: { '6': 5, '19': 40, '20': 40 }, days: 2, best: [19, 20, 6] })
    expect(online.best.map(hourLabel)).toEqual(['7 PM', '8 PM', '6 AM'])
    expect(hourLabel(0)).toBe('12 AM')
    expect(hourLabel(12)).toBe('12 PM')
  })
})

describe('market buckets and the outlier score', () => {
  it('takes 24h between 24 and 72 hours and 7d between 7 and 9 days, once each', () => {
    expect(dueMarketBucket(23.9, new Set())).toBeNull()
    expect(dueMarketBucket(24, new Set())).toBe('24h')
    expect(dueMarketBucket(71, new Set(['24h']))).toBeNull()
    expect(dueMarketBucket(100, new Set())).toBeNull()
    expect(dueMarketBucket(170, new Set(['first', '24h']))).toBe('7d')
    expect(dueMarketBucket(216, new Set())).toBeNull()
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 10])).toBe(2.5)
  })

  const snap = (bucket: Snapshot['bucket'], likes: number | null, comments = 0, views: number | null = null, followers = 2000): Snapshot => ({
    bucket,
    at: '2026-10-20T00:00:00Z',
    ageHours: bucket === '7d' ? 170 : bucket === '24h' ? 30 : 5,
    likes,
    comments,
    views,
    followers,
  })
  const post = (id: string, day: number, snapshots: Snapshot[]) => ({ id, postedAt: `2026-10-${String(day).padStart(2, '0')}T12:00:00Z`, snapshots })

  it('compares a post with its own account at the same age, on the same basis', () => {
    const scores = scorePosts([
      post('a', 1, [snap('first', 1), snap('24h', 10)]),
      post('b', 2, [snap('24h', 10)]),
      post('c', 3, [snap('24h', 8, 2)]),
      post('d', 4, [snap('24h', 10)]),
      post('hit', 5, [snap('first', 900), snap('24h', 40)]),
      // A reel: views, compared only with other reels' views — none here.
      post('reel', 6, [snap('24h', 5, 0, 1000)]),
      // Hidden likes: no likes + comments to compare.
      post('hidden', 7, [snap('24h', null, 3)]),
    ])
    expect(scores.get('hit')).toEqual({ outlierScore: 4, outlierBucket: '24h', outlierBasis: 'interactions', engagementPerFollower: 0.02 })
    expect(scores.get('a')?.outlierScore).toBe(1)
    expect(scores.get('reel')).toMatchObject({ outlierScore: null, outlierBasis: null })
    expect(scores.get('hidden')).toMatchObject({ outlierScore: null, engagementPerFollower: null })
  })

  it('prefers 7d once three peers have it, never uses the first-seen reading, and wants three peers', () => {
    const at7d = scorePosts([
      post('a', 1, [snap('24h', 10), snap('7d', 20)]),
      post('b', 2, [snap('24h', 10), snap('7d', 20)]),
      post('c', 3, [snap('24h', 10), snap('7d', 20)]),
      post('x', 4, [snap('24h', 10), snap('7d', 60)]),
    ])
    expect(at7d.get('x')).toMatchObject({ outlierScore: 3, outlierBucket: '7d' })
    const firstOnly = scorePosts([post('a', 1, [snap('first', 10)]), post('b', 2, [snap('first', 10)]), post('c', 3, [snap('first', 10)]), post('d', 4, [snap('first', 99)])])
    expect(firstOnly.get('d')?.outlierScore).toBeNull()
    const two = scorePosts([post('a', 1, [snap('24h', 10)]), post('b', 2, [snap('24h', 10)]), post('c', 3, [snap('24h', 30)])])
    expect(two.get('c')?.outlierScore).toBeNull()
  })

  it('reels are scored on views against other reels', () => {
    const s = scorePosts([
      post('r1', 1, [snap('24h', 1, 0, 100)]),
      post('r2', 2, [snap('24h', 1, 0, 200)]),
      post('r3', 3, [snap('24h', 1, 0, 300)]),
      post('r4', 4, [snap('24h', 1, 0, 1000)]),
    ])
    expect(s.get('r4')).toMatchObject({ outlierScore: 5, outlierBasis: 'views' })
  })
})

describe('the managed-account refusal list', () => {
  it('names every Instagram account the token reaches except ours', () => {
    const pages: MeAccount[] = [
      { id: 'p1', name: 'Club de la Amistad', instagram_business_account: { id: 'ig1', username: 'ClubDeLaAmistad' } },
      { id: 'p2', name: 'Flamingo County', instagram_business_account: { id: 'ig2', username: 'flamingo.county' } },
      { id: 'p3', name: 'No Instagram' },
    ]
    expect(otherManagedUsernames(pages)).toEqual(['clubdelaamistad'])
  })
})

describe('without META_GRAPH_TOKEN', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does nothing at all: no network, no database', async () => {
    delete process.env.META_GRAPH_TOKEN
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const payload = new Proxy({} as Payload, {
      get: () => {
        throw new Error('the database must not be touched')
      },
    })
    expect(await collectGraphTelemetry(payload)).toEqual({ accountDays: 0, audience: 0, comments: 0, marketAccounts: 0, marketPosts: 0 })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

/* ------------------------------------------------------------------------ */
/* Against the database, with a fake Graph                                   */
/* ------------------------------------------------------------------------ */

const TOKEN = 'TEST-SYSTEM-USER-TOKEN-graph-2-0123456789'
const PAGE_TOKEN = 'TEST-PAGE-TOKEN-graph-2-9876543210'
const NOW = new Date('2026-10-20T11:30:00Z') // 7:30 AM Miami

type Call = { url: URL; auth: string | null }
type Opts = { comments?: 'noscope' | 'ok'; usageHigh?: boolean }

function fakeGraph(opts: Opts = {}) {
  const calls: Call[] = []
  const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR).toISOString()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      calls.push({ url, auth: new Headers(init?.headers).get('authorization') })
      const path = url.pathname.replace(/^\/v\d+\.\d+/, '')
      const p = url.searchParams
      const error = (code: number, message: string, subcode?: number) =>
        Response.json({ error: { code, message, error_subcode: subcode } }, { status: 400 })

      if (path === '/me/accounts') {
        return Response.json({
          data: [
            { id: 'page-club', name: 'Club de la Amistad', access_token: 'club-token', instagram_business_account: { id: 'ig-club', username: 'clubdelaamistad' } },
            { id: 'page-fc', name: 'Flamingo County', access_token: PAGE_TOKEN, instagram_business_account: { id: 'ig-fc', username: 'flamingo.county' } },
          ],
        })
      }
      if (path.includes('club')) return error(10, 'not this account')

      if (path === '/ig-fc') {
        const fields = p.get('fields') ?? ''
        const bd = fields.match(/^business_discovery\.username\(([^)]+)\)/)
        if (!bd) return Response.json({ id: 'ig-fc', followers_count: 400, follows_count: 50, media_count: 30 })
        const user = bd[1]
        const headers = opts.usageHigh
          ? { 'x-business-use-case-usage': JSON.stringify({ 'ig-fc': [{ type: 'instagram', call_count: 80, total_cputime: 5, total_time: 5 }] }) }
          : undefined
        if (user === 'hqtest.personal') return error(110, 'Invalid user id', 2207013)
        // An account that answers, but whose media fields Graph refuses: our query's fault, not theirs.
        if (user === 'hqtest.badfield') {
          if (fields.includes('media')) return error(100, '(#100) Tried accessing nonexisting field (media_product_type)')
          return Response.json({ id: 'ig-fc', business_discovery: { id: 'id-badfield', username: user, followers_count: 10 } })
        }
        const media =
          user === 'hqtest.peer'
            ? [
                ...[10, 10, 8, 10, 40].map((likes, i) => ({
                  id: `bd-peer-${i}`,
                  caption: `HQTEST peer post ${i}`,
                  timestamp: ago(30 + i),
                  media_type: 'IMAGE',
                  media_product_type: 'FEED',
                  permalink: `https://www.instagram.com/p/peer${i}/`,
                  like_count: likes,
                  comments_count: i === 2 ? 2 : 0,
                })),
                { id: 'bd-peer-reel', caption: 'HQTEST reel', timestamp: ago(40), media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/peer/', like_count: 3, comments_count: 1, view_count: 5000 },
                { id: 'bd-peer-old', caption: 'HQTEST old', timestamp: ago(100), media_type: 'IMAGE', media_product_type: 'FEED', permalink: 'https://www.instagram.com/p/old/', comments_count: 4 },
              ]
            : [{ id: `bd-${user}-0`, caption: 'HQTEST', timestamp: ago(5), media_type: 'IMAGE', media_product_type: 'FEED', like_count: 1, comments_count: 0 }]
        return Response.json(
          { id: 'ig-fc', business_discovery: { id: `id-${user}`, username: user, followers_count: 2000, media_count: 300, media: { data: media } } },
          { headers },
        )
      }

      if (path === '/ig-fc/insights') {
        const metric = p.get('metric') ?? ''
        const breakdown = p.get('breakdown')
        const total = (name: string, value: number) => ({ name, period: p.get('period'), total_value: { value } })
        const broken = (name: string, keys: string[], results: [string[], number][]) => ({
          name,
          period: p.get('period'),
          total_value: { breakdowns: [{ dimension_keys: keys, results: results.map(([dimension_values, value]) => ({ dimension_values, value })) }] },
        })
        if (metric === 'follows_and_unfollows' && breakdown === 'follow_type') {
          return Response.json({ data: [{ ...broken(metric, ['follow_type'], [[['FOLLOWER'], 5], [['NON_FOLLOWER'], 2]]), total_value: { value: 7, breakdowns: broken(metric, ['follow_type'], [[['FOLLOWER'], 5], [['NON_FOLLOWER'], 2]]).total_value.breakdowns } }] })
        }
        if (metric === 'profile_links_taps') return error(100, '(#100) metric profile_links_taps is not available')
        if (metric === 'follower_demographics') {
          if (p.get('timeframe') !== 'this_month') return error(100, '(#100) timeframe not supported')
          const tf = 'THIS_MONTH'
          const by: Record<string, [string[], number][]> = {
            city: [
              [[tf, 'Miami, Florida'], 100],
              [[tf, 'Hialeah, Florida'], 60],
              [[tf, 'Opa-locka, Florida'], 10],
              [[tf, 'Fort Lauderdale, Florida'], 30],
              [[tf, 'Miami, Oklahoma'], 5],
            ],
            country: [[[tf, 'US'], 350], [[tf, 'CU'], 20]],
            age: [[[tf, '25-34'], 150], [[tf, '35-44'], 120]],
            gender: [[[tf, 'F'], 210], [[tf, 'M'], 180]],
          }
          return Response.json({ data: [broken(metric, ['timeframe', breakdown!], by[breakdown!])] })
        }
        if (metric === 'engaged_audience_demographics') return error(100, '(#100) not enough engagement')
        if (metric === 'online_followers') {
          return Response.json({
            data: [
              {
                name: 'online_followers',
                period: 'lifetime',
                values: [
                  { value: { '16': 50, '17': 40, '3': 5 }, end_time: '2026-10-19T07:00:00+0000' },
                  { value: {}, end_time: '2026-10-20T07:00:00+0000' },
                ],
              },
            ],
          })
        }
        // The plain daily batch. `reposts` is refused, like a metric Meta took away.
        const names = metric.split(',')
        if (names.includes('reposts')) return error(100, '(#100) metric[9] must be one of the following values')
        const values: Record<string, number> = { reach: 900, views: 2500, accounts_engaged: 80, total_interactions: 120 }
        return Response.json({ data: names.map((n) => total(n, values[n] ?? 1)) })
      }

      if (path === '/page-fc/insights') {
        // Like Graph: one value per Page day (ending 07:00 UTC) inside since–until.
        // page_follows is 300 + the day of the month the Page day ends on, so the test can see which was kept.
        const since = Number(p.get('since')) * 1000
        const until = Number(p.get('until')) * 1000
        const ends: Date[] = []
        for (let t = Date.UTC(2026, 9, 1, 7); t <= until; t += DAY) if (t >= since) ends.push(new Date(t))
        const values = (name: string, end: Date): number =>
          ({ page_follows: 300 + end.getUTCDate(), page_daily_follows_unique: 3, page_daily_unfollows_unique: 1, page_media_view: 700 })[name] ?? 2
        return Response.json({
          data: (p.get('metric') ?? '').split(',').map((name) => ({
            name,
            period: 'day',
            values: ends.map((end) => ({ value: values(name, end), end_time: end.toISOString().replace('.000Z', '+0000') })),
          })),
        })
      }

      if (path === '/ig-fc/media') {
        return Response.json({
          data: [{ id: 'ig-hqtest-reel', caption: 'HQTEST our reel', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/ours/', timestamp: ago(48) }],
        })
      }
      if (path === '/ig-hqtest-reel/comments') {
        if (opts.comments !== 'ok') return error(10, '(#10) Application does not have permission for this action')
        return Response.json({
          data: [
            { id: 'hqtest-c1', text: 'Cuenten la historia del Hialeah Park', timestamp: ago(20), username: 'some.person', like_count: 2 },
            { id: 'hqtest-c2', text: '¡Gracias!', timestamp: ago(19), username: 'flamingo.county', like_count: 0 },
          ],
        })
      }
      return error(803, `unexpected ${path}`)
    }),
  )
  return calls
}

describe('account telemetry against the database', () => {
  let payload: Payload
  let user: User
  let mcpReq: PayloadRequest
  const errors = vi.spyOn(console, 'error')

  const cleanup = async () => {
    await payload.delete({ collection: 'hq-social-stats', where: { kind: { in: ['account', 'audience'] } }, overrideAccess: true })
    await payload.delete({ collection: 'hq-social-comments', where: { commentId: { like: 'hqtest-' } }, overrideAccess: true })
    await payload.delete({ collection: 'hq-market-posts', where: { username: { like: 'hqtest' } }, overrideAccess: true })
    await payload.delete({ collection: 'hq-market-accounts', where: { username: { exists: true } }, overrideAccess: true })
    await payload.delete({ collection: 'hq-events', where: { type: { equals: 'graph.scope_missing' } }, overrideAccess: true })
  }
  const statRows = async (kind: string) =>
    (
      await payload.find({
        collection: 'hq-social-stats',
        where: { kind: { equals: kind } },
        sort: 'day',
        limit: 50,
        depth: 0,
        overrideAccess: true,
      })
    ).docs
  const watch = (username: string, extra: Record<string, unknown> = {}) =>
    payload.create({ collection: 'hq-market-accounts', data: { username, category: 'peer', ...extra }, overrideAccess: true })

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    delete process.env.TELEGRAM_BOT_TOKEN
    await cleanup()
    user = await payload.create({
      collection: 'users',
      data: { email: `graph-2-test-${Date.now()}@example.com`, password: 'not-a-real-password-1' },
      overrideAccess: true,
    })
    mcpReq = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    mcpReq.payloadAPI = 'MCP'
    errors.mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.META_GRAPH_TOKEN
    resetGraphUsage()
  })

  afterAll(async () => {
    errors.mockRestore()
    if (!payload) return
    await cleanup()
    if (user) await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
  })

  it('takes the watchlist over MCP, but not its status, and refuses a username that could rewrite a query', async () => {
    const doc = await payload.create({
      collection: 'hq-market-accounts',
      data: { username: '@HQTest.Peer', category: 'peer', status: 'ok', followersCount: 9 } as never,
      req: mcpReq,
      overrideAccess: false,
    })
    expect(doc).toMatchObject({ username: 'hqtest.peer', status: 'pending', active: true })
    expect(doc.followersCount ?? null).toBeNull()
    await expect(
      payload.create({ collection: 'hq-market-accounts', data: { username: 'x){id}' }, req: mcpReq, overrideAccess: false }),
    ).rejects.toThrow()
  })

  it('reads each Miami day once, the audience weekly, and the market — and nothing of Club de la Amistad', async () => {
    process.env.META_GRAPH_TOKEN = TOKEN
    await watch('hqtest.personal')
    await watch('hqtest.badfield')
    await watch('clubdelaamistad')
    await watch('flamingo.county')
    const calls = fakeGraph({ comments: 'noscope' })

    const first = await collectGraphTelemetry(payload, NOW, { pauseMs: 0 })
    expect(first).toMatchObject({ accountDays: 6, audience: 1, comments: 0, marketAccounts: 3 })

    // Account days: three days back for each platform, yesterday with the follower total.
    const days = await statRows('account')
    expect(days.map((r) => [r.platform, r.day]).sort()).toEqual([
      ['facebook', '2026-10-17'],
      ['facebook', '2026-10-18'],
      ['facebook', '2026-10-19'],
      ['instagram', '2026-10-17'],
      ['instagram', '2026-10-18'],
      ['instagram', '2026-10-19'],
    ])
    const ig19 = days.find((r) => r.platform === 'instagram' && r.day === '2026-10-19')!
    expect(ig19).toMatchObject({ source: 'graph', ageMinutes: 450 })
    expect(ig19.metrics).toMatchObject({
      reach: 900,
      views: 2500,
      accounts_engaged: 80,
      'follows_and_unfollows.FOLLOWER': 5,
      'follows_and_unfollows.NON_FOLLOWER': 2,
      followers_count: 400,
    })
    expect(ig19.failedMetrics).toEqual(expect.arrayContaining(['reposts', 'profile_links_taps']))
    const ig18 = days.find((r) => r.platform === 'instagram' && r.day === '2026-10-18')!
    expect((ig18.metrics as Record<string, number>).followers_count).toBeUndefined()
    // Facebook: Miami day 10-19 is the Page day that ends 07:00 UTC on 10-20 (21 of its hours
    // are 10-19's), not the one ending on 10-19 — read with the Page token.
    expect(days.find((r) => r.platform === 'facebook' && r.day === '2026-10-19')!.metrics).toMatchObject({ page_follows: 320, page_daily_follows_unique: 3 })
    expect(days.find((r) => r.platform === 'facebook' && r.day === '2026-10-17')!.metrics).toMatchObject({ page_follows: 318 })
    expect(calls.find((c) => c.url.pathname.endsWith('/page-fc/insights'))?.auth).toBe(`Bearer ${PAGE_TOKEN}`)

    // Audience: Miami-Dade share over every follower, demographics, best hours.
    const [aud] = await statRows('audience')
    expect(aud.metrics).toMatchObject({ followers_count: 400, miami_dade_followers: 170, miami_dade_share: 0.425, miami_dade_share_of_listed: 0.8293, best_hour_miami: 19 })
    expect(aud.audience).toMatchObject({
      follower_demographics: { timeframe: 'this_month', country: { US: 350, CU: 20 }, gender: { F: 210, M: 180 } },
      engaged_audience_demographics: { timeframe: null },
      online: { best: [19, 20, 6], bestLabels: ['7 PM', '8 PM', '6 AM'] },
    })
    expect(aud.failedMetrics).toEqual(expect.arrayContaining(['engaged_audience_demographics.city']))

    // Comments: no scope, so one note and nothing stored.
    const notes = await payload.find({ collection: 'hq-events', where: { type: { equals: 'graph.scope_missing' } }, overrideAccess: true })
    expect(notes.docs).toHaveLength(1)
    expect(notes.docs[0]).toMatchObject({ refId: 'comments' })
    expect(notes.docs[0].summary).toContain('instagram_manage_comments')

    // Market: a personal account is marked, ours and Club's are refused without a call.
    const accounts = (await payload.find({ collection: 'hq-market-accounts', limit: 20, overrideAccess: true })).docs
    const by = (u: string) => accounts.find((a) => a.username === u)!
    expect(by('hqtest.peer')).toMatchObject({ status: 'ok', followersCount: 2000, mediaCount: 300 })
    expect(by('hqtest.personal')).toMatchObject({ status: 'not_professional' })
    expect(by('hqtest.personal').statusDetail).toContain('110/2207013')
    // A refused media field is an error on our side (retried daily), never "not a business account".
    expect(by('hqtest.badfield')).toMatchObject({ status: 'error' })
    expect(by('hqtest.badfield').statusDetail).toContain('bd_field_refused')
    expect(by('clubdelaamistad')).toMatchObject({ status: 'refused' })
    expect(by('flamingo.county')).toMatchObject({ status: 'refused' })

    // Never Club de la Amistad, never a picture, never the token in a URL.
    for (const c of calls) {
      expect(c.url.toString()).not.toContain('club')
      expect(c.url.searchParams.get('fields') ?? '').not.toMatch(/media_url|thumbnail_url/)
      expect(c.url.toString()).not.toContain(TOKEN)
      expect(c.url.toString()).not.toContain(PAGE_TOKEN)
      expect(c.url.searchParams.has('access_token')).toBe(false)
    }

    // The same hour again: no new day rows, no audience, no day insights asked for.
    const again = fakeGraph({ comments: 'noscope' })
    const second = await collectGraphTelemetry(payload, NOW, { pauseMs: 0 })
    expect(second).toMatchObject({ accountDays: 0, audience: 0, marketAccounts: 0 })
    expect(await statRows('account')).toHaveLength(6)
    expect(await statRows('audience')).toHaveLength(1)
    expect(again.filter((c) => c.url.searchParams.get('period') === 'day')).toHaveLength(0)
    // In-process, the refused comments are not even asked for again.
    expect(again.some((c) => c.url.pathname.endsWith('/comments'))).toBe(false)
  })

  it('outlier scores at equal ages, and no images or videos kept', async () => {
    const posts = (await payload.find({ collection: 'hq-market-posts', where: { username: { equals: 'hqtest.peer' } }, limit: 20, overrideAccess: true })).docs
    const m = (id: string) => posts.find((p) => p.mediaId === id)!
    // 40 likes against four peers' 10, 10, 10 and 8 + 2 comments, all read at 30–34 hours.
    expect(m('bd-peer-4')).toMatchObject({ outlierScore: 4, outlierBucket: '24h', outlierBasis: 'interactions', engagementPerFollower: 0.02 })
    expect(m('bd-peer-0').outlierScore).toBe(1)
    // The reel has views and no other reel to compare with; the 100-hour post has only a first reading.
    expect(m('bd-peer-reel')).toMatchObject({ views: 5000, outlierScore: null })
    expect((m('bd-peer-old').snapshots as Snapshot[]).map((s) => s.bucket)).toEqual(['first'])
    expect(m('bd-peer-old').likes).toBeNull()
    expect((m('bd-peer-4').snapshots as Snapshot[]).map((s) => s.bucket)).toEqual(['first', '24h'])
    expect(JSON.stringify(posts)).not.toMatch(/media_url|thumbnail_url|cdninstagram/)
  })

  it('settles a day once after 48 hours and says a missing scope only once, even after a restart', async () => {
    process.env.META_GRAPH_TOKEN = TOKEN
    resetGraphTelemetryState() // as a restart would
    const later = new Date(NOW.getTime() + DAY)
    fakeGraph({ comments: 'noscope' })
    const run = await collectGraphTelemetry(payload, later, { pauseMs: 0 })
    // 10-20 is new; 10-18 is 55 hours over and was read at 31: read again.
    expect(run.accountDays).toBe(4)
    const days = await statRows('account')
    expect(days.filter((r) => r.platform === 'instagram').map((r) => [r.day, r.ageMinutes])).toEqual([
      ['2026-10-17', 3330],
      ['2026-10-18', 3330],
      ['2026-10-19', 450],
      ['2026-10-20', 450],
    ])
    const notes = await payload.count({ collection: 'hq-events', where: { type: { equals: 'graph.scope_missing' } }, overrideAccess: true })
    expect(notes.totalDocs).toBe(1)
  })

  it('stores comments without usernames once the scope is there', async () => {
    process.env.META_GRAPH_TOKEN = TOKEN
    resetGraphTelemetryState()
    fakeGraph({ comments: 'ok' })
    const run = await collectGraphTelemetry(payload, new Date(NOW.getTime() + DAY), { pauseMs: 0 })
    expect(run.comments).toBe(2)
    const rows = (await payload.find({ collection: 'hq-social-comments', where: { commentId: { like: 'hqtest-' } }, sort: 'commentedAt', overrideAccess: true })).docs
    expect(rows.map((r) => [r.commentId, r.mediaId, r.fromUs, r.likeCount])).toEqual([
      ['hqtest-c1', 'ig-hqtest-reel', false, 2],
      ['hqtest-c2', 'ig-hqtest-reel', true, 0],
    ])
    expect(JSON.stringify(rows)).not.toContain('some.person')
    // Read again: nothing new.
    fakeGraph({ comments: 'ok' })
    expect((await collectGraphTelemetry(payload, new Date(NOW.getTime() + DAY), { pauseMs: 0 })).comments).toBe(0)
  })

  it('backs off when Graph says the budget is nearly spent', async () => {
    process.env.META_GRAPH_TOKEN = TOKEN
    await watch('hqtest.peer3')
    await watch('hqtest.peer4')
    fakeGraph({ usageHigh: true })
    const run = await collectGraphTelemetry(payload, new Date(NOW.getTime() + DAY), { pauseMs: 0 })
    expect(run.marketAccounts).toBe(1)
    expect(graphUsagePct()).toBe(80)
    const unread = await payload.count({
      collection: 'hq-market-accounts',
      where: { and: [{ username: { in: ['hqtest.peer3', 'hqtest.peer4'] } }, { status: { equals: 'pending' } }] },
      overrideAccess: true,
    })
    expect(unread.totalDocs).toBe(1)

    // An hour later the old reading no longer blocks: the one left is read.
    fakeGraph()
    const next = await collectGraphTelemetry(payload, new Date(NOW.getTime() + DAY + HOUR), { pauseMs: 0 })
    expect(next.marketAccounts).toBe(1)
    const stillUnread = await payload.count({
      collection: 'hq-market-accounts',
      where: { and: [{ username: { in: ['hqtest.peer3', 'hqtest.peer4'] } }, { status: { equals: 'pending' } }] },
      overrideAccess: true,
    })
    expect(stillUnread.totalDocs).toBe(0)
  })

  it('shows follows per week, the Miami-Dade share and best hours in hqSocialReport', async () => {
    const later = new Date(NOW.getTime() + DAY)
    const summary = await graphSummary(payload, later)
    expect(summary.instagram).toMatchObject({ daysCounted: 4, followsLast7d: 20, unfollowsLast7d: 8, followersNow: 400 })
    expect(summary.facebook).toMatchObject({ daysCounted: 4, followsLast7d: 12, followersNow: 321 })
    expect(summary.audience).toMatchObject({ miamiDadeShare: 0.425, miamiDadeFollowers: 170, bestHoursMiami: ['7 PM', '8 PM', '6 AM'] })
    expect(summary.audience?.topCities[0]).toEqual({ city: 'Miami, Florida', followers: 100 })
    const report = await socialReport(payload, 7, later)
    expect(report.graph.instagram.followsLast7d).toBe(20)
  })
})
