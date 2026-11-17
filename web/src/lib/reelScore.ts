import type { Payload } from 'payload'

import type { HqExperiment, HqSocialDraft, HqSocialStat } from '../payload-types'
import { miamiTime } from './hq'
import { REEL_CHECKPOINTS, reelRatios } from './reelStats'

/**
 * The 72-hour reel scorer: station 4 of the learning loop
 * (content-marketing-system/LEARNING-LOOP.md). Once a draft's reels have their
 * 3d reading in `hq-social-stats` (lib/reelStats.ts), this scores each
 * language cut against the account's own history and against its EN/ES twin,
 * and writes one post-mortem per story to `hq-reel-reviews`.
 *
 * Internal only (owner, 2026-10-20). It reads saved rows and writes notes:
 * no network call, no post, no Telegram, no `hq-events` row (so nothing new
 * in the brief). The one other write is appending the numbers to the `result`
 * of an `hq-experiments` row that names the draft — after what is there, once,
 * with `verdict` and `status` left alone: judging a rule stays with the
 * growth review and Carlos (story-rules section 6).
 *
 * Nothing happens without data: a draft whose reels have no 3d reading is not
 * reviewed, whatever its age.
 *
 * Two sources (2026-11-04). Meta Graph `reel` rows (lib/reelStats.ts) carry
 * watch time, skip rate and Facebook retention, but they stopped on Nov 2 when
 * the Facebook lock broke META_GRAPH_TOKEN. Postiz `post` rows (lib/socialStats.ts,
 * 24h/3d/7d) keep coming through Postiz Cloud for Instagram and TikTok: views,
 * reach (Instagram only), likes, comments, shares, saves. A cut uses its Graph
 * row when there is one and its Postiz row otherwise; what Postiz lacks stays
 * null. TikTok has no reach, so its ratios are per view and say so.
 *
 * Not here yet (stations 2 and 3): the reel card and the locked forecast. The
 * review says so rather than inventing either; when they exist they join here.
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** The reading scored. A 24h number is a first look; Lukumí was called a failure at 4 h and was not one. */
export const SCORED_CHECKPOINT = '3d'
const WINDOW = REEL_CHECKPOINTS.find((c) => c.key === SCORED_CHECKPOINT)!
/** A cut can be scored from 72 h, when its 3d reading can first exist… */
const READY_MS = WINDOW.from * MINUTE
/** …and is scored with whatever there is once the 3d window has closed (120 h), so a reading Graph never gave cannot hold a review back forever. */
const CLOSED_MS = WINDOW.until * MINUTE
/** Drafts older than this are not looked at: past the window, plus slack for a stopped server. */
const LOOKBACK_MS = 14 * DAY

/**
 * The baseline: the account's previous reels of the same pillar, read at the
 * same checkpoint, on the same platform — the last `BASELINE_REELS` of them
 * from the last `BASELINE_DAYS` days. Rolling, so a reel is held to the
 * account it was posted into, not the one of two months earlier. Only reels
 * matched to a draft count, because only a draft has a pillar; a reel posted
 * straight in Postiz is in `hqSocialReport`'s `otherReels`, not here.
 */
export const BASELINE_REELS = 20
const BASELINE_DAYS = 90

/**
 * How the Spanish and English cuts of one story are found, since a draft has
 * no story field. Story reels are drafted as a pair in one go — on the live
 * data the two drafts are created under a second apart and go out an hour
 * apart (drafts 189/190 and 194/195, Oct 20–21). Two drafts are a pair when:
 * - both are scheduled or published (a rejected first try of the same pair,
 *   like 192/193, is not a cut that ran);
 * - they have the same pillar, one is `es` and the other `en`;
 * - they were created within `PAIR_CREATED_MS` and go out within
 *   `PAIR_PUBLISH_MS` of each other;
 * - and each is the only such draft for the other. Two candidates is a guess,
 *   and a guess is worse than a single-cut review (the same stance as
 *   `matchDraft` in lib/reelStats.ts).
 * A `both` draft, or one without a pillar or language, stands alone.
 */
export const PAIR_CREATED_MS = 5 * MINUTE
export const PAIR_PUBLISH_MS = 2 * HOUR

const LIVE = ['scheduled', 'published']

/* ------------------------------------------------------------------------ */
/* The numbers                                                              */
/* ------------------------------------------------------------------------ */

