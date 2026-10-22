// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { buildBrief } from '@/lib/brief'
import {
  GraphError,
  IG_REEL_METRICS,
  parseInsightRows,
  pickFlamingoAccount,
  readInsights,
  type InsightRow,
  type MeAccount,
} from '@/lib/metaGraph'
import { collectReelStats, dueReelCheckpoint, matchDraft, reelRatios } from '@/lib/reelStats'
import { socialReport } from '@/lib/mcpTools'
import type { HqSocialDraft } from '@/payload-types'
import { makeHqMedia, withFbLink } from './helpers/facebook'

const MIN = 60_000
const HOUR = 60 * MIN

/* ------------------------------------------------------------------------ */
/* Pure helpers                                                              */
/* ------------------------------------------------------------------------ */

describe('reel checkpoints', () => {
  const live = new Date('2026-10-20T16:00:00Z')
  const at = (minutes: number) => new Date(live.getTime() + minutes * MIN)
  const none = new Set<string>()

  it('takes 1h only between 60 and 120 minutes, and 3h only between 3 and 5 hours', () => {
    expect(dueReelCheckpoint(live, at(59), none)).toBeNull()
    expect(dueReelCheckpoint(live, at(60), none)).toBe('1h')
    expect(dueReelCheckpoint(live, at(119), none)).toBe('1h')
    expect(dueReelCheckpoint(live, at(120), none)).toBeNull()
    expect(dueReelCheckpoint(live, at(179), none)).toBeNull()
    expect(dueReelCheckpoint(live, at(180), none)).toBe('3h')
    expect(dueReelCheckpoint(live, at(299), none)).toBe('3h')
    expect(dueReelCheckpoint(live, at(300), none)).toBeNull()
  })

  it('never labels a 40-hour reading "1h" or "3h": that is the 24h window', () => {
    expect(dueReelCheckpoint(live, at(40 * 60), none)).toBe('24h')
    expect(dueReelCheckpoint(live, at(40 * 60), new Set(['24h']))).toBeNull()
  })

  it('keeps 48 hours of retries for 24h, 3d and 7d, without overlaps', () => {
    expect(dueReelCheckpoint(live, at(71 * 60), none)).toBe('24h')
    expect(dueReelCheckpoint(live, at(72 * 60), none)).toBe('3d')
    expect(dueReelCheckpoint(live, at(170 * 60), none)).toBe('7d')
    expect(dueReelCheckpoint(live, at(216 * 60), none)).toBeNull()
  })

  it('skips a checkpoint already taken', () => {
    expect(dueReelCheckpoint(live, at(65), new Set(['1h']))).toBeNull()
  })
})

describe('the account filter', () => {
  const club: MeAccount = {
    id: 'page-club',
    name: 'Club de la Amistad',
    access_token: 'club-page-token',
    instagram_business_account: { id: 'ig-club', username: 'clubdelaamistad' },
  }
  const decoy: MeAccount = {
    id: 'page-decoy',
    name: 'Flamingo County Fans',
    instagram_business_account: { id: 'ig-decoy', username: 'flamingocounty' },
  }
  const ours: MeAccount = {
    id: 'page-fc',
    name: 'Flamingo County',
    access_token: 'fc-page-token',
    instagram_business_account: { id: 'ig-fc', username: 'flamingo.county' },
  }

  it('picks Flamingo County with @flamingo.county, and nothing else', () => {
    expect(pickFlamingoAccount([club, decoy, ours])).toEqual({
      pageId: 'page-fc',
      pageName: 'Flamingo County',
      pageToken: 'fc-page-token',
      igUserId: 'ig-fc',
      igUsername: 'flamingo.county',
    })
  })

  it('refuses Club de la Amistad, the dotless handle, a Page without Instagram, and a tie', () => {
    expect(pickFlamingoAccount([club])).toBeNull()
    expect(pickFlamingoAccount([decoy])).toBeNull()
    expect(pickFlamingoAccount([{ id: 'p', name: 'Flamingo County' }])).toBeNull()
    // @flamingo.county on a Page that is not Flamingo County: refused, not trusted.
    expect(pickFlamingoAccount([{ ...club, instagram_business_account: ours.instagram_business_account }])).toBeNull()
    expect(pickFlamingoAccount([ours, { ...ours, id: 'page-fc-2' }])).toBeNull()
    expect(pickFlamingoAccount([])).toBeNull()
  })

  it('reads the Page name loosely and the Instagram username exactly', () => {
    expect(pickFlamingoAccount([{ ...ours, name: 'FlamingoCounty' }])?.pageId).toBe('page-fc')
    expect(pickFlamingoAccount([{ ...ours, name: 'Flamingo County · Miami' }])?.pageId).toBe('page-fc')
    expect(
      pickFlamingoAccount([{ ...ours, instagram_business_account: { id: 'ig-x', username: 'flamingo.county.mia' } }]),
    ).toBeNull()
  })
})

