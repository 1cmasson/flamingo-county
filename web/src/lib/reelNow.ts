import {
  discoverAccount,
  fbReelInsights,
  graphConfigured,
  igReelInsights,
  listFbReels,
  listIgReels,
  type Reading,
} from './metaGraph'

/**
 * A reel's numbers right now, straight from Meta's Graph API, for the
 * `hqReelNow` MCP tool. lib/reelStats.ts reads each reel only at fixed ages
 * (1h, 3h, 24h, 3d, 7d) and saves those rows; between them, and for a reel
 * that went up before the token was live, HQ had nothing to show. This reads
 * on demand and saves nothing, so it never fills or moves a checkpoint.
 *
 * The token stays on the server: the caller gets numbers only, never the
 * token, a Graph URL or a Page token. Same account guard as the collector
 * (`discoverAccount`): only Flamingo County / @flamingo.county is read.
 */

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

/** Reels read per call, newest first: each costs one insights call. */
export const REEL_NOW_MAX = 12

/** An Instagram reel and its Facebook twin go out within minutes of each other: close enough to borrow the length. */
const TWIN_MS = 15 * MINUTE

export type ReelNowArgs = {
  days?: number
  /** Words that must appear in the caption, any case, e.g. "Corte Suprema". */
  query?: string
  platform?: 'instagram' | 'facebook' | 'both'
}

type Found = {
  platform: 'instagram' | 'facebook'
  mediaId: string
  permalink: string | null
  caption: string
  publishedAt: Date
  lengthSec: number | null
  read: () => Promise<Reading | null>
}