export const SCORE_METRICS = [
  'views',
  'reach',
  'avgWatchSec',
  'avgWatchPct',
  'skipRate',
  'sharesPerReach',
  'savesPerReach',
  'likesPerReach',
] as const
export type ScoreMetric = (typeof SCORE_METRICS)[number]
export type CutMetrics = Record<ScoreMetric, number | null>

/** Lower is better for these; every other metric, higher is. */
export const LOWER_IS_BETTER: ScoreMetric[] = ['skipRate']

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const per = (part: number | null, reach: number | null) => (part !== null && reach ? round(part / reach, 4) : null)

/**
 * One reel's numbers at one reading, in the same units on both platforms.
 * Meta's names differ by platform: Facebook's reach is
 * `post_impressions_unique`, its shares `post_video_social_actions.share`, its
 * likes the sum of `post_video_likes_by_reaction_type.*`, and it has no saves
 * or skip rate — those stay null, never 0. Watch times are milliseconds (see
 * lib/metaGraph.ts); `avgWatchPct` needs the length, which only Facebook gives,
 * so an Instagram cut borrows its own draft's Facebook length.
 */
export function cutMetrics(platform: string, metrics: Record<string, number>, durationSec: number | null): CutMetrics {
  const fb = platform === 'facebook'
  const reach = num(fb ? metrics.post_impressions_unique : metrics.reach)
  const avgMs = num(fb ? metrics.post_video_avg_time_watched : metrics.ig_reels_avg_watch_time)
  let likes: number | null = null
  if (fb) {
    const reactions = Object.entries(metrics).filter(([k]) => k.startsWith('post_video_likes_by_reaction_type.'))
    likes = reactions.length ? reactions.reduce((sum, [, v]) => sum + (num(v) ?? 0), 0) : null
  } else {
    likes = num(metrics.likes)
  }
  return {
    views: num(fb ? (metrics.fb_reels_total_plays ?? metrics.blue_reels_play_count) : metrics.views),
    reach,
    avgWatchSec: avgMs !== null ? round(avgMs / 1000, 1) : null,
    avgWatchPct: reelRatios(platform, metrics, durationSec).avgWatchPctOfLength,
    skipRate: fb ? null : num(metrics.reels_skip_rate),
    sharesPerReach: reelRatios(platform, metrics, durationSec).sharesPerReach,
    savesPerReach: fb ? null : per(num(metrics.saved), reach),
    likesPerReach: per(likes, reach),
  }
}

type Summary = Record<string, { latest?: number; sum?: number } | number>

/** A Postiz label's latest value, matched loosely (labels differ by platform and may change). */
function pick(summary: Summary, re: RegExp): number | null {
  for (const [label, v] of Object.entries(summary ?? {})) {
    if (!re.test(label)) continue
    const n = typeof v === 'number' ? v : (v?.latest ?? null)
    if (typeof n === 'number' && Number.isFinite(n)) return n
  }
  return null
}

/**
 * One cut's numbers from a Postiz `post` row (lib/socialStats.ts `summarizeMetrics`).
 * Instagram gives Views, Reach, Likes, Comments, Shares, Saves (checked against the
 * Graph rows of the same reels, 2026-11-04: same values). TikTok has no reach, so
 * its ratios divide by views instead. Postiz has no watch time or skip rate: null.
 */
export function postizCutMetrics(platform: string, summary: Summary): CutMetrics {
  const views = pick(summary, /^(views?|video views|plays)$/i)
  const reach = platform === 'tiktok' ? null : pick(summary, /^reach$/i)
  const base = reach ?? (platform === 'tiktok' ? views : null)
  return {
    views,
    reach,
    avgWatchSec: null,
    avgWatchPct: null,
    skipRate: null,
    sharesPerReach: per(pick(summary, /shares?$/i), base),
    savesPerReach: per(pick(summary, /^(saves|saved)$/i), base),
    likesPerReach: per(pick(summary, /likes$/i), base),
  }
}

/** A row's numbers, whichever source it came from. */
function rowMetrics(r: StatRow, length: number | null): CutMetrics {
  return r.src === 'postiz'
    ? postizCutMetrics(r.platform, r.metrics as Summary)
    : cutMetrics(r.platform, r.metrics as Record<string, number>, r.durationSec ?? length)
}

/**
 * Graph and Postiz rows together, one per draft, platform and checkpoint:
 * the Graph row when both exist (it has watch time and skip rate).
 */
