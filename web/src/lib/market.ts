import type { Payload } from 'payload'

import type { HqMarketAccount, HqMarketPost } from '../payload-types'
import { IG_USERNAME, businessDiscovery, isNotProfessional, type BdMedia } from './metaAccount'
import {
  FLAMINGO_IG_USERNAME,
  GraphError,
  graphUsagePct,
  isPermissionError,
  isRateLimited,
  type GraphAccount,
} from './metaGraph'

/**
 * The market collector: what other Miami accounts post and how it does,
 * through Meta's Business Discovery (lib/metaAccount.ts), so HQ can see which
 * of their posts beat their own usual at the same age. The watchlist is
 * `hq-market-accounts`; posts land in `hq-market-posts`.
 *
 * Captions, public counts and permalinks only. Pictures and videos are never
 * asked for, downloaded or stored.
 *
 * Rate limits. Each account is one request (its profile and last 25 media
 * together), once a day. Business Discovery allows 1,000 queries per user per
 * hour (changelog, 2026-03-30), but every call also spends the Instagram
 * Business Use Case budget, 4,800 × the account's impressions per 24 hours
 * (https://developers.facebook.com/docs/graph-api/overview/rate-limiting) —
 * small for a young account. So a run reads at most 60 accounts, oldest
 * reading first, a second apart, and stops as soon as a reply's usage header
 * passes 75% or Graph answers with a throttling code (4, 17, 32, 613, 80002).
 * Whatever was not read waits for the next hourly run.
 */

const MIN = 60 * 1000
const HOUR = 60 * MIN

/** Re-read an account after this long; the hourly job therefore reads each about once a day. */
export const MARKET_RECHECK_HOURS = 20
/** An account that is not a business or creator account is tried again weekly: it may switch. */
export const NOT_PROFESSIONAL_RECHECK_HOURS = 7 * 24
export const MARKET_MEDIA_LIMIT = 25
export const MARKET_MAX_ACCOUNTS_PER_RUN = 60
export const MARKET_STOP_AT_USAGE_PCT = 75
export const MARKET_PAUSE_MS = 1000

/**
 * Ages a post is compared at, first-wins like REEL_CHECKPOINTS: a daily
 * reading lands somewhere in each window, and a missed day still leaves a
 * second chance before it closes. No two windows overlap.
 */
export const MARKET_BUCKETS = [
  { key: '24h', fromHours: 24, untilHours: 72 },
  { key: '7d', fromHours: 168, untilHours: 216 },
] as const
export type MarketBucket = (typeof MARKET_BUCKETS)[number]['key']

export function dueMarketBucket(ageHours: number, taken: Set<string>): MarketBucket | null {
  const b = MARKET_BUCKETS.find((b) => ageHours >= b.fromHours && ageHours < b.untilHours)
  return b && !taken.has(b.key) ? b.key : null
}

export type Snapshot = {
  bucket: 'first' | MarketBucket
  at: string
  ageHours: number
  likes: number | null
  comments: number | null
  views: number | null
  followers: number | null
}

/* ------------------------------------------------------------------------ */
/* Outlier score                                                             */
/* ------------------------------------------------------------------------ */

/** The pool a post is compared within: its account's latest posts. */
export const OUTLIER_POOL = 30
export const OUTLIER_MIN_PEERS = 3

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places

export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const interactions = (s: Snapshot) => (s.likes === null || s.comments === null ? null : s.likes + s.comments)

/** Views when the post has them (reels), likes + comments otherwise. One basis per comparison. */
function basisOf(s: Snapshot): { basis: 'views' | 'interactions'; value: number | null } {
  return s.views !== null ? { basis: 'views', value: s.views } : { basis: 'interactions', value: interactions(s) }
}

export type ScoredPost = { id: string | number; postedAt: string; snapshots: Snapshot[] }
export type Score = {
  outlierScore: number | null
  outlierBucket: MarketBucket | null
  outlierBasis: 'views' | 'interactions' | null
  engagementPerFollower: number | null
}

