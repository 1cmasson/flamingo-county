// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { weeklyReviewContext } from '@/lib/mcpTools'
import {
  cutMetrics,
  experimentMarker,
  median,
  pairDrafts,
  readiness,
  retentionSummary,
  scoreReels,
  vsMedian,
  type Cut,
  type PairDraft,
} from '@/lib/reelScore'
import type { HqSocialDraft, HqSocialStat } from '@/payload-types'

const MIN = 60_000
const HOUR = 60 * MIN

/* ------------------------------------------------------------------------ */
/* Pure helpers                                                              */
/* ------------------------------------------------------------------------ */

describe('medians, not means', () => {
  it('takes the middle value, and the mean of the two middles for an even count', () => {
    expect(median([])).toBeNull()
    expect(median([5])).toBe(5)
    expect(median([3, 1, 2])).toBe(2)
    expect(median([10, 10, 10, 1000])).toBe(10)
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  it('compares with the median of the baseline, so one hit does not move the bar', () => {
    // Mean of this baseline would be 257.5, and 20 would look like 0.08x.
    expect(vsMedian(20, [10, 10, 10, 1000])).toEqual({ value: 20, median: 10, n: 4, ratio: 2 })
    expect(vsMedian(20, [10, null, 30])).toEqual({ value: 20, median: 20, n: 2, ratio: 1 })
  })

  it('gives no ratio against nothing or against a zero median', () => {
    expect(vsMedian(5, [])).toEqual({ value: 5, median: null, n: 0, ratio: null })
    expect(vsMedian(5, [0, 0, 1])).toMatchObject({ median: 0, ratio: null })
    expect(vsMedian(null, [1, 2, 3]).ratio).toBeNull()
  })
})

describe('cut metrics', () => {
  it('reads Instagram in its own names', () => {
    expect(
      cutMetrics(
        'instagram',
        { views: 900, reach: 500, ig_reels_avg_watch_time: 9000, reels_skip_rate: 41.5, shares: 10, saved: 5, likes: 25 },
        30,
      ),
    ).toEqual({
      views: 900,
      reach: 500,
      avgWatchSec: 9,
      avgWatchPct: 30,
      skipRate: 41.5,
      sharesPerReach: 0.02,
      savesPerReach: 0.01,
      likesPerReach: 0.05,
    })
  })

  it('reads Facebook in its own names, with no saves or skip rate (null, not 0)', () => {
    expect(
      cutMetrics(
        'facebook',
        {
          fb_reels_total_plays: 300,
          post_impressions_unique: 200,
          post_video_avg_time_watched: 6000,
          'post_video_social_actions.share': 4,
          'post_video_likes_by_reaction_type.REACTION_LIKE': 6,
          'post_video_likes_by_reaction_type.REACTION_LOVE': 2,
        },
        20,
      ),
    ).toEqual({
      views: 300,
      reach: 200,
      avgWatchSec: 6,
      avgWatchPct: 30,
      skipRate: null,
      sharesPerReach: 0.02,
      savesPerReach: null,
      likesPerReach: 0.04,
    })
  })

  it('leaves watch % empty without a length', () => {
    expect(cutMetrics('instagram', { ig_reels_avg_watch_time: 9000 }, null).avgWatchPct).toBeNull()
  })
})

describe('where they left', () => {
  // 11 evenly spaced points over a 30 s reel: one every 3 s.
  const curve = { '0': 1, '1': 0.8, '2': 0.7, '3': 0.65, '4': 0.6, '5': 0.5, '6': 0.25, '7': 0.24, '8': 0.22, '9': 0.21, '10': 0.2 }

  it('reads % still watching at 3 s, 15 s and half, and the steepest drop', () => {
    expect(retentionSummary(curve, 30)).toEqual({
      at3s: 80,
      at15s: 50,
      atHalf: 50,
      steepestDrop: { points: 25, fromSec: 15, toSec: 18, fromPctOfLength: 50, toPctOfLength: 60 },
    })
  })

  it('reads a curve in percentages too, and gives only the half without a length', () => {
    const pct = Object.fromEntries(Object.entries(curve).map(([k, v]) => [k, v * 100]))
    expect(retentionSummary(pct, null)).toMatchObject({ at3s: null, at15s: null, atHalf: 50 })
    expect(retentionSummary(pct, null)?.steepestDrop).toMatchObject({ fromSec: null, fromPctOfLength: 50 })
  })

  it('gives no 15 s reading for a 10 s reel, and nothing for no curve', () => {
    expect(retentionSummary(curve, 10)?.at15s).toBeNull()
    expect(retentionSummary(null, 30)).toBeNull()
    expect(retentionSummary({ '0': 1 }, 30)).toBeNull()
  })
})

describe('pairing the EN and ES cuts', () => {
  const t0 = Date.parse('2026-10-20T02:31:20.000Z')
  const out = Date.parse('2026-10-20T20:00:00.000Z')
  const d = (id: number, language: PairDraft['language'], extra: Partial<PairDraft> = {}): PairDraft => ({
    id,
    status: 'published',
    pillar: 'story',
    language,
    createdAt: new Date(t0 + id).toISOString(),
    publishAt: new Date(out + (language === 'en' ? HOUR : 0)).toISOString(),
    ...extra,
  })
  const ids = (groups: PairDraft[][]) => groups.map((g) => g.map((x) => x.id))

  it('pairs the two cuts drafted together and posted an hour apart (189/190)', () => {
    expect(ids(pairDrafts([d(190, 'en'), d(189, 'es')]))).toEqual([[189, 190]])
  })

  it('ignores a rejected first try of the same pair', () => {
    expect(
      ids(pairDrafts([d(192, 'en', { status: 'rejected' }), d(193, 'es', { status: 'rejected' }), d(194, 'en'), d(195, 'es')])),
    ).toEqual([[192], [193], [194, 195]])
  })

  it('refuses to guess between two candidates', () => {
    expect(ids(pairDrafts([d(1, 'es'), d(2, 'en'), d(3, 'en')]))).toEqual([[1], [2], [3]])
  })

  it('keeps apart: same language, a "both" draft, another pillar, drafted apart, or posted far apart', () => {
    expect(ids(pairDrafts([d(1, 'es'), d(2, 'es')]))).toEqual([[1], [2]])
    expect(ids(pairDrafts([d(1, 'es'), d(2, 'both')]))).toEqual([[1], [2]])
    expect(ids(pairDrafts([d(1, 'es'), d(2, 'en', { pillar: 'promo' })]))).toEqual([[1], [2]])
    expect(ids(pairDrafts([d(1, 'es'), d(2, 'en', { createdAt: new Date(t0 + 10 * MIN).toISOString() })]))).toEqual([[1], [2]])
    expect(ids(pairDrafts([d(1, 'es'), d(2, 'en', { publishAt: new Date(out + 3 * HOUR).toISOString() })]))).toEqual([[1], [2]])
  })
})

describe('readiness', () => {
  const out = Date.parse('2026-10-20T20:00:00.000Z')
  const draft = { id: 1, status: 'published', pillar: 'story', language: 'es', createdAt: '', publishAt: new Date(out).toISOString() } as PairDraft
  const row = (platform: string, checkpoint: string) =>
    ({ platform, checkpoint, draft: 1, mediaPublishedAt: new Date(out).toISOString() }) as unknown as HqSocialStat
  const at = (hours: number) => new Date(out + hours * HOUR)

  it('never before 72 hours, and never without a 3d reading', () => {
    expect(readiness([draft], [row('instagram', '3d')], at(71.9)).ready).toBe(false)
    expect(readiness([draft], [row('instagram', '24h')], at(200)).ready).toBe(false)
    expect(readiness([draft], [], at(200)).ready).toBe(false)
  })

  it('waits for every platform until the 3d window closes, then scores what there is', () => {
    const rows = [row('instagram', '3d'), row('facebook', '24h')]
    expect(readiness([draft], rows, at(80)).ready).toBe(false)
    expect(readiness([draft], rows, at(121))).toEqual({ ready: true, complete: false, missing: ['#1 facebook: no 3d reading'] })
    expect(readiness([draft], [row('instagram', '3d'), row('facebook', '3d')], at(73))).toEqual({
      ready: true,
      complete: true,
      missing: [],
    })
  })
})

/* ------------------------------------------------------------------------ */
/* Against the database                                                      */
/* ------------------------------------------------------------------------ */

describe('the scorer against the database', () => {
  let payload: Payload
  // Far from the real clock, so no other spec's rows fall in these windows.
  const esOut = new Date('2031-03-10T20:00:00.000Z')
  const enOut = new Date(esOut.getTime() + HOUR)
  const after = (hours: number) => new Date(esOut.getTime() + hours * HOUR)
  const made: { collection: 'hq-social-drafts' | 'hq-social-stats' | 'hq-experiments' | 'hq-reel-reviews'; id: number }[] = []
  let es: number
  let en: number
  let lonely: number
  let experiment: number
  let untouched: number
  const fetchSpy = vi.fn()

  const draft = async (language: HqSocialDraft['language'], publishAt: Date, pillar: HqSocialDraft['pillar'] = 'story') => {
    const doc = await payload.create({
      collection: 'hq-social-drafts',
      data: {
        caption: `RS-TEST ${language} reel`,
        platforms: ['instagram', 'facebook'],
        scheduledFor: publishAt.toISOString(),
        pillar,
        language,
        status: 'published',
        publishAt: publishAt.toISOString(),
      } as HqSocialDraft,
      overrideAccess: true,
      // HQ's own write: no preview, no event, no caption checks.
      context: { hqInternal: true },
    })
    made.push({ collection: 'hq-social-drafts', id: doc.id })
    return doc.id
  }

  const reel = async (
    draftId: number,
    platform: 'instagram' | 'facebook',
    checkpoint: string,
    publishedAt: Date,
    metrics: Record<string, number>,
    extra: Partial<HqSocialStat> = {},
  ) => {
    const doc = await payload.create({
      collection: 'hq-social-stats',
      data: {
        kind: 'reel',
        source: 'graph',
        platform,
        checkpoint: checkpoint as HqSocialStat['checkpoint'],
        ageMinutes: checkpoint === '3d' ? 72 * 60 + 5 : 24 * 60 + 5,
        draft: draftId,
        mediaId: `rs-test-${draftId}-${platform}-${checkpoint}`,
        permalink: `https://example.test/${platform}/${draftId}`,
        mediaPublishedAt: publishedAt.toISOString(),
        metrics,
        ...extra,
      },
      overrideAccess: true,
    })
    made.push({ collection: 'hq-social-stats', id: doc.id })
  }

  const reviews = async () =>
    (
      await payload.find({
        collection: 'hq-reel-reviews',
        where: { drafts: { in: [es, en, lonely] } },
        depth: 0,
        limit: 10,
        overrideAccess: true,
      })
    ).docs

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    delete process.env.TELEGRAM_BOT_TOKEN
    vi.stubGlobal('fetch', fetchSpy)

    // The account's history: four earlier story reels, one of them a hit.
    // Median Instagram views 100; the mean would be 2,575. Older than the
    // scorer's 14-day lookback, so they are baseline only, not reviewed here.
    const history = [100, 100, 100, 10_000]
    for (const [i, views] of history.entries()) {
      const out = new Date(esOut.getTime() - (15 + i) * 24 * HOUR)
      const id = await draft('es', out)
      await reel(id, 'instagram', '3d', out, { views, reach: views, shares: 1, ig_reels_avg_watch_time: 6000 })
    }
    // A promo reel with huge numbers: another pillar, so not in a story's baseline.
    const promoOut = new Date(esOut.getTime() - 15 * 24 * HOUR - 3 * HOUR)
    const promo = await draft('both', promoOut, 'promo')
    await reel(promo, 'instagram', '3d', promoOut, { views: 1_000_000, reach: 1_000_000 })

    // The story: the Spanish cut, then the English one an hour later.
    es = await draft('es', esOut)
    en = await draft('en', enOut)
    await reel(es, 'instagram', '3d', esOut, { views: 300, reach: 250, shares: 5, saved: 2, likes: 20, ig_reels_avg_watch_time: 12_000, reels_skip_rate: 38 })
    await reel(es, 'facebook', '3d', esOut, { fb_reels_total_plays: 80, post_impressions_unique: 60, post_video_avg_time_watched: 15_000, 'post_video_social_actions.share': 3 }, {
      durationSec: 30,
      retention: { '0': 1, '1': 0.8, '2': 0.7, '3': 0.65, '4': 0.6, '5': 0.5, '6': 0.25, '7': 0.24, '8': 0.22, '9': 0.21, '10': 0.2 },
    })
    await reel(en, 'instagram', '3d', enOut, { views: 150, reach: 125, shares: 1, ig_reels_avg_watch_time: 6000, reels_skip_rate: 50 })
    await reel(en, 'facebook', '3d', enOut, { fb_reels_total_plays: 40, post_impressions_unique: 30, post_video_avg_time_watched: 6000 }, { durationSec: 30 })

    // A cut with no 3d reading at all, long past its window: nothing to score.
    lonely = await draft('both', new Date(esOut.getTime() - 30 * HOUR))
    await reel(lonely, 'instagram', '24h', new Date(esOut.getTime() - 30 * HOUR), { views: 5, reach: 5 })

    const x = await payload.create({
      collection: 'hq-experiments',
      data: {
        title: 'RS-TEST hook in the first second',
        status: 'running',
        hypothesis: 'If the promised story starts by 0:03, watch % goes up.',
        metric: 'avg watch % at 72h',
        result: 'Before: Lukumí 17 s to the story.',
        drafts: [es, en],
      },
      overrideAccess: true,
    })
    experiment = x.id
    made.push({ collection: 'hq-experiments', id: x.id })
    const y = await payload.create({
      collection: 'hq-experiments',
      data: { title: 'RS-TEST unrelated', status: 'running', hypothesis: 'h', metric: 'm', result: 'keep me' },
      overrideAccess: true,
    })
    untouched = y.id
    made.push({ collection: 'hq-experiments', id: y.id })
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    if (!payload) return
    for (const r of await reviews()) await payload.delete({ collection: 'hq-reel-reviews', id: r.id, overrideAccess: true })
    for (const m of made.reverse()) {
      await payload.delete({ collection: m.collection, id: m.id, overrideAccess: true }).catch(() => undefined)
    }
  })

  it('writes nothing before 72 hours, nor while the English cut is younger than 72 hours', async () => {
    expect(await scoreReels(payload, after(71))).toEqual({ reviewed: 0, experiments: 0 })
    expect(await scoreReels(payload, after(72.5))).toEqual({ reviewed: 0, experiments: 0 })
    expect(await reviews()).toHaveLength(0)
    const x = await payload.findByID({ collection: 'hq-experiments', id: experiment, overrideAccess: true })
    expect(x.result).toBe('Before: Lukumí 17 s to the story.')
  })

  it('scores the pair at 72 hours against the median of earlier story reels', async () => {
    expect(await scoreReels(payload, after(74))).toEqual({ reviewed: 1, experiments: 1 })
    const [review] = await reviews()
    expect(review).toMatchObject({ key: `reel-review:${es}`, pillar: 'story', checkpoint: '3d', complete: true })
    expect(review.drafts).toEqual([es, en])

    const cuts = review.cuts as Cut[]
    expect(cuts.map((c) => [c.draft, c.language, c.platform])).toEqual([
      [es, 'es', 'instagram'],
      [es, 'es', 'facebook'],
      [en, 'en', 'instagram'],
      [en, 'en', 'facebook'],
    ])
    const igEs = cuts[0]
    // 300 views against a median of 100 (not the mean of 2,575), from 4 earlier story reels; the promo is not one.
    expect(igEs.vsMedian.views).toEqual({ value: 300, median: 100, n: 4, ratio: 3 })
    // Instagram borrows its draft's Facebook length: 12 s of 30 s.
    expect(igEs.metrics.avgWatchPct).toBe(40)
    expect(igEs.permalink).toBe(`https://example.test/instagram/${es}`)
    // No Facebook history: numbers, no ratios.
    expect(cuts[1].vsMedian.views).toEqual({ value: 80, median: null, n: 0, ratio: null })

    expect(review.pair).toMatchObject({
      instagram: { views: { es: 300, en: 150, esOverEn: 2 }, skipRate: { es: 38, en: 50, esOverEn: 0.76 } },
      facebook: { views: { es: 80, en: 40, esOverEn: 2 } },
    })
    expect(review.retention).toEqual([
      expect.objectContaining({ draft: es, language: 'es', summary: expect.objectContaining({ at3s: 80, at15s: 50, atHalf: 50 }) }),
    ])
    expect(review.summary).toContain('Where they left (Facebook ES')
    expect(review.summary).toContain('views 300 (3x)')
    expect(review.experiments).toEqual([experiment])
  })

  it('appends the numbers to the experiment once, keeps what was there, and sets no verdict', async () => {
    const x = await payload.findByID({ collection: 'hq-experiments', id: experiment, overrideAccess: true })
    expect(x.result!.startsWith('Before: Lukumí 17 s to the story.\n\n')).toBe(true)
    expect(x.result!.split(experimentMarker(`reel-review:${es}`))).toHaveLength(2)
    expect(x.result).toContain('views 300 (3x)')
    expect(x.verdict ?? null).toBeNull()
    expect(x.status).toBe('running')

    // Run again: no second review, no second block.
    expect(await scoreReels(payload, after(80))).toEqual({ reviewed: 0, experiments: 0 })
    expect(await reviews()).toHaveLength(1)
    const again = await payload.findByID({ collection: 'hq-experiments', id: experiment, overrideAccess: true })
    expect(again.result).toBe(x.result)
    const other = await payload.findByID({ collection: 'hq-experiments', id: untouched, overrideAccess: true })
    expect(other.result).toBe('keep me')
  })

  it('reviews nothing without a 3d reading, and never touches the network', async () => {
    fetchSpy.mockClear() // Payload's own boot telemetry is not ours
    await scoreReels(payload, after(200))
    const lonelyReviews = (await reviews()).filter((r) => (r.drafts as number[]).includes(lonely))
    expect(lonelyReviews).toHaveLength(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('is in the weekly and growth review context', async () => {
    const ctx = await weeklyReviewContext(payload, after(80))
    const mine = ctx.reelReviews.find((r) => r.drafts.includes(es))!
    expect(mine).toMatchObject({ pillar: 'story', complete: true, experiments: [experiment] })
    expect(mine.cuts[0].vsMedian.views).toEqual({ ratio: 3, n: 4 })
    expect(mine.summary).toContain('Spanish vs English')
  })
})