export function preferGraph(rows: StatRow[]): StatRow[] {
  const key = (r: StatRow) => `${idOf(r.draft)}|${r.platform}|${r.checkpoint}`
  const graph = new Set(rows.filter((r) => r.src !== 'postiz').map(key))
  return rows.filter((r) => r.src !== 'postiz' || !graph.has(key(r)))
}

/**
 * The middle value. Reel numbers are heavy-tailed — one Bezos-sized hit would
 * drag a mean for months — so every comparison here is against a median, and
 * read as a ratio (a multiplicative, log-scale distance), never a difference.
 */
export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export type VsMedian = { value: number | null; median: number | null; n: number; ratio: number | null }

/** `value` over the baseline's median, with the baseline's size. No ratio against nothing or against a zero median. */
export function vsMedian(value: number | null, baseline: (number | null)[]): VsMedian {
  const known = baseline.filter((v): v is number => v !== null)
  const m = median(known)
  return {
    value,
    median: m === null ? null : round(m, 4),
    n: known.length,
    ratio: value !== null && m ? round(value / m, 2) : null,
  }
}

/* ------------------------------------------------------------------------ */
/* Where they left                                                          */
/* ------------------------------------------------------------------------ */

export type RetentionSummary = {
  /** % of plays still watching. `at3s` and `at15s` need the length; null when the reel is shorter. */
  at3s: number | null
  at15s: number | null
  atHalf: number | null
  /** The steepest fall between two points of the curve, in percentage points, and where it is. */
  steepestDrop: { points: number; fromSec: number | null; toSec: number | null; fromPctOfLength: number; toPctOfLength: number } | null
}

/**
 * Facebook's `post_video_retention_graph` → the three numbers the post-mortem
 * leads with. Meta documents it only as the share of viewers "at each
 * interval"; it arrives as `{ "0": 1, "1": 0.93, … }`. Read here as evenly
 * spaced points across the reel's length (key i of N at i/N of the way
 * through) — the documented reading, not seconds — and as fractions, or
 * percentages when any value is above 1.5. Confirm both against the first
 * live reading of a reel whose length is known, as with the watch-time unit.
 */
export function retentionSummary(curve: unknown, durationSec: number | null): RetentionSummary | null {
  if (!curve || typeof curve !== 'object') return null
  const entries = (Array.isArray(curve) ? curve.map((v, i) => [i, v] as const) : Object.entries(curve))
    .map(([k, v]) => [Number(k), num(v)] as const)
    .filter((e): e is readonly [number, number] => Number.isFinite(e[0]) && e[1] !== null)
    .sort((a, b) => a[0] - b[0])
  if (entries.length < 2) return null
  const scale = entries.some(([, v]) => v > 1.5) ? 1 : 100
  const last = entries[entries.length - 1][0]
  const points = entries.map(([k, v]) => ({ at: k / last, pct: v * scale }))

  const at = (fraction: number): number | null => {
    if (fraction < 0 || fraction > 1) return null
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]
      const b = points[i]
      if (fraction <= b.at) return round(a.pct + ((b.pct - a.pct) * (fraction - a.at)) / (b.at - a.at || 1), 1)
    }
    return round(points[points.length - 1].pct, 1)
  }
  const known = durationSec && durationSec > 0 ? durationSec : null

  let steepest: RetentionSummary['steepestDrop'] = null
  for (let i = 1; i < points.length; i++) {
    const fall = points[i - 1].pct - points[i].pct
    if (fall > 0 && (!steepest || fall > steepest.points)) {
      steepest = {
        points: round(fall, 1),
        fromSec: known ? round(points[i - 1].at * known, 1) : null,
        toSec: known ? round(points[i].at * known, 1) : null,
        fromPctOfLength: round(points[i - 1].at * 100, 1),
        toPctOfLength: round(points[i].at * 100, 1),
      }
    }
  }
  return {
    at3s: known ? at(3 / known) : null,
    at15s: known ? at(15 / known) : null,
    atHalf: at(0.5),
    steepestDrop: steepest,
  }
}

/* ------------------------------------------------------------------------ */
/* Pairing                                                                  */
/* ------------------------------------------------------------------------ */

export type PairDraft = Pick<HqSocialDraft, 'id' | 'status' | 'pillar' | 'language' | 'createdAt' | 'publishAt'> &
  Partial<Pick<HqSocialDraft, 'platforms' | 'media'>>

const ms = (d: string | null | undefined) => (d ? new Date(d).getTime() : NaN)

