import type { Payload } from 'payload'

import type { HqSocialDraft } from '../payload-types'
import {
  discoverAccount,
  fbReelInsights,
  graphConfigured,
  igReelInsights,
  listFbReels,
  listIgReels,
  type GraphAccount,
  type Reading,
} from './metaGraph'

/**
 * Reel telemetry straight from Meta's Graph API (lib/metaGraph.ts), beside the
 * Postiz numbers in lib/socialStats.ts. Postiz gives views, reach and
 * reactions at 24h, 3d and 7d, and only for posts HQ drafted. This adds what
 * decides whether a reel worked — average watch time, skip rate, the
 * retention curve — readings at 1h and 3h, and every reel on the account,
 * including ones scheduled straight in Postiz.
 *
 * Rows go into `hq-social-stats` as `kind: 'reel'`, `source: 'graph'`, so
 * nothing that reads `kind: 'post'` (the brief, the Postiz collector, the
 * dashboard) sees them by accident. One row per reel, platform and checkpoint.
 *
 * A no-op without `META_GRAPH_TOKEN`: `collectReelStats` returns before it
 * touches the network or the database.
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

/**
 * When a reel is read, counted from when it went live, and for how long each
 * reading may still be taken. The early checkpoints get short windows of
 * their own: a "1h" reading taken at hour 40 would be a 40-hour number under
 * a 1-hour label, so after two hours the 1h reading is skipped, not taken
 * late. The later ones keep the Postiz collector's 48 hours of retries, and
 * no two windows overlap, so one reading never carries two labels.
 * `ageMinutes` on each row says when it was really taken.
 */
export const REEL_CHECKPOINTS = [
  { key: '1h', from: 60, until: 120 },
  { key: '3h', from: 180, until: 300 },
  { key: '24h', from: 24 * 60, until: (24 + 48) * 60 },
  { key: '3d', from: 72 * 60, until: (72 + 48) * 60 },
  { key: '7d', from: 168 * 60, until: (168 + 48) * 60 },
] as const
export type ReelCheckpoint = (typeof REEL_CHECKPOINTS)[number]['key']

/** Oldest reel still worth listing: the last window's end. */
const LOOKBACK_MS = REEL_CHECKPOINTS[REEL_CHECKPOINTS.length - 1].until * MINUTE

/** The checkpoint whose window `now` falls in, unless already taken. */
export function dueReelCheckpoint(publishedAt: Date, now: Date, taken: Set<string>): ReelCheckpoint | null {
  const age = (now.getTime() - publishedAt.getTime()) / MINUTE
  const c = REEL_CHECKPOINTS.find((c) => age >= c.from && age < c.until)
  return c && !taken.has(c.key) ? c.key : null
}

/**
 * How close a draft's `publishAt` must be to the reel's own timestamp to be
 * called the same post. The Spanish and English cuts of a story go out about
 * an hour apart, so ten minutes cannot confuse them; two drafts inside it is
 * ambiguous, and the reel is kept standalone rather than guessed.
 */
const MATCH_MS = 10 * MINUTE

type DraftLite = Pick<HqSocialDraft, 'id' | 'platforms' | 'publishAt'>

export function matchDraft(drafts: DraftLite[], at: Date, platform: 'instagram' | 'facebook'): number | null {
  const near = drafts.filter(
    (d) =>
      d.publishAt &&
      (d.platforms ?? []).includes(platform) &&
      Math.abs(new Date(d.publishAt).getTime() - at.getTime()) <= MATCH_MS,
  )
  return near.length === 1 ? near[0].id : null
}