/**
 * Each post against the median of the other posts in its account's latest
 * `OUTLIER_POOL`, at the same age bucket and on the same basis (a reel's views
 * are compared with other reels' views, a photo's likes + comments with other
 * posts' likes + comments). The furthest bucket with at least
 * `OUTLIER_MIN_PEERS` peers wins: 7d before 24h. The first-seen reading is
 * never used: its age is whatever it happened to be.
 */
export function scorePosts(posts: ScoredPost[]): Map<string | number, Score> {
  const pool = [...posts].sort((a, b) => b.postedAt.localeCompare(a.postedAt)).slice(0, OUTLIER_POOL)
  const at = (p: ScoredPost, bucket: MarketBucket) => p.snapshots.find((s) => s.bucket === bucket)
  const out = new Map<string | number, Score>()
  for (const p of pool) {
    let score: Score = { outlierScore: null, outlierBucket: null, outlierBasis: null, engagementPerFollower: null }
    for (const bucket of ['7d', '24h'] as const) {
      const mine = at(p, bucket)
      if (!mine) continue
      const { basis, value } = basisOf(mine)
      if (value === null) continue
      const peers = pool
        .filter((q) => q.id !== p.id)
        .map((q) => at(q, bucket))
        .filter((s): s is Snapshot => !!s)
        .map(basisOf)
        .filter((b) => b.basis === basis && b.value !== null)
        .map((b) => b.value as number)
      if (peers.length < OUTLIER_MIN_PEERS) continue
      const med = median(peers)
      score = {
        outlierScore: med ? round(value / med, 2) : null,
        outlierBucket: bucket,
        outlierBasis: basis,
        engagementPerFollower: perFollower(mine),
      }
      break
    }
    if (score.engagementPerFollower === null) {
      const latest = p.snapshots[p.snapshots.length - 1]
      if (latest) score.engagementPerFollower = perFollower(latest)
    }
    out.set(p.id, score)
  }
  return out
}

function perFollower(s: Snapshot): number | null {
  const i = interactions(s)
  return i !== null && s.followers ? round(i / s.followers, 5) : null
}

/* ------------------------------------------------------------------------ */
/* The collector                                                             */
/* ------------------------------------------------------------------------ */

const clip = (s: string | undefined, max: number) => {
  const t = (s ?? '').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}
const num = (v: unknown) => (typeof v === 'number' ? v : null)
const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve())
const detail = (err: unknown) =>
  err instanceof GraphError
    ? `Graph ${err.code ?? '?'}${err.subcode ? `/${err.subcode}` : ''}: ${err.message}`.slice(0, 300)
    : String(err).slice(0, 300)

export type MarketDeps = {
  pauseMs?: number
  isRefused?: (feature: string, now: Date) => boolean
  noteMissingScope?: (payload: Payload, feature: string, scope: string, err: unknown, now?: Date) => Promise<void>
}