/** Same platforms: an Instagram draft never pairs with a TikTok one drafted in the same batch. */
const samePlatforms = (a: PairDraft, b: PairDraft) =>
  [...(a.platforms ?? [])].sort().join() === [...(b.platforms ?? [])].sort().join()

function twins(d: PairDraft, all: PairDraft[]): PairDraft[] {
  if (!d.pillar || !LIVE.includes(d.status ?? '') || (d.language !== 'es' && d.language !== 'en')) return []
  return all.filter(
    (o) =>
      o.id !== d.id &&
      samePlatforms(o, d) &&
      LIVE.includes(o.status ?? '') &&
      o.pillar === d.pillar &&
      (o.language === 'es' || o.language === 'en') &&
      o.language !== d.language &&
      Math.abs(ms(o.createdAt) - ms(d.createdAt)) <= PAIR_CREATED_MS &&
      Math.abs(ms(o.publishAt) - ms(d.publishAt)) <= PAIR_PUBLISH_MS,
  )
}

/** Drafts → stories: pairs by the rule above, everything else alone. Each group sorted by id. */
export function pairDrafts(drafts: PairDraft[]): PairDraft[][] {
  const used = new Set<number>()
  const groups: PairDraft[][] = []
  for (const d of [...drafts].sort((a, b) => a.id - b.id)) {
    if (used.has(d.id)) continue
    const mine = twins(d, drafts)
    const other = mine.length === 1 ? mine[0] : null
    const mutual = other && !used.has(other.id) && twins(other, drafts).length === 1
    const group = mutual ? [d, other] : [d]
    for (const g of group) used.add(g.id)
    groups.push(group)
  }
  return groups
}

/* ------------------------------------------------------------------------ */
/* The review                                                               */
/* ------------------------------------------------------------------------ */

type Platform = 'instagram' | 'tiktok' | 'facebook'
const PLATFORM_ORDER: Platform[] = ['instagram', 'tiktok', 'facebook']

export type Cut = {
  draft: number
  language: string | null
  platform: Platform
  permalink: string | null
  ageMinutes: number | null
  durationSec: number | null
  metrics: CutMetrics
  vsMedian: Record<ScoreMetric, VsMedian>
}

type StatRow = Pick<
  HqSocialStat,
  'id' | 'platform' | 'checkpoint' | 'ageMinutes' | 'draft' | 'permalink' | 'mediaPublishedAt' | 'durationSec' | 'metrics' | 'retention'
> & { src?: 'graph' | 'postiz' }

function idOf(v: unknown): number | null {
  return v && typeof v === 'object' ? (v as { id: number }).id : ((v as number) ?? null)
}
const isPlatform = (p: string): p is Platform => p === 'instagram' || p === 'tiktok' || p === 'facebook'

/** A draft's reel length, from any of its Facebook rows. */
function lengthOf(rows: StatRow[]): number | null {
  return rows.find((r) => r.durationSec)?.durationSec ?? null
}

export type ReadyState = { ready: boolean; complete: boolean; missing: string[] }

/**
 * Whether a story can be scored now. Every cut must be 72 hours old. Then
 * each platform a cut was measured on must have its 3d reading, or its 3d
 * window must have closed (scored without it, marked incomplete). A cut with
 * no reel rows at all waits for its own window to close. And at least one 3d
 * reading must exist: no data, no review.
 */
export function readiness(group: PairDraft[], rows: StatRow[], now: Date): ReadyState {
  const missing: string[] = []
  let ready = true
  if (!rows.some((r) => r.checkpoint === SCORED_CHECKPOINT)) return { ready: false, complete: false, missing }
  for (const d of group) {
    const age = now.getTime() - ms(d.publishAt)
    if (!(age >= READY_MS)) return { ready: false, complete: false, missing }
    const mine = rows.filter((r) => idOf(r.draft) === d.id)
    const platforms = [...new Set(mine.map((r) => r.platform))]
    if (!platforms.length) {
      missing.push(`#${d.id}: no reel matched`)
      if (age < CLOSED_MS) ready = false
    }
    for (const p of platforms) {
      if (mine.some((r) => r.platform === p && r.checkpoint === SCORED_CHECKPOINT)) continue
      const published = ms(mine.find((r) => r.platform === p)?.mediaPublishedAt) || ms(d.publishAt)
      missing.push(`#${d.id} ${p}: no 3d reading`)
      if (now.getTime() - published < CLOSED_MS) ready = false
    }
  }
  return { ready, complete: ready && !missing.length, missing }
}

