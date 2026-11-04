// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { pairDrafts, postizCutMetrics, preferGraph, scoreReels, type PairDraft } from '@/lib/reelScore'
import type { HqSocialDraft } from '@/payload-types'
import { makeHqMedia } from './helpers/facebook'

const HOUR = 60 * 60_000
const DAY = 24 * HOUR

describe('Postiz numbers as reel metrics', () => {
  it('reads Instagram from Postiz labels, with no watch time or skip rate', () => {
    // Draft #232's real 3d Postiz row (Graph said 1,603 views / 1,307 reach).
    const m = postizCutMetrics('instagram', {
      Views: { latest: 1605, sum: 1605 },
      Reach: { latest: 1309, sum: 1309 },
      Saves: { latest: 7, sum: 7 },
      Likes: { latest: 62, sum: 62 },
      Comments: { latest: 0, sum: 0 },
      Shares: { latest: 2, sum: 2 },
    })
    expect(m).toEqual({
      views: 1605,
      reach: 1309,
      avgWatchSec: null,
      avgWatchPct: null,
      skipRate: null,
      sharesPerReach: 0.0015,
      savesPerReach: 0.0053,
      likesPerReach: 0.0474,
    })
  })

  it('divides TikTok by views, since it has no reach, and leaves saves empty when absent', () => {
    expect(postizCutMetrics('tiktok', { Views: { latest: 1000 }, Likes: { latest: 50 }, Shares: { latest: 20 }, Comments: { latest: 3 } })).toEqual({
      views: 1000,
      reach: null,
      avgWatchSec: null,
      avgWatchPct: null,
      skipRate: null,
      sharesPerReach: 0.02,
      savesPerReach: null,
      likesPerReach: 0.05,
    })
  })

  it('keeps the Graph row when both sources read the same cut', () => {
    const rows = [
      { id: 1, platform: 'instagram', checkpoint: '3d', draft: 9, metrics: {}, src: 'graph' as const },
      { id: 2, platform: 'instagram', checkpoint: '3d', draft: 9, metrics: {}, src: 'postiz' as const },
      { id: 3, platform: 'tiktok', checkpoint: '3d', draft: 9, metrics: {}, src: 'postiz' as const },
    ]
    expect(preferGraph(rows as never).map((r) => r.id)).toEqual([1, 3])
  })

  it('never pairs an Instagram cut with a TikTok cut drafted in the same batch', () => {
    const t0 = Date.parse('2026-11-04T03:20:44.000Z')
    const d = (id: number, language: 'es' | 'en', platform: 'instagram' | 'tiktok'): PairDraft => ({
      id,
      status: 'scheduled',
      pillar: 'story',
      language,
      platforms: [platform],
      createdAt: new Date(t0 + id).toISOString(),
      publishAt: new Date(Date.parse('2026-11-04T21:00:00Z') + (language === 'es' ? HOUR : 0)).toISOString(),
    })
    // Cachao: IG EN 296, IG ES 297, TikTok ES 298, TikTok EN 299, all within a minute.
    const groups = pairDrafts([d(296, 'en', 'instagram'), d(297, 'es', 'instagram'), d(298, 'es', 'tiktok'), d(299, 'en', 'tiktok')])
    expect(groups.map((g) => g.map((x) => x.id))).toEqual([
      [296, 297],
      [298, 299],
    ])
  })
})