describe('insight readings', () => {
  const rows = (metrics: string[]): InsightRow[] => metrics.map((name, i) => ({ name, values: [{ value: i + 1 }] }))

  it('reads values, total_value, flattened objects and the retention curve', () => {
    expect(
      parseInsightRows([
        { name: 'views', values: [{ value: 120 }] },
        { name: 'reach', total_value: { value: 90 } },
        { name: 'post_video_social_actions', values: [{ value: { share: 3, comment: 2 } }] },
        { name: 'post_video_retention_graph', values: [{ value: { '0': 1, '1': 0.8 } }] },
      ]),
    ).toEqual({
      metrics: { views: 120, reach: 90, 'post_video_social_actions.share': 3, 'post_video_social_actions.comment': 2 },
      retention: { '0': 1, '1': 0.8 },
    })
  })

  it('drops a metric Graph refuses, names it, and does not ask for it again this run', async () => {
    const asked: string[][] = []
    const fetchRows = async (metrics: string[]) => {
      asked.push(metrics)
      if (metrics.includes('reels_skip_rate')) throw new GraphError('(#100) metric[9] must be one of …', 400, 100)
      return rows(metrics)
    }
    const rejected = new Set<string>()
    const first = await readInsights(fetchRows, IG_REEL_METRICS, rejected)
    expect(first?.failed).toEqual(['reels_skip_rate'])
    expect(Object.keys(first!.metrics)).toHaveLength(IG_REEL_METRICS.length - 1)
    expect(first!.metrics.reels_skip_rate).toBeUndefined()
    expect(rejected).toEqual(new Set(['reels_skip_rate']))
    // One batch, then each metric alone.
    expect(asked).toHaveLength(1 + IG_REEL_METRICS.length)

    asked.length = 0
    const second = await readInsights(fetchRows, IG_REEL_METRICS, rejected)
    expect(asked).toEqual([IG_REEL_METRICS.filter((m) => m !== 'reels_skip_rate')])
    expect(second?.failed).toEqual(['reels_skip_rate'])
  })

  it('does not blind the run when a reel refuses every metric', async () => {
    const rejected = new Set<string>()
    const refuseAll = async () => {
      throw new GraphError('(#100) media posted before business conversion', 400, 100)
    }
    await expect(readInsights(refuseAll, IG_REEL_METRICS, rejected)).rejects.toThrow(GraphError)
    expect(rejected.size).toBe(0)
  })

  it('passes other errors through, and treats no rows as not ready (but zero as a reading)', async () => {
    const down = async () => {
      throw new GraphError('rate limited', 400, 4)
    }
    await expect(readInsights(down, IG_REEL_METRICS, new Set())).rejects.toThrow('rate limited')
    expect(await readInsights(async () => [], IG_REEL_METRICS, new Set())).toBeNull()
    const zero = await readInsights(async () => [{ name: 'views', values: [{ value: 0 }] }], ['views'], new Set())
    expect(zero?.metrics).toEqual({ views: 0 })
  })
})

describe('reel ratios', () => {
  it('computes watch % of length only when the length is known, and shares per reach', () => {
    expect(reelRatios('instagram', { ig_reels_avg_watch_time: 6000, shares: 4, reach: 200 }, 30)).toEqual({
      avgWatchPctOfLength: 20,
      sharesPerReach: 0.02,
    })
    expect(reelRatios('instagram', { ig_reels_avg_watch_time: 6000, shares: 4, reach: 200 }, null).avgWatchPctOfLength).toBeNull()
    expect(
      reelRatios('facebook', { post_video_avg_time_watched: 4500, 'post_video_social_actions.share': 1, post_impressions_unique: 50 }, 15),
    ).toEqual({ avgWatchPctOfLength: 30, sharesPerReach: 0.02 })
    // what Meta actually sends since Oct 2026: SHARE in capitals, reach under its new name
    expect(
      reelRatios('facebook', { 'post_video_social_actions.SHARE': 3, post_total_media_view_unique: 100 }, null).sharesPerReach,
    ).toBe(0.03)
    expect(reelRatios('instagram', { shares: 1, reach: 0 }, 10).sharesPerReach).toBeNull()
  })
})