const clip = (s: string | undefined, max = 140) => {
  const t = (s ?? '').trim().replace(/\s+/g, ' ')
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const round = (n: number, places = 1) => Math.round(n * 10 ** places) / 10 ** places

const miami = (d: Date) =>
  d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

/** Facebook names its share count `post_video_social_actions.SHARE` (upper case in practice). */
const pick = (m: Record<string, number>, ...keys: string[]) => {
  for (const k of keys) if (typeof m[k] === 'number') return m[k]
  return null
}

/**
 * Share of plays still watching at a few moments, from Facebook's retention
 * curve. Its keys are evenly spaced points across the reel (0…40 for a 70 s
 * and a 106 s reel alike, with the end-card drop at 38–40), not seconds, so a
 * moment in seconds needs the length; without it only the end is given. The
 * same reading as `retentionSummary` in lib/reelScore.ts.
 */
export function retentionAt(curve: unknown, lengthSec: number | null): Record<string, number> | null {
  if (!curve || typeof curve !== 'object') return null
  const pts = Object.entries(curve as Record<string, unknown>)
    .map(([k, v]) => [Number(k), typeof v === 'number' ? v : NaN] as const)
    .filter(([k, v]) => Number.isFinite(k) && Number.isFinite(v))
    .sort((a, b) => a[0] - b[0])
  if (!pts.length) return null
  const last = pts[pts.length - 1][0]
  const at = (s: number) => {
    const key = lengthSec && last ? (s / lengthSec) * last : null
    if (key === null) return null
    const p = pts.filter(([k]) => k <= key).at(-1)
    return p ? round(p[1] * 100, 1) : null
  }
  const out: Record<string, number> = {}
  const put = (key: string, v: number | null) => {
    if (v !== null) out[key] = v
  }
  if (lengthSec) {
    for (const s of [3, 15, 20, 30]) if (s <= lengthSec) put(`${s}s`, at(s))
    put('half', at(lengthSec / 2))
  }
  out.last = round(pts[pts.length - 1][1] * 100, 1)
  return out
}

/** One reading in plain units: seconds, percents, ratios. */
export function summarize(platform: 'instagram' | 'facebook', r: Reading, lengthSec: number | null) {
  const m = r.metrics
  const ig = platform === 'instagram'
  const avgMs = ig ? pick(m, 'ig_reels_avg_watch_time') : pick(m, 'post_video_avg_time_watched')
  const reach = ig ? pick(m, 'reach') : pick(m, 'post_total_media_view_unique', 'post_impressions_unique')
  const shares = ig ? pick(m, 'shares') : pick(m, 'post_video_social_actions.SHARE', 'post_video_social_actions.share')
  const avgWatchSec = avgMs === null ? null : round(avgMs / 1000, 1)
  return {
    views: ig ? pick(m, 'views') : pick(m, 'blue_reels_play_count'),
    reach,
    avgWatchSec,
    avgWatchPctOfLength: avgWatchSec !== null && lengthSec ? round((avgWatchSec / lengthSec) * 100, 1) : null,
    skipRatePct: ig ? pick(m, 'reels_skip_rate') : null,
    shares,
    sharesPerReach: shares !== null && reach ? round(shares / reach, 4) : null,
    saves: ig ? pick(m, 'saved') : null,
    likes: ig ? pick(m, 'likes') : pick(m, 'post_video_likes_by_reaction_type.REACTION_LIKE'),
    comments: ig ? pick(m, 'comments') : pick(m, 'post_video_social_actions.COMMENT', 'post_video_social_actions.comment'),
    follows: ig ? null : pick(m, 'post_video_followers'),
    stillWatchingPct: ig ? null : retentionAt(r.retention, lengthSec),
    metrics: m,
    refusedMetrics: r.failed.length ? r.failed : undefined,
  }
}

export async function reelsNow(args: ReelNowArgs = {}, now: Date = new Date()) {
  if (!graphConfigured()) return { ok: false as const, error: 'META_GRAPH_TOKEN is not set on the server, so Meta cannot be read.' }
  const token = process.env.META_GRAPH_TOKEN!.trim()
  const days = Math.min(Math.max(Number(args.days ?? 3) || 3, 1), 30)
  const platform = args.platform ?? 'both'
  const since = new Date(now.getTime() - days * DAY)

  const account = await discoverAccount(token)
  if (!account) return { ok: false as const, error: 'The token reaches no single Flamingo County Page with @flamingo.county attached.' }

  const rejected = { instagram: new Set<string>(), facebook: new Set<string>() }
  const found: Found[] = []
  const problems: string[] = []

  // Facebook first even when only Instagram is asked for: its reels carry the length an Instagram reel lacks.
  let fb: Found[] = []
  try {
    fb = (await listFbReels(account, since, token)).map((r) => ({
      platform: 'facebook' as const,
      mediaId: r.id,
      permalink: r.permalink_url
        ? r.permalink_url.startsWith('http')
          ? r.permalink_url
          : `https://www.facebook.com${r.permalink_url}`
        : null,
      caption: r.description ?? '',
      publishedAt: new Date(r.created_time!),
      lengthSec: typeof r.length === 'number' ? r.length : null,
      read: () => fbReelInsights(r.id, account, token, rejected.facebook),
    }))
  } catch (err) {
    problems.push(`Facebook reels: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (platform !== 'facebook') {
    try {
      for (const m of await listIgReels(account, since, token)) {
        const at = new Date(m.timestamp)
        const twin = fb
          .filter((f) => f.lengthSec && Math.abs(f.publishedAt.getTime() - at.getTime()) <= TWIN_MS)
          .sort((a, b) => Math.abs(a.publishedAt.getTime() - at.getTime()) - Math.abs(b.publishedAt.getTime() - at.getTime()))[0]
        found.push({
          platform: 'instagram',
          mediaId: m.id,
          permalink: m.permalink ?? null,
          caption: m.caption ?? '',
          publishedAt: at,
          lengthSec: twin?.lengthSec ?? null,
          read: () => igReelInsights(m.id, token, rejected.instagram),
        })
      }
    } catch (err) {
      problems.push(`Instagram reels: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (platform !== 'instagram') found.push(...fb)

  const q = args.query?.trim() ? fold(args.query.trim()) : null
  const matching = found
    .filter((f) => !q || fold(f.caption).includes(q))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
  const picked = matching.slice(0, REEL_NOW_MAX)

  const reels = []
  for (const f of picked) {
    const base = {
      platform: f.platform,
      mediaId: f.mediaId,
      permalink: f.permalink,
      caption: clip(f.caption),
      publishedMiami: miami(f.publishedAt),
      ageHours: round((now.getTime() - f.publishedAt.getTime()) / (60 * MINUTE), 1),
      lengthSec: f.lengthSec,
    }
    try {
      const reading = await f.read()
      reels.push(reading ? { ...base, ...summarize(f.platform, reading, f.lengthSec) } : { ...base, note: 'Meta has no numbers for it yet.' })
    } catch (err) {
      reels.push({ ...base, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return {
    ok: true as const,
    readAt: now.toISOString(),
    days,
    query: args.query ?? null,
    matched: matching.length,
    shown: reels.length,
    note:
      'Live from Meta, saved nowhere. Watch times are seconds. Meta says reel numbers can lag up to 48 hours, so early readings rise. Instagram gives no length; lengthSec is borrowed from the Facebook twin posted within 15 minutes, when there is one.',
    problems: problems.length ? problems : undefined,
    reels,
  }
}