describe('the scorer on Postiz numbers alone', () => {
  let payload: Payload
  const esOut = new Date('2032-05-10T21:00:00.000Z')
  const enOut = new Date(esOut.getTime() + HOUR)
  const made: { collection: 'hq-social-drafts' | 'hq-social-stats' | 'hq-reel-reviews' | 'hq-media'; id: number }[] = []
  let es: number
  let en: number
  let tiktok: number

  const draft = async (language: 'es' | 'en', platform: 'instagram' | 'tiktok', publishAt: Date, media: number[]) => {
    const doc = await payload.create({
      collection: 'hq-social-drafts',
      data: {
        caption: `RSC-TEST ${language} ${platform}`,
        platforms: [platform],
        media,
        scheduledFor: publishAt.toISOString(),
        pillar: 'story',
        language,
        status: 'published',
        publishAt: publishAt.toISOString(),
        postizBackend: 'cloud',
      } as HqSocialDraft,
      overrideAccess: true,
      context: { hqInternal: true },
    })
    made.push({ collection: 'hq-social-drafts', id: doc.id })
    return doc.id
  }

  const post = async (draftId: number, platform: 'instagram' | 'tiktok', checkpoint: '24h' | '3d', metrics: Record<string, number>) => {
    const doc = await payload.create({
      collection: 'hq-social-stats',
      data: {
        kind: 'post',
        platform,
        checkpoint,
        draft: draftId,
        postizPostId: `rsc-${draftId}-${checkpoint}`,
        metrics: Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, { latest: v, sum: v }])),
      } as never,
      overrideAccess: true,
    })
    made.push({ collection: 'hq-social-stats', id: doc.id })
  }

  const reviewsFor = async (ids: number[]) =>
    (await payload.find({ collection: 'hq-reel-reviews', where: { drafts: { in: ids } }, depth: 0, limit: 10, overrideAccess: true })).docs

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    delete process.env.TELEGRAM_BOT_TOKEN
    vi.stubGlobal('fetch', vi.fn())
    const mEs = await makeHqMedia(payload)
    const mEn = await makeHqMedia(payload)
    made.push({ collection: 'hq-media', id: mEs }, { collection: 'hq-media', id: mEn })

    // History: three earlier Instagram story reels read only by Postiz, median 1,000 views.
    for (const [i, views] of [1000, 1000, 5000].entries()) {
      const out = new Date(esOut.getTime() - (16 + i) * DAY)
      const id = await draft('es', 'instagram', out, [mEs])
      await post(id, 'instagram', '3d', { Views: views, Reach: views, Shares: 10, Likes: 50 })
    }

    es = await draft('es', 'instagram', esOut, [mEs])
    en = await draft('en', 'instagram', enOut, [mEn])
    tiktok = await draft('en', 'tiktok', enOut, [mEn])
    await post(es, 'instagram', '3d', { Views: 2000, Reach: 1600, Shares: 32, Saves: 8, Likes: 80 })
    await post(en, 'instagram', '3d', { Views: 500, Reach: 400, Shares: 2, Likes: 10 })
    await post(tiktok, 'tiktok', '3d', { Views: 900, Likes: 45, Shares: 18, Comments: 4 })
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    if (!payload) return
    for (const r of await reviewsFor([es, en, tiktok])) await payload.delete({ collection: 'hq-reel-reviews', id: r.id, overrideAccess: true })
    for (const m of made.reverse()) await payload.delete({ collection: m.collection, id: m.id, overrideAccess: true }).catch(() => undefined)
  })

  it('reviews the Instagram pair and the TikTok cut separately, from Postiz rows', async () => {
    const res = await scoreReels(payload, new Date(enOut.getTime() + 74 * HOUR))
    expect(res.reviewed).toBe(2)

    const [ig] = await reviewsFor([es])
    expect(ig.drafts).toEqual([es, en])
    expect(ig.summary).toContain('Instagram · ES')
    expect(ig.summary).toMatch(/views 2,000 \(2x\)/)
    expect(ig.summary).not.toMatch(/skip rate [0-9n]/)
    // The English cut's video also went to TikTok: linked by the shared media.
    expect(ig.summary).toContain(`#${en} ↔ #${tiktok} (TikTok, EN`)
    expect(ig.summary).toMatch(/TikTok: views 900 · shares\/view 2%/)

    const [tt] = await reviewsFor([tiktok])
    expect(tt.drafts).toEqual([tiktok])
    expect(tt.summary).toContain('TikTok · EN')
    expect(tt.summary).toContain('shares/view')
    expect(tt.summary).toContain('no baseline yet')
    expect(tt.summary).toContain(`#${tiktok} ↔ #${en} (Instagram, EN`)
  })
})