/** The watchlist accounts due a reading, oldest reading first. */
async function dueAccounts(payload: Payload, now: Date): Promise<HqMarketAccount[]> {
  const res = await payload.find({
    collection: 'hq-market-accounts',
    where: { active: { equals: true } },
    sort: 'checkedAt',
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  const ageH = (a: HqMarketAccount) => (a.checkedAt ? (now.getTime() - new Date(a.checkedAt).getTime()) / HOUR : Infinity)
  return res.docs
    .filter((a) => ageH(a) >= (a.status === 'not_professional' ? NOT_PROFESSIONAL_RECHECK_HOURS : MARKET_RECHECK_HOURS))
    .sort((a, b) => ageH(b) - ageH(a))
    .slice(0, MARKET_MAX_ACCOUNTS_PER_RUN)
}

async function mark(payload: Payload, id: number, data: Partial<HqMarketAccount>) {
  await payload.update({ collection: 'hq-market-accounts', id, data, overrideAccess: true })
}

/** Save one account's media, then rescore its latest posts. Returns how many posts were written. */
async function savePosts(payload: Payload, acc: HqMarketAccount, media: BdMedia[], followers: number | null, now: Date) {
  if (!media.length) return 0
  const existing = await payload.find({
    collection: 'hq-market-posts',
    where: { mediaId: { in: media.map((m) => m.id) } },
    limit: media.length,
    depth: 0,
    overrideAccess: true,
  })
  const byId = new Map(existing.docs.map((p) => [p.mediaId, p]))
  let written = 0
  for (const m of media) {
    const posted = new Date(m.timestamp)
    if (Number.isNaN(posted.getTime())) continue
    const ageHours = round((now.getTime() - posted.getTime()) / HOUR, 1)
    const prev = byId.get(m.id)
    const snapshots = [...((prev?.snapshots as Snapshot[] | null) ?? [])]
    const reading = (bucket: Snapshot['bucket']): Snapshot => ({
      bucket,
      at: now.toISOString(),
      ageHours,
      likes: num(m.like_count),
      comments: num(m.comments_count),
      views: num(m.view_count),
      followers,
    })
    if (!snapshots.some((s) => s.bucket === 'first')) snapshots.push(reading('first'))
    const due = dueMarketBucket(ageHours, new Set(snapshots.map((s) => s.bucket)))
    if (due) snapshots.push(reading(due))

    const data = {
      account: acc.id,
      username: acc.username,
      mediaId: m.id,
      permalink: m.permalink ?? undefined,
      postedAt: posted.toISOString(),
      mediaType: m.media_type ?? undefined,
      productType: m.media_product_type ?? undefined,
      caption: clip(m.caption, 2200),
      likes: num(m.like_count),
      comments: num(m.comments_count),
      views: num(m.view_count),
      followersAtFetch: followers,
      lastSeenAt: now.toISOString(),
      snapshots: snapshots as never,
    }
    if (prev) await payload.update({ collection: 'hq-market-posts', id: prev.id, data, overrideAccess: true })
    else await payload.create({ collection: 'hq-market-posts', data: { ...data, firstSeenAt: now.toISOString() }, overrideAccess: true })
    written++
  }

  const pool = await payload.find({
    collection: 'hq-market-posts',
    where: { account: { equals: acc.id } },
    sort: '-postedAt',
    limit: OUTLIER_POOL,
    depth: 0,
    overrideAccess: true,
  })
  const scores = scorePosts(
    pool.docs.map((p: HqMarketPost) => ({ id: p.id, postedAt: p.postedAt ?? '', snapshots: (p.snapshots as Snapshot[] | null) ?? [] })),
  )
  for (const p of pool.docs) {
    const s = scores.get(p.id)
    if (!s) continue
    if (
      s.outlierScore === (p.outlierScore ?? null) &&
      s.outlierBucket === (p.outlierBucket ?? null) &&
      s.outlierBasis === (p.outlierBasis ?? null) &&
      s.engagementPerFollower === (p.engagementPerFollower ?? null)
    )
      continue
    await payload.update({ collection: 'hq-market-posts', id: p.id, data: s, overrideAccess: true })
  }
  return written
}

/**
 * Read every watchlist account that is due, within the limits above. Refuses,
 * whatever the list says, @flamingo.county itself and every other account the
 * token manages (`managedOthers`: Club de la Amistad's).
 */
export async function collectMarket(
  payload: Payload,
  account: GraphAccount,
  token: string,
  managedOthers: string[],
  now: Date = new Date(),
  deps: MarketDeps = {},
): Promise<{ checked: number; posts: number; stopped: string | null }> {
  const result = { checked: 0, posts: 0, stopped: null as string | null }
  if (deps.isRefused?.('business_discovery', now)) return { ...result, stopped: 'permission' }
  const refused = new Set([FLAMINGO_IG_USERNAME, ...managedOthers.map((u) => u.toLowerCase())])
  const pause = deps.pauseMs ?? MARKET_PAUSE_MS

  const due = await dueAccounts(payload, now)
  for (const [i, acc] of due.entries()) {
    const username = (acc.username ?? '').toLowerCase()
    if (refused.has(username)) {
      await mark(payload, acc.id, {
        status: 'refused',
        checkedAt: now.toISOString(),
        statusDetail:
          username === FLAMINGO_IG_USERNAME ? 'Our own account: its numbers come from the insights jobs.' : 'An account our Meta token manages, not ours: never read.',
      })
      continue
    }
    if (!IG_USERNAME.test(username)) {
      await mark(payload, acc.id, { status: 'error', checkedAt: now.toISOString(), statusDetail: 'Not a valid Instagram username.' })
      continue
    }
    if (graphUsagePct() >= MARKET_STOP_AT_USAGE_PCT) {
      result.stopped = `usage ${graphUsagePct()}%`
      break
    }
    if (i > 0) await sleep(pause)

    try {
      const bd = await businessDiscovery(account, token, username, MARKET_MEDIA_LIMIT)
      const followers = num(bd.followers_count)
      await mark(payload, acc.id, {
        status: 'ok',
        checkedAt: now.toISOString(),
        statusDetail: bd.viewsRefused ? 'view_count refused by Graph; read without views.' : '',
        name: bd.name ?? undefined,
        followersCount: followers ?? undefined,
        mediaCount: num(bd.media_count) ?? undefined,
      })
      result.checked++
      result.posts += await savePosts(payload, acc, bd.media, followers, now)
    } catch (err) {
      if (isRateLimited(err)) {
        result.stopped = detail(err)
        break
      }
      if (isPermissionError(err)) {
        await deps.noteMissingScope?.(
          payload,
          'business_discovery',
          'instagram_basic + instagram_manage_insights + pages_read_engagement (and ads_read if the Page role comes from Business Manager)',
          err,
          now,
        )
        result.stopped = 'permission'
        break
      }
      if (err instanceof GraphError && err.code === 190) throw err // the token itself is bad: every account would fail
      await mark(payload, acc.id, {
        status: isNotProfessional(err) ? 'not_professional' : 'error',
        checkedAt: now.toISOString(),
        statusDetail: detail(err),
      })
      result.checked++
    }
  }
  if (result.stopped && result.stopped !== 'permission') console.error(`[hq] market collector stopped early: ${result.stopped}`)
  return result
}

/* ------------------------------------------------------------------------ */
/* For the growth review                                                     */
/* ------------------------------------------------------------------------ */

/** The watchlist's posts of the last `days` that beat their account's usual by the most. */
export async function marketOutliers(payload: Payload, days = 14, now: Date = new Date(), limit = 15) {
  const res = await payload.find({
    collection: 'hq-market-posts',
    where: {
      and: [{ postedAt: { greater_than: new Date(now.getTime() - days * 24 * HOUR).toISOString() } }, { outlierScore: { exists: true } }],
    },
    sort: '-outlierScore',
    limit,
    depth: 0,
    overrideAccess: true,
    select: {
      username: true,
      permalink: true,
      postedAt: true,
      productType: true,
      caption: true,
      outlierScore: true,
      outlierBucket: true,
      outlierBasis: true,
      engagementPerFollower: true,
      views: true,
      likes: true,
      comments: true,
    },
  })
  return res.docs.map((p) => ({
    username: p.username,
    permalink: p.permalink ?? null,
    postedAt: p.postedAt ?? null,
    productType: p.productType ?? null,
    caption: clip(p.caption ?? '', 200),
    outlierScore: p.outlierScore ?? null,
    outlierBucket: p.outlierBucket ?? null,
    outlierBasis: p.outlierBasis ?? null,
    engagementPerFollower: p.engagementPerFollower ?? null,
    views: p.views ?? null,
    likes: p.likes ?? null,
    comments: p.comments ?? null,
  }))
}