export type PairComparison = Partial<
  Record<Platform, Partial<Record<ScoreMetric, { es: number | null; en: number | null; esOverEn: number | null }>>>
>

/** Spanish over English, metric by metric, on each platform both cuts were measured on. */
export function comparePair(cuts: Cut[]): PairComparison | null {
  const out: PairComparison = {}
  for (const p of PLATFORM_ORDER) {
    const es = cuts.find((c) => c.platform === p && c.language === 'es')
    const en = cuts.find((c) => c.platform === p && c.language === 'en')
    if (!es || !en) continue
    out[p] = Object.fromEntries(
      SCORE_METRICS.map((m) => {
        const a = es.metrics[m]
        const b = en.metrics[m]
        return [m, { es: a, en: b, esOverEn: a !== null && b ? round(a / b, 2) : null }]
      }),
    )
  }
  return Object.keys(out).length ? out : null
}

/* ------------------------------------------------------------------------ */
/* The text                                                                 */
/* ------------------------------------------------------------------------ */

const LABEL: Record<ScoreMetric, string> = {
  views: 'views',
  reach: 'reach',
  avgWatchSec: 'avg watch',
  avgWatchPct: 'watch % of length',
  skipRate: 'skip rate',
  sharesPerReach: 'shares/reach',
  savesPerReach: 'saves/reach',
  likesPerReach: 'likes/reach',
}

