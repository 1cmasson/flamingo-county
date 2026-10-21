// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import { reelsNow, retentionAt, summarize } from '@/lib/reelNow'

const MIN = 60_000
const TOKEN = 'TEST-SYSTEM-USER-TOKEN-0123456789'
const PAGE_TOKEN = 'TEST-PAGE-TOKEN-9876543210'

function fakeGraph(now: Date) {
  const paths: string[] = []
  const ago = (minutes: number) => new Date(now.getTime() - minutes * MIN).toISOString()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      const path = url.pathname.replace(/^\/v\d+\.\d+/, '')
      paths.push(path)
      if (path === '/me/accounts') {
        return Response.json({
          data: [
            { id: 'page-club', name: 'Club de la Amistad', access_token: 'club', instagram_business_account: { id: 'ig-club', username: 'clubdelaamistad' } },
            { id: 'page-fc', name: 'Flamingo County', access_token: PAGE_TOKEN, instagram_business_account: { id: 'ig-fc', username: 'flamingo.county' } },
          ],
        })
      }
      if (path === '/ig-fc/media') {
        return Response.json({
          data: [
            { id: 'ig-es', caption: '¿Sabías que Hialeah llegó a la Corte Suprema?', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/es/', timestamp: ago(20 * 60) },
            { id: 'ig-en', caption: 'Did you know Hialeah went to the Supreme Court?', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/en/', timestamp: ago(19 * 60) },
            { id: 'ig-photo', caption: 'Corte photo', media_product_type: 'FEED', timestamp: ago(30) },
          ],
        })
      }
      if (path === '/page-fc/video_reels') {
        return Response.json({ data: [{ id: 'fb-es', description: '¿Sabías que Hialeah llegó a la Corte Suprema?', created_time: ago(20 * 60 - 2), permalink_url: '/reel/fb-es', length: 106 }] })
      }
      if (path === '/ig-es/insights' || path === '/ig-en/insights') {
        const metrics = (url.searchParams.get('metric') ?? '').split(',')
        const values: Record<string, number> = { views: 1800, reach: 1400, shares: 137, saved: 10, likes: 68, ig_reels_avg_watch_time: 50_000, reels_skip_rate: 40 }
        return Response.json({ data: metrics.map((name) => ({ name, values: [{ value: values[name] ?? 0 }] })) })
      }
      if (path === '/fb-es/video_insights') {
        return Response.json({
          data: [
            { name: 'blue_reels_play_count', values: [{ value: 300 }] },
            { name: 'post_video_avg_time_watched', values: [{ value: 13_000 }] },
            { name: 'post_video_social_actions', values: [{ value: { SHARE: 3, COMMENT: 1 } }] },
            { name: 'post_video_retention_graph', values: [{ value: { '0': 1, '3': 0.7, '15': 0.4, '30': 0.3, '53': 0.2, '106': 0.1 } }] },
          ],
        })
      }
      return Response.json({ error: { code: 803, message: `unexpected ${path}` } }, { status: 400 })
    }),
  )
  return paths
}

describe('hqReelNow', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.META_GRAPH_TOKEN
  })

  it('says so, without touching the network, when there is no token', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    expect(await reelsNow()).toMatchObject({ ok: false })
    expect(spy).not.toHaveBeenCalled()
  })

  it('reads a reel live, by caption words with accents ignored, and borrows the Facebook twin length', async () => {
    process.env.META_GRAPH_TOKEN = TOKEN
    const now = new Date('2026-10-21T13:00:00Z')
    const paths = fakeGraph(now)
    const out = (await reelsNow({ query: 'corte suprema', platform: 'instagram' }, now)) as Extract<Awaited<ReturnType<typeof reelsNow>>, { ok: true }>
    expect(out.ok).toBe(true)
    expect(out.reels).toHaveLength(1)
    expect(out.reels[0]).toMatchObject({
      platform: 'instagram',
      mediaId: 'ig-es',
      lengthSec: 106,
      avgWatchSec: 50,
      avgWatchPctOfLength: 47.2,
      shares: 137,
      sharesPerReach: 0.0979,
      skipRatePct: 40,
    })
    // never the club's account, and never the photo
    expect(paths.some((p) => p.includes('club'))).toBe(false)
    expect(paths).not.toContain('/ig-photo/insights')
    expect(JSON.stringify(out)).not.toContain(TOKEN)
    expect(JSON.stringify(out)).not.toContain(PAGE_TOKEN)
  })

  it('gives Facebook shares, comments and where viewers left', async () => {
    process.env.META_GRAPH_TOKEN = TOKEN
    const now = new Date('2026-10-21T13:00:00Z')
    fakeGraph(now)
    const out = (await reelsNow({ platform: 'facebook' }, now)) as Extract<Awaited<ReturnType<typeof reelsNow>>, { ok: true }>
    expect(out.reels[0]).toMatchObject({ platform: 'facebook', views: 300, avgWatchSec: 13, shares: 3, comments: 1 })
    expect(out.reels[0]).toHaveProperty('stillWatchingPct', { '3s': 70, '15s': 40, '30s': 30, half: 20, last: 10 })
  })
})

describe('reel-now helpers', () => {
  it('reads the retention curve at fixed moments', () => {
    expect(retentionAt({ '0': 1, '1': 0.9, '2': 0.5 }, 2)).toEqual({ half: 90, last: 50 })
    expect(retentionAt(null, 10)).toBeNull()
  })

  it('leaves the length share empty when the length is unknown', () => {
    expect(summarize('instagram', { metrics: { ig_reels_avg_watch_time: 9000 }, retention: null, failed: [], raw: [] }, null)).toMatchObject({
      avgWatchSec: 9,
      avgWatchPctOfLength: null,
    })
  })
})