describe('draft matching', () => {
  const at = new Date('2026-10-20T20:00:00Z')
  const d = (id: number, minutes: number, platforms: string[]) =>
    ({ id, publishAt: new Date(at.getTime() + minutes * MIN).toISOString(), platforms }) as Pick<
      HqSocialDraft,
      'id' | 'platforms' | 'publishAt'
    >

  it('matches the one draft within ten minutes on that platform, and refuses to guess', () => {
    expect(matchDraft([d(1, 2, ['instagram']), d(2, 60, ['instagram'])], at, 'instagram')).toBe(1)
    expect(matchDraft([d(1, 2, ['facebook'])], at, 'instagram')).toBeNull()
    expect(matchDraft([d(1, 15, ['instagram'])], at, 'instagram')).toBeNull()
    expect(matchDraft([d(1, -3, ['instagram']), d(2, 4, ['instagram'])], at, 'instagram')).toBeNull()
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
    expect(await collectReelStats(payload)).toEqual({ reels: 0, saved: 0 })
    process.env.META_GRAPH_TOKEN = '   '
    expect(await collectReelStats(payload)).toEqual({ reels: 0, saved: 0 })
    expect(fetchSpy).not.toHaveBeenCalled()
    delete process.env.META_GRAPH_TOKEN
  })
})

/* ------------------------------------------------------------------------ */
/* Against the database, with a fake Graph                                   */
/* ------------------------------------------------------------------------ */

const TOKEN = 'TEST-SYSTEM-USER-TOKEN-0123456789'
const PAGE_TOKEN = 'TEST-PAGE-TOKEN-9876543210'

type Call = { url: URL; auth: string | null }

function fakeGraph(now: Date, opts: { refuseSkipRate?: boolean; fbDown?: boolean } = {}) {
  const calls: Call[] = []
  const ago = (minutes: number) => new Date(now.getTime() - minutes * MIN).toISOString()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      const auth = new Headers(init?.headers).get('authorization')
      calls.push({ url, auth })
      const path = url.pathname.replace(/^\/v\d+\.\d+/, '')
      const error = (code: number, message: string) => Response.json({ error: { code, message } }, { status: 400 })

      if (path === '/me/accounts') {
        return Response.json({
          data: [
            {
              id: 'page-club',
              name: 'Club de la Amistad',
              access_token: 'club-token',
              instagram_business_account: { id: 'ig-club', username: 'clubdelaamistad' },
            },
            {
              id: 'page-fc',
              name: 'Flamingo County',
              access_token: PAGE_TOKEN,
              instagram_business_account: { id: 'ig-fc', username: 'flamingo.county' },
            },
          ],
          // Graph's own next link carries the token: it must never be followed.
          paging: { next: `https://graph.facebook.com/v26.0/me/accounts?access_token=${TOKEN}` },
        })
      }
      if (path === '/ig-club/media' || path === '/page-club/video_reels') return error(10, 'not this account')
      if (path === '/ig-fc/media') {
        return Response.json({
          data: [
            { id: 'ig-early', caption: 'HQ-TEST early reel', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/early/', timestamp: ago(70) },
            { id: 'ig-photo', caption: 'a photo', media_type: 'IMAGE', media_product_type: 'FEED', permalink: 'https://www.instagram.com/p/photo/', timestamp: ago(90) },
            { id: 'ig-postiz', caption: 'HQ-TEST scheduled in Postiz', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/postiz/', timestamp: ago(40 * 60) },
            { id: 'ig-old', caption: 'old', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/old/', timestamp: ago(12 * 24 * 60) },
          ],
        })
      }
      if (path.endsWith('/insights')) {
        const metrics = (url.searchParams.get('metric') ?? '').split(',')
        if (opts.refuseSkipRate && metrics.includes('reels_skip_rate')) return error(100, '(#100) metric[9] must be one of the following values')
        const values: Record<string, number> = { views: 500, reach: 400, shares: 8, ig_reels_avg_watch_time: 7500, reels_skip_rate: 41.5 }
        return Response.json({ data: metrics.map((name) => ({ name, period: 'lifetime', values: [{ value: values[name] ?? 1 }] })) })
      }
      if (path === '/page-fc/video_reels') {
        if (opts.fbDown) return error(2, 'temporarily unavailable')
        return Response.json({
          data: [{ id: 'fb-early', description: 'HQ-TEST early reel', created_time: ago(68), permalink_url: '/reel/fb-early', length: 30 }],
        })
      }
      if (path === '/fb-early/video_insights') {
        return Response.json({
          data: [
            { name: 'post_impressions_unique', period: 'lifetime', values: [{ value: 100 }] },
            { name: 'post_video_avg_time_watched', period: 'lifetime', values: [{ value: 9000 }] },
            { name: 'post_video_social_actions', period: 'lifetime', values: [{ value: { share: 2, comment: 1 } }] },
            { name: 'post_video_retention_graph', period: 'lifetime', values: [{ value: { '0': 1, '1': 0.7, '2': 0.4 } }] },
          ],
        })
      }
      return error(803, `unexpected ${path}`)
    }),
  )
  return calls
}