function show(m: ScoreMetric, v: number | null): string {
  if (v === null) return 'n/a'
  if (m === 'views' || m === 'reach') return Math.round(v).toLocaleString('en-US')
  if (m === 'avgWatchSec') return `${v} s`
  if (m === 'avgWatchPct' || m === 'skipRate') return `${v}%`
  return `${round(v * 100, 2)}%`
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
const name = (p: string) => (p === 'facebook' ? 'Facebook' : p === 'tiktok' ? 'TikTok' : 'Instagram')
/** TikTok's ratios are per view (it has no reach). */
const labelFor = (m: ScoreMetric, platform: string) =>
  platform === 'tiktok' && m.endsWith('PerReach') ? LABEL[m].replace('/reach', '/view') : LABEL[m]

export type ReviewText = {
  title: string
  pillar: string | null
  publishedAt: string | null
  cuts: Cut[]
  pair: PairComparison | null
  retention: { draft: number; language: string | null; summary: RetentionSummary }[]
  complete: boolean
  missing: string[]
  /** The same video on other platforms (shared HQ media), one line each. */
  sameVideo?: string[]
}

/** The post-mortem as text, in the shape of topics/lukumi-hialeah/RETENTION-NOTES.md: the numbers, the pair, where they left. */
export function reviewSummary(r: ReviewText): string {
  const lines: string[] = [
    r.title,
    `72-hour reading (3d). Baseline: the median of the account's previous ${r.pillar ?? 'unlabelled'} reels at 3d on the same platform (up to ${BASELINE_REELS}); 2.0x is twice the median, 0.5x half; for skip rate, lower is better. Numbers from Meta Graph where it still reads, otherwise Postiz (no watch time or skip rate).`,
    '',
  ]
  for (const c of r.cuts) {
    lines.push(`${name(c.platform)} · ${(c.language ?? '?').toUpperCase()} #${c.draft}${c.permalink ? ` · ${c.permalink}` : ''}`)
    const n = Math.max(0, ...SCORE_METRICS.map((m) => c.vsMedian[m].n))
    const parts = SCORE_METRICS.filter((m) => c.metrics[m] !== null).map((m) => {
      const v = c.vsMedian[m]
      return `${labelFor(m, c.platform)} ${show(m, c.metrics[m])}${v.ratio !== null ? ` (${v.ratio}x)` : ''}`
    })
    lines.push(`  ${parts.join(' · ') || 'no numbers'}${n ? ` — baseline n=${n}` : ' — no baseline yet'}`)
  }
  if (r.pair) {
    lines.push('', 'Spanish vs English (same story), ES/EN:')
    for (const p of PLATFORM_ORDER) {
      const cmp = r.pair[p]
      if (!cmp) continue
      const parts = SCORE_METRICS.filter((m) => cmp[m]?.esOverEn != null).map((m) => `${labelFor(m, p)} ${cmp[m]!.esOverEn}x`)
      lines.push(`  ${name(p)}: ${parts.join(' · ') || 'nothing comparable'}`)
    }
  }
  for (const t of r.retention) {
    const s = t.summary
    const bits = [
      s.at3s !== null ? `${s.at3s}% still watching at 3 s` : null,
      s.at15s !== null ? `${s.at15s}% at 15 s` : null,
      s.atHalf !== null ? `${s.atHalf}% at half` : null,
    ].filter(Boolean)
    const drop = s.steepestDrop ? describeDrop(s.steepestDrop) : null
    lines.push(
      '',
      `Where they left (Facebook ${(t.language ?? '?').toUpperCase()} #${t.draft}): ${[bits.join(', '), drop].filter(Boolean).join('; ')}.`,
    )
  }
  if (r.sameVideo?.length) lines.push('', 'The same video on another platform (3d):', ...r.sameVideo.map((l) => `  ${l}`))
  if (!r.complete && r.missing.length) lines.push('', `Incomplete, scored after the 3d window closed: ${r.missing.join('; ')}.`)
  lines.push('', 'No reel card or forecast in HQ yet: rules followed or broken, and forecast vs reality, are for the growth review.')
  return lines.join('\n')
}

function describeDrop(d: NonNullable<RetentionSummary['steepestDrop']>): string {
  const where =
    d.fromSec !== null && d.toSec !== null
      ? `${clock(d.fromSec)}–${clock(d.toSec)}`
      : `${d.fromPctOfLength}–${d.toPctOfLength}% of the length`
  return `steepest drop ${where} (−${d.points} pts)`
}

/* ------------------------------------------------------------------------ */
/* The job                                                                  */
/* ------------------------------------------------------------------------ */

const REEL_SELECT = {
  platform: true,
  checkpoint: true,
  ageMinutes: true,
  draft: true,
  permalink: true,
  mediaPublishedAt: true,
  durationSec: true,
  metrics: true,
  retention: true,
} as const

const POST_SELECT = { platform: true, checkpoint: true, draft: true, metrics: true } as const

/** Graph `reel` rows and Postiz `post` rows matching `where`, as one list (Graph preferred per cut). */
async function loadRows(payload: Payload, where: Record<string, unknown>[]): Promise<StatRow[]> {
  const [graph, postiz] = await Promise.all(
    (['reel', 'post'] as const).map((kind) =>
      payload.find({
        collection: 'hq-social-stats',
        where: { and: [{ kind: { equals: kind } }, ...where] } as never,
        select: kind === 'reel' ? REEL_SELECT : POST_SELECT,
        limit: 5000,
        depth: 0,
        overrideAccess: true,
      }),
    ),
  )
  return preferGraph([
    ...(graph.docs as StatRow[]).map((r) => ({ ...r, src: 'graph' as const })),
    ...(postiz.docs as StatRow[]).map((r) => ({ ...r, src: 'postiz' as const })),
  ])
}

/** The marker that makes appending to an experiment happen once, whatever retries. */
export const experimentMarker = (key: string) => `[${key}]`

/**
 * Review every story whose cuts are ready (see `readiness`) and not yet
 * reviewed. Returns how many reviews were written and how many experiment
 * results were appended to.
 */
export async function scoreReels(payload: Payload, now: Date = new Date()) {
  const recent = await payload.find({
    collection: 'hq-social-drafts',
    where: {
      and: [
        { status: { in: LIVE } },
        { publishAt: { greater_than: new Date(now.getTime() - LOOKBACK_MS - PAIR_PUBLISH_MS).toISOString() } },
        { publishAt: { less_than_equal: now.toISOString() } },
      ],
    },
    select: { status: true, pillar: true, language: true, createdAt: true, publishAt: true, platforms: true, media: true },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  const groups = pairDrafts(recent.docs as PairDraft[]).filter((g) =>
    g.every((d) => now.getTime() - ms(d.publishAt) >= READY_MS),
  )
  if (!groups.length) return { reviewed: 0, experiments: 0 }

  const ids = groups.flat().map((d) => d.id)
  const [rows, done] = await Promise.all([
    loadRows(payload, [{ draft: { in: ids } }]),
    payload.find({
      collection: 'hq-reel-reviews',
      where: { drafts: { in: ids } },
      select: { drafts: true },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    }),
  ])
  const reviewed = new Set(done.docs.flatMap((r) => (r.drafts ?? []).map(idOf)))

  let written = 0
  let appended = 0
  for (const group of groups) {
    if (group.some((d) => reviewed.has(d.id))) continue
    const mine = rows.filter((r) => group.some((d) => d.id === idOf(r.draft)))
    const state = readiness(group, mine, now)
    if (!state.ready) continue
    try {
      const n = await writeReview(payload, group, mine, state, now)
      written += 1
      appended += n
    } catch (err) {
      console.error(`[hq] reel review for #${group.map((d) => d.id).join('/')} failed:`, err instanceof Error ? err.message : err)
    }
  }
  return { reviewed: written, experiments: appended }
}

/** The previous reels of `pillar` at 3d, per platform, newest first, before `before`. */
async function baseline(payload: Payload, pillar: string | null, before: Date, exclude: number[]) {
  const out: Record<Platform, CutMetrics[]> = { instagram: [], tiktok: [], facebook: [] }
  if (!pillar) return out
  // The drafts of this pillar that went out in the window, newest first; then their 3d rows from either source.
  const drafts = await payload.find({
    collection: 'hq-social-drafts',
    where: {
      and: [
        { pillar: { equals: pillar } },
        { status: { in: LIVE } },
        { publishAt: { less_than: before.toISOString() } },
        { publishAt: { greater_than: new Date(before.getTime() - BASELINE_DAYS * DAY).toISOString() } },
      ],
    },
    select: { publishAt: true },
    sort: '-publishAt',
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  const order = drafts.docs.map((d) => d.id).filter((id) => !exclude.includes(id))
  if (!order.length) return out
  const rows = await loadRows(payload, [{ draft: { in: order } }])
  for (const d of order) {
    const mine = rows.filter((r) => idOf(r.draft) === d)
    const length = lengthOf(mine)
    for (const r of mine) {
      if (r.checkpoint !== SCORED_CHECKPOINT || !isPlatform(r.platform)) continue
      if (out[r.platform].length >= BASELINE_REELS) continue
      out[r.platform].push(rowMetrics(r, length))
    }
  }
  return out
}

/**
 * The same video posted elsewhere: other live drafts that share a draft's
 * first HQ media (a reel goes to Instagram and TikTok as separate drafts, and
 * the TikTok back catalog reuses the Instagram videos). One line each, with
 * its 3d numbers when it has them. This is how a reel's TikTok and Instagram
 * results get compared, whatever their dates.
 */
async function sameVideoLines(payload: Payload, group: PairDraft[]): Promise<string[]> {
  const lines: string[] = []
  for (const d of group) {
    const media = idOf((d.media ?? [])[0])
    if (media === null) continue
    const others = await payload.find({
      collection: 'hq-social-drafts',
      where: { and: [{ media: { contains: media } }, { status: { in: LIVE } }, { id: { not_in: group.map((g) => g.id) } }] },
      select: { platforms: true, language: true, publishAt: true },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    for (const o of others.docs) {
      if (samePlatforms(o as PairDraft, d)) continue
      const rows = (await loadRows(payload, [{ draft: { equals: o.id } }])).filter((r) => r.checkpoint === SCORED_CHECKPOINT)
      const when = o.publishAt ? miamiTime(o.publishAt) : 'not out yet'
      const head = `#${d.id} ↔ #${o.id} (${(o.platforms ?? []).map(name).join(', ')}, ${(o.language ?? '?').toUpperCase()}, ${when})`
      if (!rows.length) {
        lines.push(`${head}: no 3d reading`)
        continue
      }
      for (const r of rows) {
        const m = rowMetrics(r, null)
        const bits = (['views', 'sharesPerReach', 'likesPerReach'] as ScoreMetric[])
          .filter((k) => m[k] !== null)
          .map((k) => `${labelFor(k, r.platform)} ${show(k, m[k])}`)
        lines.push(`${head} ${name(r.platform)}: ${bits.join(' · ') || 'no numbers'}`)
      }
    }
  }
  return lines
}

async function writeReview(payload: Payload, group: PairDraft[], rows: StatRow[], state: ReadyState, now: Date) {
  const key = `reel-review:${group[0].id}`
  const pillar = group[0].pillar ?? null
  const firstOut = new Date(Math.min(...group.map((d) => ms(d.publishAt))))
  const base = await baseline(payload, pillar, firstOut, group.map((d) => d.id))

  const cuts: Cut[] = []
  const retention: ReviewText['retention'] = []
  for (const d of group) {
    const mine = rows.filter((r) => idOf(r.draft) === d.id)
    const length = lengthOf(mine)
    for (const p of PLATFORM_ORDER) {
      const r = mine.find((x) => x.platform === p && x.checkpoint === SCORED_CHECKPOINT)
      if (!r) continue
      const metrics = rowMetrics(r, length)
      cuts.push({
        draft: d.id,
        language: d.language ?? null,
        platform: p,
        permalink: r.permalink ?? mine.find((x) => x.platform === p && x.permalink)?.permalink ?? null,
        ageMinutes: r.ageMinutes ?? null,
        durationSec: r.durationSec ?? length,
        metrics,
        vsMedian: Object.fromEntries(
          SCORE_METRICS.map((m) => [m, vsMedian(metrics[m], base[p].map((b) => b[m]))]),
        ) as Record<ScoreMetric, VsMedian>,
      })
      if (p === 'facebook') {
        const summary = retentionSummary(r.retention, r.durationSec ?? length)
        if (summary) retention.push({ draft: d.id, language: d.language ?? null, summary })
      }
    }
  }

  const sameVideo = await sameVideoLines(payload, group)
  const label = group.map((d) => `#${d.id} ${d.language ?? '?'}`).join(' + ')
  const title = `${label} · ${pillar ?? 'no pillar'} · ${miamiTime(firstOut)}`
  const pair = group.length === 2 ? comparePair(cuts) : null
  const summary = reviewSummary({
    title,
    pillar,
    publishedAt: firstOut.toISOString(),
    cuts,
    pair,
    retention,
    complete: state.complete,
    missing: state.missing,
    sameVideo,
  })

  // Experiments first, the review last: the marker keeps a retried append from
  // landing twice, and a review row only exists once its appends are done.
  const experiments = await payload.find({
    collection: 'hq-experiments',
    where: { drafts: { in: group.map((d) => d.id) } },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  const touched: number[] = []
  for (const x of experiments.docs as HqExperiment[]) {
    touched.push(x.id)
    if ((x.result ?? '').includes(experimentMarker(key))) continue
    const block = `${experimentMarker(key)} 72-hour numbers, added by the reel scorer ${miamiTime(now)}. Verdict left to the review.\n${summary}`
    await payload.update({
      collection: 'hq-experiments',
      id: x.id,
      data: { result: x.result?.trim() ? `${x.result.trimEnd()}\n\n${block}` : block },
      overrideAccess: true,
    })
  }

  await payload.create({
    collection: 'hq-reel-reviews',
    data: {
      key,
      title,
      pillar: pillar ?? undefined,
      checkpoint: SCORED_CHECKPOINT,
      publishedAt: firstOut.toISOString(),
      complete: state.complete,
      drafts: group.map((d) => d.id),
      permalinks: cuts.map((c) => ({ draft: c.draft, language: c.language, platform: c.platform, permalink: c.permalink })),
      cuts: cuts as never,
      pair: (pair ?? undefined) as never,
      retention: (retention.length ? retention : undefined) as never,
      summary,
      experiments: touched,
    },
    overrideAccess: true,
  })
  return touched.length
}

/**
 * The reviews written in the last `days`, for the growth review: compact, the
 * summary text plus the ratios, no raw rows.
 */
export async function recentReelReviews(payload: Payload, days: number, now: Date = new Date()) {
  const res = await payload.find({
    collection: 'hq-reel-reviews',
    where: { publishedAt: { greater_than: new Date(now.getTime() - days * DAY).toISOString() } },
    sort: '-publishedAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  return res.docs.map((r) => ({
    id: r.id,
    title: r.title,
    pillar: r.pillar ?? null,
    publishedMiami: r.publishedAt ? miamiTime(r.publishedAt) : null,
    complete: r.complete ?? false,
    drafts: (r.drafts ?? []).map(idOf),
    cuts: ((r.cuts as Cut[] | null) ?? []).map((c) => ({
      draft: c.draft,
      language: c.language,
      platform: c.platform,
      permalink: c.permalink,
      metrics: c.metrics,
      vsMedian: Object.fromEntries(SCORE_METRICS.map((m) => [m, { ratio: c.vsMedian[m].ratio, n: c.vsMedian[m].n }])),
    })),
    pair: r.pair ?? null,
    retention: r.retention ?? null,
    experiments: (r.experiments ?? []).map(idOf),
    summary: r.summary,
  }))
}
