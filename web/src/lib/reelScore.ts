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
 * reviewed, whatever its age. Without META_GRAPH_TOKEN there are no reel rows,
 * so the job finds nothing to do.
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

export type PairDraft = Pick<HqSocialDraft, 'id' | 'status' | 'pillar' | 'language' | 'createdAt' | 'publishAt'>

const ms = (d: string | null | undefined) => (d ? new Date(d).getTime() : NaN)

function twins(d: PairDraft, all: PairDraft[]): PairDraft[] {
  if (!d.pillar || !LIVE.includes(d.status ?? '') || (d.language !== 'es' && d.language !== 'en')) return []
  return all.filter(
    (o) =>
      o.id !== d.id &&
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

type Platform = 'instagram' | 'facebook'
const PLATFORM_ORDER: Platform[] = ['instagram', 'facebook']

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
>

const idOf = (v: unknown): number | null => (v && typeof v === 'object' ? (v as { id: number }).id : ((v as number) ?? null))
const isPlatform = (p: string): p is Platform => p === 'instagram' || p === 'facebook'

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
const name = (p: string) => (p === 'facebook' ? 'Facebook' : 'Instagram')

export type ReviewText = {
  title: string
  pillar: string | null
  publishedAt: string | null
  cuts: Cut[]
  pair: PairComparison | null
  retention: { draft: number; language: string | null; summary: RetentionSummary }[]
  complete: boolean
  missing: string[]
}

/** The post-mortem as text, in the shape of topics/lukumi-hialeah/RETENTION-NOTES.md: the numbers, the pair, where they left. */
export function reviewSummary(r: ReviewText): string {
  const lines: string[] = [
    r.title,
    `72-hour reading (3d). Baseline: the median of the account's previous ${r.pillar ?? 'unlabelled'} reels at 3d on the same platform (up to ${BASELINE_REELS}); 2.0x is twice the median, 0.5x half; for skip rate, lower is better.`,
    '',
  ]
  for (const c of r.cuts) {
    lines.push(`${name(c.platform)} · ${(c.language ?? '?').toUpperCase()} #${c.draft}${c.permalink ? ` · ${c.permalink}` : ''}`)
    const n = Math.max(0, ...SCORE_METRICS.map((m) => c.vsMedian[m].n))
    const parts = SCORE_METRICS.filter((m) => c.metrics[m] !== null).map((m) => {
      const v = c.vsMedian[m]
      return `${LABEL[m]} ${show(m, c.metrics[m])}${v.ratio !== null ? ` (${v.ratio}x)` : ''}`
    })
    lines.push(`  ${parts.join(' · ') || 'no numbers'}${n ? ` — baseline n=${n}` : ' — no baseline yet'}`)
  }
  if (r.pair) {
    lines.push('', 'Spanish vs English (same story), ES/EN:')
    for (const p of PLATFORM_ORDER) {
      const cmp = r.pair[p]
      if (!cmp) continue
      const parts = SCORE_METRICS.filter((m) => cmp[m]?.esOverEn != null).map((m) => `${LABEL[m]} ${cmp[m]!.esOverEn}x`)
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
    select: { status: true, pillar: true, language: true, createdAt: true, publishAt: true },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  const groups = pairDrafts(recent.docs as PairDraft[]).filter((g) =>
    g.every((d) => now.getTime() - ms(d.publishAt) >= READY_MS),
  )
  if (!groups.length) return { reviewed: 0, experiments: 0 }

  const ids = groups.flat().map((d) => d.id)
  const [rowsRes, done] = await Promise.all([
    payload.find({
      collection: 'hq-social-stats',
      where: { and: [{ kind: { equals: 'reel' } }, { draft: { in: ids } }] },
      select: REEL_SELECT,
      limit: 5000,
      depth: 0,
      overrideAccess: true,
    }),
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
  const rows = rowsRes.docs as StatRow[]

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
  const out: Record<Platform, CutMetrics[]> = { instagram: [], facebook: [] }
  if (!pillar) return out
  const res = await payload.find({
    collection: 'hq-social-stats',
    where: {
      and: [
        { kind: { equals: 'reel' } },
        { draft: { exists: true } },
        { mediaPublishedAt: { less_than: before.toISOString() } },
        { mediaPublishedAt: { greater_than: new Date(before.getTime() - BASELINE_DAYS * DAY).toISOString() } },
      ],
    },
    select: REEL_SELECT,
    sort: '-mediaPublishedAt',
    limit: 5000,
    depth: 0,
    overrideAccess: true,
  })
  const rows = (res.docs as StatRow[]).filter((r) => !exclude.includes(idOf(r.draft) ?? -1))
  const draftIds = [...new Set(rows.map((r) => idOf(r.draft)).filter((d): d is number => d !== null))]
  if (!draftIds.length) return out
  const drafts = await payload.find({
    collection: 'hq-social-drafts',
    where: { id: { in: draftIds } },
    select: { pillar: true },
    limit: draftIds.length,
    depth: 0,
    overrideAccess: true,
  })
  const same = new Set(drafts.docs.filter((d) => d.pillar === pillar).map((d) => d.id))
  for (const r of rows) {
    const d = idOf(r.draft)
    if (r.checkpoint !== SCORED_CHECKPOINT || d === null || !same.has(d) || !isPlatform(r.platform)) continue
    if (out[r.platform].length >= BASELINE_REELS) continue
    const length = lengthOf(rows.filter((o) => idOf(o.draft) === d))
    out[r.platform].push(cutMetrics(r.platform, r.metrics as Record<string, number>, r.durationSec ?? length))
  }
  return out
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
      const metrics = cutMetrics(p, r.metrics as Record<string, number>, r.durationSec ?? length)
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