const clip = (s: string | undefined, max = 160) => {
  const t = (s ?? '').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

type Target = {
  platform: 'instagram' | 'facebook'
  mediaId: string
  permalink: string | null
  caption: string
  publishedAt: Date
  durationSec: number | null
  read: () => Promise<Reading | null>
}

/** Save the due reading for one reel, if any. Returns 1 when a row was written. */
async function measure(payload: Payload, t: Target, drafts: DraftLite[], now: Date): Promise<number> {
  const existing = await payload.find({
    collection: 'hq-social-stats',
    where: {
      and: [{ kind: { equals: 'reel' } }, { platform: { equals: t.platform } }, { mediaId: { equals: t.mediaId } }],
    },
    limit: 20,
    depth: 0,
    overrideAccess: true,
  })
  const checkpoint = dueReelCheckpoint(t.publishedAt, now, new Set(existing.docs.map((s) => s.checkpoint ?? '')))
  if (!checkpoint) return 0

  // A match made on the first reading stands, so a draft created or moved
  // later cannot re-label a reel halfway through its checkpoints.
  const prior = existing.docs.map((s) => (s.draft && typeof s.draft === 'object' ? s.draft.id : s.draft)).find(Boolean)
  const draft = existing.docs.length ? (prior ?? null) : matchDraft(drafts, t.publishedAt, t.platform)

  const reading = await t.read()
  if (!reading) return 0 // Graph has no rows for it yet: next run

  await payload.create({
    collection: 'hq-social-stats',
    data: {
      kind: 'reel',
      source: 'graph',
      platform: t.platform,
      checkpoint,
      ageMinutes: Math.round((now.getTime() - t.publishedAt.getTime()) / MINUTE),
      draft: draft ?? undefined,
      mediaId: t.mediaId,
      permalink: t.permalink ?? undefined,
      mediaPublishedAt: t.publishedAt.toISOString(),
      caption: t.caption,
      durationSec: t.durationSec ?? undefined,
      metrics: reading.metrics,
      retention: (reading.retention ?? undefined) as never,
      failedMetrics: reading.failed.length ? reading.failed : undefined,
      raw: reading.raw as never,
    },
    overrideAccess: true,
  })
  return 1
}

/** Said once per process: a token that reaches no Flamingo County account is a setup problem, not news every 15 minutes. */
let warnedNoAccount = false

/**
 * Read every reel on the Flamingo County Instagram and Facebook Page whose
 * checkpoint window is open now. Instagram first; Facebook is best effort
 * (see lib/metaGraph.ts) and its failure is logged without losing Instagram.
 */
export async function collectReelStats(payload: Payload, now: Date = new Date()) {
  if (!graphConfigured()) return { reels: 0, saved: 0 }
  const token = process.env.META_GRAPH_TOKEN!.trim()

  let account: GraphAccount | null
  try {
    account = await discoverAccount(token)
  } catch (err) {
    console.error('[hq] Graph account lookup failed:', err instanceof Error ? err.message : err)
    return { reels: 0, saved: 0 }
  }
  if (!account) {
    if (!warnedNoAccount) {
      console.error(
        '[hq] META_GRAPH_TOKEN reaches no single Facebook Page named Flamingo County with @flamingo.county attached; reel stats are off.',
      )
      warnedNoAccount = true
    }
    return { reels: 0, saved: 0 }
  }
  warnedNoAccount = false

  const since = new Date(now.getTime() - LOOKBACK_MS)
  const drafts = await payload.find({
    collection: 'hq-social-drafts',
    where: {
      and: [
        { status: { in: ['scheduled', 'published'] } },
        { publishAt: { greater_than: new Date(since.getTime() - HOUR).toISOString() } },
      ],
    },
    select: { platforms: true, publishAt: true },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  const lite = drafts.docs as DraftLite[]

  // Metrics refused by Graph this run, per platform: asked once, not per reel.
  const rejected = { instagram: new Set<string>(), facebook: new Set<string>() }
  const targets: Target[] = []

  try {
    for (const m of await listIgReels(account, since, token)) {
      targets.push({
        platform: 'instagram',
        mediaId: m.id,
        permalink: m.permalink ?? null,
        caption: clip(m.caption),
        publishedAt: new Date(m.timestamp),
        durationSec: null, // Instagram's media fields have no length
        read: () => igReelInsights(m.id, token, rejected.instagram),
      })
    }
  } catch (err) {
    console.error('[hq] listing Instagram reels failed:', err instanceof Error ? err.message : err)
  }

  try {
    const acc = account
    for (const r of await listFbReels(acc, since, token)) {
      targets.push({
        platform: 'facebook',
        mediaId: r.id,
        permalink: r.permalink_url
          ? r.permalink_url.startsWith('http')
            ? r.permalink_url
            : `https://www.facebook.com${r.permalink_url}`
          : null,
        caption: clip(r.description),
        publishedAt: new Date(r.created_time!),
        durationSec: typeof r.length === 'number' ? r.length : null,
        read: () => fbReelInsights(r.id, acc, token, rejected.facebook),
      })
    }
  } catch (err) {
    console.error('[hq] listing Facebook reels failed:', err instanceof Error ? err.message : err)
  }

  let saved = 0
  for (const t of targets) {
    try {
      saved += await measure(payload, t, lite, now)
    } catch (err) {
      console.error(`[hq] ${t.platform} reel ${t.mediaId} stats failed:`, err instanceof Error ? err.message : err)
    }
  }
  return { reels: targets.length, saved }
}

/* ------------------------------------------------------------------------ */
/* Ratios for the report                                                    */
/* ------------------------------------------------------------------------ */

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places

/**
 * Two numbers worth comparing across reels: average watch as a share of the
 * reel's length (only when the length is known — Instagram does not give it,
 * so an Instagram reel borrows its Facebook twin's when the same draft went to
 * both), and shares per person reached. Watch times are read as milliseconds:
 * documented for Facebook, assumed for Instagram (see lib/metaGraph.ts).
 */
export function reelRatios(
  platform: string,
  metrics: Record<string, number>,
  durationSec: number | null | undefined,
): { avgWatchPctOfLength: number | null; sharesPerReach: number | null } {
  const avgMs = platform === 'facebook' ? metrics.post_video_avg_time_watched : metrics.ig_reels_avg_watch_time
  const shares = platform === 'facebook' ? metrics['post_video_social_actions.share'] : metrics.shares
  const reach = platform === 'facebook' ? metrics.post_impressions_unique : metrics.reach
  return {
    avgWatchPctOfLength:
      durationSec && durationSec > 0 && typeof avgMs === 'number' ? round((avgMs / 1000 / durationSec) * 100, 1) : null,
    sharesPerReach: typeof shares === 'number' && reach ? round(shares / reach, 4) : null,
  }
}