describe('reel stats against the database', () => {
  let payload: Payload
  let mediaId: number
  let draftId: number
  const now = new Date()
  const errors = vi.spyOn(console, 'error')

  const rows = async () =>
    (
      await payload.find({
        collection: 'hq-social-stats',
        where: { mediaId: { in: ['ig-early', 'ig-postiz', 'ig-old', 'ig-photo', 'fb-early'] } },
        sort: 'createdAt',
        limit: 50,
        depth: 0,
        overrideAccess: true,
      })
    ).docs

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    delete process.env.TELEGRAM_BOT_TOKEN
    mediaId = await makeHqMedia(payload)
    const draft = await payload.create({
      collection: 'hq-social-drafts',
      data: {
        caption: withFbLink('HQ-TEST reel draft'),
        media: [mediaId],
        platforms: ['instagram', 'facebook'],
        scheduledFor: new Date(now.getTime() - 72 * MIN).toISOString(),
      } as HqSocialDraft,
      overrideAccess: true,
    })
    draftId = draft.id
    await payload.update({
      collection: 'hq-social-drafts',
      id: draftId,
      data: { status: 'published', publishAt: new Date(now.getTime() - 72 * MIN).toISOString() },
      overrideAccess: true,
      context: { hqInternal: true },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.META_GRAPH_TOKEN
  })

  afterAll(async () => {
    if (!payload) return
    for (const r of await rows()) await payload.delete({ collection: 'hq-social-stats', id: r.id, overrideAccess: true })
    if (draftId) await payload.delete({ collection: 'hq-social-drafts', id: draftId, overrideAccess: true }).catch(() => undefined)
    if (mediaId) await payload.delete({ collection: 'hq-media', id: mediaId, overrideAccess: true }).catch(() => undefined)
  })

  it('reads every reel on @flamingo.county, matched or not, once per checkpoint', async () => {
    process.env.META_GRAPH_TOKEN = TOKEN
    const calls = fakeGraph(now, { refuseSkipRate: true })
    expect(await collectReelStats(payload, now)).toEqual({ reels: 3, saved: 3 })

    const saved = await rows()
    const early = saved.find((r) => r.mediaId === 'ig-early')!
    expect(early).toMatchObject({
      kind: 'reel',
      source: 'graph',
      platform: 'instagram',
      checkpoint: '1h',
      ageMinutes: 70,
      draft: draftId,
      permalink: 'https://www.instagram.com/reel/early/',
      failedMetrics: ['reels_skip_rate'],
    })
    expect(early.metrics).toMatchObject({ views: 500, reach: 400, ig_reels_avg_watch_time: 7500 })
    expect((early.metrics as Record<string, number>).reels_skip_rate).toBeUndefined()

    // Scheduled straight in Postiz: no draft, still measured, and at 24h — not "1h" at hour 40.
    expect(saved.find((r) => r.mediaId === 'ig-postiz')).toMatchObject({ checkpoint: '24h', ageMinutes: 2400, draft: null })

    const fb = saved.find((r) => r.mediaId === 'fb-early')!
    expect(fb).toMatchObject({
      platform: 'facebook',
      checkpoint: '1h',
      draft: draftId,
      durationSec: 30,
      permalink: 'https://www.facebook.com/reel/fb-early',
    })
    expect(fb.retention).toEqual({ '0': 1, '1': 0.7, '2': 0.4 })
    expect(fb.metrics).toMatchObject({ 'post_video_social_actions.share': 2, post_video_avg_time_watched: 9000 })

    expect(saved.some((r) => ['ig-photo', 'ig-old'].includes(r.mediaId ?? ''))).toBe(false)

    // Only Flamingo County's ids were ever asked for; Club de la Amistad's never.
    expect(calls.some((c) => c.url.pathname.includes('club'))).toBe(false)
    // The refused metric was found once (batch + alone), then left out for the next reel.
    expect(calls.filter((c) => c.url.searchParams.get('metric')?.includes('reels_skip_rate'))).toHaveLength(2)

    // The token travels in the header only, the Page token is used for the Page, and neither is stored.
    for (const c of calls) {
      expect(c.url.toString()).not.toContain(TOKEN)
      expect(c.url.toString()).not.toContain(PAGE_TOKEN)
      expect(c.url.searchParams.has('access_token')).toBe(false)
    }
    expect(calls.find((c) => c.url.pathname.endsWith('/ig-fc/media'))?.auth).toBe(`Bearer ${TOKEN}`)
    expect(calls.find((c) => c.url.pathname.endsWith('/video_insights'))?.auth).toBe(`Bearer ${PAGE_TOKEN}`)
    expect(calls.filter((c) => c.url.pathname.endsWith('/me/accounts'))).toHaveLength(1)
    expect(JSON.stringify(saved)).not.toContain(TOKEN)
    expect(JSON.stringify(saved)).not.toContain(PAGE_TOKEN)

    // A second run inside the same windows writes nothing new.
    fakeGraph(now)
    expect((await collectReelStats(payload, now)).saved).toBe(0)
    expect(await rows()).toHaveLength(3)
  })

  it('takes the 3h reading in its own window and keeps the first match', async () => {
    process.env.META_GRAPH_TOKEN = TOKEN
    const later = new Date(now.getTime() + 2 * HOUR)
    fakeGraph(now)
    await collectReelStats(payload, later)
    const early = (await rows()).filter((r) => r.mediaId === 'ig-early')
    expect(early.map((r) => [r.checkpoint, r.ageMinutes, r.draft])).toEqual([
      ['1h', 70, draftId],
      ['3h', 190, draftId],
    ])
  })

  it('keeps measuring Instagram when Facebook fails', async () => {
    process.env.META_GRAPH_TOKEN = TOKEN
    const later = new Date(now.getTime() + 25 * HOUR)
    fakeGraph(now, { fbDown: true })
    errors.mockImplementation(() => undefined)
    const result = await collectReelStats(payload, later)
    // ig-early's 24h reading; ig-postiz is 65 hours old, still in the 24h window it already has.
    expect(result.saved).toBe(1)
    expect(errors.mock.calls.some((c) => String(c[0]).includes('Facebook reels failed'))).toBe(true)
    for (const c of errors.mock.calls) expect(c.join(' ')).not.toContain(TOKEN)
    errors.mockRestore()
  })

  it('shows up in hqSocialReport, and stays out of the brief', async () => {
    const report = await socialReport(payload, 7, new Date(now.getTime() + 25 * HOUR))
    const post = report.posts.find((p) => p.draft === draftId)!
    expect(post.reels.instagram).toMatchObject({ checkpoint: '24h', sharesPerReach: 0.02 })
    // Instagram has no length; the Facebook twin's 30 s lends one: 7.5 s of 30 s.
    expect(post.reels.instagram.avgWatchPctOfLength).toBe(25)
    expect(post.reels.facebook).toMatchObject({ checkpoint: '3h', avgWatchPctOfLength: 30, sharesPerReach: 0.02 })
    expect(report.otherReels).toEqual([
      expect.objectContaining({ platform: 'instagram', permalink: 'https://www.instagram.com/reel/postiz/', checkpoint: '24h' }),
    ])

    const brief = await buildBrief(payload, new Date(now.getTime() + 25 * HOUR), { calendar: false })
    expect(brief).not.toContain('ig-early')
    expect(brief).not.toMatch(/ at 1h| at 3h/)
  })
})
