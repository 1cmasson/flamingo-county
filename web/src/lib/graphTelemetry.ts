import type { Payload } from 'payload'

import type { HqSocialStat } from '../payload-types'
import { addDays, miamiInstant, todayISO } from './dates'
import { miamiHour } from './brief'
import { recordEvent } from './hq'
import { collectMarket } from './market'
import {
  fbPageDay,
  igAccountDay,
  igAccountFields,
  igDemographics,
  igOnlineFollowers,
  listIgComments,
  type Demographics,
} from './metaAccount'
import {
  FLAMINGO_IG_USERNAME,
  GraphError,
  graphConfigured,
  isInvalidParam,
  isPermissionError,
  listIgReels,
  listMeAccounts,
  otherManagedUsernames,
  pickFlamingoAccount,
  type GraphAccount,
  type InsightRow,
  type Reading,
} from './metaGraph'
import { miamiDadeShare } from './miamiDade'

/**
 * Account-level telemetry from Meta's Graph API (lib/metaAccount.ts), beside
 * the per-reel readings of lib/reelStats.ts. Four collectors, run hourly by
 * the `graphTelemetry` job, each deciding for itself whether it is due:
 *
 * - `collectAccountDays`, daily: the @flamingo.county account and the Facebook
 *   Page for each Miami day, as `hq-social-stats` rows of `kind: 'account'`.
 *   Gated on the row for that `day` existing, never on the clock alone, so two
 *   runs in the same hour read nothing twice and a server that was down
 *   catches up (three days back at most).
 * - `collectAudience`, weekly: demographics, the Miami-Dade share and the
 *   hours followers are online, as one `kind: 'audience'` row.
 * - `collectComments`, hourly: comments on our reels of the last seven days,
 *   into `hq-social-comments`. Needs instagram_manage_comments.
 * - `collectMarket` (lib/market.ts), daily per account: the watchlist through
 *   Business Discovery.
 *
 * A no-op without `META_GRAPH_TOKEN`: `collectGraphTelemetry` returns before
 * it touches the network or the database. A feature the token has no
 * permission for is skipped, and one `graph.scope_missing` event (per
 * feature, ever) tells the owner what to add; see `noteMissingScope`.
 */

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/* ------------------------------------------------------------------------ */
/* Which days are due                                                        */
/* ------------------------------------------------------------------------ */

/** A day is first read six hours after it ends: 6 AM Miami, before the 7 AM brief. */
export const FIRST_READ_MINUTES = 6 * 60
/** Meta's numbers can lag up to 48 hours, so a day is read once more after that. */
export const SETTLED_MINUTES = 48 * 60
/** How far back a missed day is still read. */
export const BACKFILL_DAYS = 3

/** The instant a Miami day ends (the next day's midnight, DST-aware). */
export const miamiDayEnd = (day: string) => miamiInstant(addDays(day, 1), '00:00')
export const miamiDayStart = (day: string) => miamiInstant(day, '00:00')

export type DueDay = { day: string; action: 'create' | 'settle'; ageMinutes: number }

/**
 * The Miami days to read now, oldest first. `read` maps each day already saved
 * to the `ageMinutes` of its last reading. A day is created once it is six
 * hours over, and settled once: the first run after it is 48 hours over, if
 * its only reading was taken earlier than that.
 */
export function dueAccountDays(now: Date, read: Map<string, number>): DueDay[] {
  const today = todayISO(now)
  const out: DueDay[] = []
  for (let back = BACKFILL_DAYS; back >= 1; back--) {
    const day = addDays(today, -back)
    const ageMinutes = Math.floor((now.getTime() - miamiDayEnd(day).getTime()) / MIN)
    if (ageMinutes < FIRST_READ_MINUTES) continue
    const last = read.get(day)
    if (last === undefined) out.push({ day, action: 'create', ageMinutes })
    else if (last < SETTLED_MINUTES && ageMinutes >= SETTLED_MINUTES) out.push({ day, action: 'settle', ageMinutes })
  }
  return out
}

/* ------------------------------------------------------------------------ */
/* Missing permissions: said once                                            */
/* ------------------------------------------------------------------------ */

/** In this process, a feature refused for a permission is not asked again for a day. */
const refusedUntil = new Map<string, number>()
const RETRY_REFUSED_MS = DAY

/** For tests: forget in-process refusals, as a restart would. */
export function resetGraphTelemetryState() {
  refusedUntil.clear()
  warnedNoAccount = false
}

const isRefused = (feature: string, now: Date) => (refusedUntil.get(feature) ?? 0) > now.getTime()

/**
 * Record, once ever per feature, that the token lacks a permission: one
 * `graph.scope_missing` hq-events row the brief shows, with what to add. The
 * check is against the database, so a restart or the next hourly run does not
 * write it again. Then the feature is skipped for a day in this process.
 */
export async function noteMissingScope(
  payload: Payload,
  feature: string,
  scope: string,
  err: unknown,
  now: Date = new Date(),
): Promise<void> {
  refusedUntil.set(feature, now.getTime() + RETRY_REFUSED_MS)
  const seen = await payload.count({
    collection: 'hq-events',
    where: { and: [{ type: { equals: 'graph.scope_missing' } }, { refId: { equals: feature } }] },
    overrideAccess: true,
  })
  if (seen.totalDocs) return
  await recordEvent(payload, {
    type: 'graph.scope_missing',
    summary: `Meta Graph: ${feature} needs the ${scope} permission on META_GRAPH_TOKEN. Skipped until it is added (Business Settings → System users → generate the token again with it → replace META_GRAPH_TOKEN in Railway).`,
    refId: feature,
    data: {
      scope,
      code: err instanceof GraphError ? (err.code ?? null) : null,
      subcode: err instanceof GraphError ? (err.subcode ?? null) : null,
    },
  })
}

/* ------------------------------------------------------------------------ */
/* Account days                                                              */
/* ------------------------------------------------------------------------ */

type DayReader = (since: Date, until: Date) => Promise<Reading | null>

async function readDays(
  payload: Payload,
  platform: 'instagram' | 'facebook',
  read: DayReader,
  now: Date,
  followers: () => Promise<Record<string, number>>,
): Promise<number> {
  const days = Array.from({ length: BACKFILL_DAYS }, (_, i) => addDays(todayISO(now), -(i + 1)))
  const existing = await payload.find({
    collection: 'hq-social-stats',
    where: {
      and: [{ kind: { equals: 'account' } }, { platform: { equals: platform } }, { day: { in: days } }],
    },
    limit: 20,
    depth: 0,
    overrideAccess: true,
  })
  const byDay = new Map(existing.docs.map((r) => [r.day ?? '', r]))
  const due = dueAccountDays(now, new Map(existing.docs.map((r) => [r.day ?? '', r.ageMinutes ?? 0])))

  let saved = 0
  for (const d of due) {
    const reading = await read(miamiDayStart(d.day), miamiDayEnd(d.day))
    if (!reading) continue // no rows yet: next run
    // The follower total is a count of now, so it belongs only on yesterday's first reading.
    const extra = d.action === 'create' && d.ageMinutes < DAY / MIN ? await followers() : {}
    const prev = byDay.get(d.day)
    if (d.action === 'settle' && prev) {
      const old = (prev.metrics ?? {}) as Record<string, number>
      const keep = Object.fromEntries(Object.entries(old).filter(([k]) => k in FOLLOWER_FIELDS))
      await payload.update({
        collection: 'hq-social-stats',
        id: prev.id,
        data: {
          ageMinutes: d.ageMinutes,
          metrics: { ...reading.metrics, ...keep },
          failedMetrics: reading.failed.length ? reading.failed : null,
          raw: reading.raw as never,
        },
        overrideAccess: true,
      })
    } else {
      await payload.create({
        collection: 'hq-social-stats',
        data: {
          kind: 'account',
          source: 'graph',
          platform,
          day: d.day,
          ageMinutes: d.ageMinutes,
          metrics: { ...reading.metrics, ...extra },
          failedMetrics: reading.failed.length ? reading.failed : undefined,
          raw: reading.raw as never,
        },
        overrideAccess: true,
      })
    }
    saved++
  }
  return saved
}

const FOLLOWER_FIELDS = { followers_count: true, follows_count: true, media_count: true }

/** Yesterday (and any missed day) for Instagram and the Facebook Page. Facebook's failure never loses Instagram's. */
export async function collectAccountDays(payload: Payload, account: GraphAccount, token: string, now: Date = new Date()) {
  const rejected = { instagram: new Set<string>(), facebook: new Set<string>() }
  let saved = 0
  try {
    saved += await readDays(
      payload,
      'instagram',
      (since, until) => igAccountDay(account, token, since, until, rejected.instagram),
      now,
      () => igAccountFields(account, token).catch(() => ({})),
    )
  } catch (err) {
    console.error('[hq] Instagram account insights failed:', err instanceof Error ? err.message : err)
  }
  try {
    saved += await readDays(
      payload,
      'facebook',
      (since, until) => fbPageDay(account, token, since, until, rejected.facebook),
      now,
      async () => ({}),
    )
  } catch (err) {
    console.error('[hq] Facebook Page insights failed:', err instanceof Error ? err.message : err)
  }
  return saved
}

/* ------------------------------------------------------------------------ */
/* Audience, weekly                                                          */
/* ------------------------------------------------------------------------ */

export const AUDIENCE_EVERY_DAYS = 7

/**
 * Followers online, by Miami hour. Meta's `online_followers` gives one value
 * per reporting day, `{ "0": n, …, "23": n }`, stamped with the day's
 * `end_time`. Its reference no longer says which clock the keys use; Meta's
 * days end at 07:00 UTC (Pacific midnight), so key `h` is read as `h` hours
 * after the start of that day — the day before `end_time` — and that instant
 * is turned into a Miami hour. Pacific to Miami is +3 hours year-round, so a
 * key of 16 is 7 PM in Miami. Confirm against the app's "Most active times"
 * on the first live reading. Days Meta left empty (`{}`) are not counted.
 */
export function onlineByMiamiHour(rows: InsightRow[]): { byHour: Record<string, number>; days: number; best: number[] } {
  const sum = new Map<number, number>()
  const count = new Map<number, number>()
  let days = 0
  for (const row of rows) {
    for (const v of (row.values ?? []) as { value?: unknown; end_time?: string }[]) {
      const value = v.value as Record<string, unknown> | undefined
      const end = v.end_time ? Date.parse(v.end_time) : NaN
      if (!value || typeof value !== 'object' || Number.isNaN(end)) continue
      const entries = Object.entries(value).filter(([, n]) => typeof n === 'number') as [string, number][]
      if (!entries.length) continue
      days++
      const start = end - DAY
      for (const [k, n] of entries) {
        const h = miamiHour(new Date(start + Number(k) * HOUR))
        sum.set(h, (sum.get(h) ?? 0) + n)
        count.set(h, (count.get(h) ?? 0) + 1)
      }
    }
  }
  const byHour: Record<string, number> = {}
  for (const [h, s] of [...sum].sort((a, b) => a[0] - b[0])) byHour[String(h)] = Math.round(s / count.get(h)!)
  const best = Object.entries(byHour)
    .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
    .slice(0, 3)
    .map(([h]) => Number(h))
  return { byHour, days, best }
}

/** 19 → "7 PM". */
export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`

/** Once a week: who follows, from where, and when they are online. One `kind: 'audience'` row. */
export async function collectAudience(payload: Payload, account: GraphAccount, token: string, now: Date = new Date()) {
  const today = todayISO(now)
  const last = await payload.find({
    collection: 'hq-social-stats',
    where: { and: [{ kind: { equals: 'audience' } }, { platform: { equals: 'instagram' } }] },
    sort: '-day',
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { day: true },
  })
  const lastDay = last.docs[0]?.day
  if (lastDay && lastDay > addDays(today, -AUDIENCE_EVERY_DAYS)) return 0

  const failed: string[] = []
  const raw: InsightRow[] = []
  const fields = await igAccountFields(account, token).catch(() => ({}) as Record<string, number>)

  const demo: Partial<Record<'follower_demographics' | 'engaged_audience_demographics', Demographics>> = {}
  for (const metric of ['follower_demographics', 'engaged_audience_demographics'] as const) {
    const d = await igDemographics(account, token, metric)
    demo[metric] = d
    failed.push(...d.failed)
    raw.push(...d.raw)
  }

  let online: ReturnType<typeof onlineByMiamiHour> | null = null
  try {
    const rows = await igOnlineFollowers(account, token, new Date(now.getTime() - 7 * DAY), now)
    raw.push(...rows)
    online = onlineByMiamiHour(rows)
    if (!online.days) online = null
  } catch (err) {
    if (!isInvalidParam(err)) throw err
    failed.push('online_followers')
  }

  const followers = demo.follower_demographics
  const byCity = followers?.by.city ?? {}
  const total = fields.followers_count ?? null
  const md = miamiDadeShare(byCity, total)
  const answered = Object.keys(followers?.by ?? {}).length + Object.keys(demo.engaged_audience_demographics?.by ?? {}).length
  if (!answered && !online) {
    console.error(`[hq] Instagram audience: Meta answered nothing (${failed.join(', ')}); it needs 100 followers or more.`)
    return 0
  }

  const metrics: Record<string, number> = { ...fields }
  if (Object.keys(byCity).length) {
    metrics.miami_dade_followers = md.followers
    metrics.listed_city_followers = md.listed
    if (md.share !== null) metrics.miami_dade_share = md.share
    if (md.shareOfListed !== null) metrics.miami_dade_share_of_listed = md.shareOfListed
  }
  if (online?.best.length) metrics.best_hour_miami = online.best[0]

  await payload.create({
    collection: 'hq-social-stats',
    data: {
      kind: 'audience',
      source: 'graph',
      platform: 'instagram',
      day: today,
      metrics,
      audience: {
        follower_demographics: followers ? { timeframe: followers.timeframe, ...followers.by } : null,
        engaged_audience_demographics: demo.engaged_audience_demographics
          ? { timeframe: demo.engaged_audience_demographics.timeframe, ...demo.engaged_audience_demographics.by }
          : null,
        miamiDade: Object.keys(byCity).length ? md : null,
        online: online ? { ...online, bestLabels: online.best.map(hourLabel) } : null,
      },
      failedMetrics: failed.length ? failed : undefined,
      raw: raw as never,
    },
    overrideAccess: true,
  })
  return 1
}

/* ------------------------------------------------------------------------ */
/* Comments on our reels                                                     */
/* ------------------------------------------------------------------------ */

export const COMMENT_LOOKBACK_DAYS = 7
const clip = (s: string | undefined, max: number) => {
  const t = (s ?? '').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

/**
 * New comments on our reels of the last week, hourly. Kept without the
 * commenter's username (see collections/HqSocialComments.ts): Graph's
 * `username` is only compared with ours, to mark our own comments.
 */
export async function collectComments(payload: Payload, account: GraphAccount, token: string, now: Date = new Date()) {
  if (isRefused('comments', now)) return 0
  const reels = await listIgReels(account, new Date(now.getTime() - COMMENT_LOOKBACK_DAYS * DAY), token)
  let saved = 0
  for (const reel of reels) {
    let comments
    try {
      comments = await listIgComments(reel.id, token)
    } catch (err) {
      if (isPermissionError(err)) {
        await noteMissingScope(payload, 'comments', 'instagram_manage_comments', err, now)
        return saved
      }
      throw err
    }
    if (!comments.length) continue
    const known = await payload.find({
      collection: 'hq-social-comments',
      where: { commentId: { in: comments.map((c) => c.id) } },
      limit: comments.length,
      depth: 0,
      overrideAccess: true,
      select: { commentId: true, likeCount: true },
    })
    const byId = new Map(known.docs.map((k) => [k.commentId, k]))
    for (const c of comments) {
      const prev = byId.get(c.id)
      if (prev) {
        if (typeof c.like_count === 'number' && c.like_count !== prev.likeCount) {
          await payload.update({ collection: 'hq-social-comments', id: prev.id, data: { likeCount: c.like_count }, overrideAccess: true })
        }
        continue
      }
      await payload.create({
        collection: 'hq-social-comments',
        data: {
          commentId: c.id,
          platform: 'instagram',
          mediaId: reel.id,
          permalink: reel.permalink ?? undefined,
          mediaCaption: clip(reel.caption, 160),
          commentedAt: c.timestamp ?? undefined,
          text: clip(c.text, 2200),
          likeCount: typeof c.like_count === 'number' ? c.like_count : undefined,
          fromUs: (c.username ?? '').toLowerCase() === FLAMINGO_IG_USERNAME,
        },
        overrideAccess: true,
      })
      saved++
    }
  }
  return saved
}

/* ------------------------------------------------------------------------ */
/* The job                                                                   */
/* ------------------------------------------------------------------------ */

/** Said once per process: a token that reaches no Flamingo County account is a setup problem. */
let warnedNoAccount = false

export type TelemetryResult = { accountDays: number; audience: number; comments: number; marketAccounts: number; marketPosts: number }
const NOTHING: TelemetryResult = { accountDays: 0, audience: 0, comments: 0, marketAccounts: 0, marketPosts: 0 }

export async function collectGraphTelemetry(
  payload: Payload,
  now: Date = new Date(),
  opts: { pauseMs?: number } = {},
): Promise<TelemetryResult> {
  if (!graphConfigured()) return { ...NOTHING }
  const token = process.env.META_GRAPH_TOKEN!.trim()

  let account: GraphAccount | null
  let others: string[]
  try {
    const pages = await listMeAccounts(token)
    account = pickFlamingoAccount(pages)
    others = otherManagedUsernames(pages)
  } catch (err) {
    console.error('[hq] Graph account lookup failed:', err instanceof Error ? err.message : err)
    return { ...NOTHING }
  }
  if (!account) {
    if (!warnedNoAccount) {
      console.error('[hq] META_GRAPH_TOKEN reaches no single Facebook Page named Flamingo County with @flamingo.county attached; account telemetry is off.')
      warnedNoAccount = true
    }
    return { ...NOTHING }
  }
  warnedNoAccount = false

  const out = { ...NOTHING }
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (err) {
      console.error(`[hq] Graph ${name} failed:`, err instanceof Error ? err.message : err)
    }
  }
  const acc = account
  await step('account days', async () => {
    out.accountDays = await collectAccountDays(payload, acc, token, now)
  })
  await step('audience', async () => {
    out.audience = await collectAudience(payload, acc, token, now)
  })
  await step('comments', async () => {
    out.comments = await collectComments(payload, acc, token, now)
  })
  await step('market', async () => {
    const m = await collectMarket(payload, acc, token, others, now, { pauseMs: opts.pauseMs, isRefused, noteMissingScope })
    out.marketAccounts = m.checked
    out.marketPosts = m.posts
  })
  return out
}

/* ------------------------------------------------------------------------ */
/* For the report                                                            */
/* ------------------------------------------------------------------------ */

const sumOf = (rows: HqSocialStat[], key: string): number | null => {
  const vals = rows.map((r) => (r.metrics as Record<string, number>)?.[key]).filter((v): v is number => typeof v === 'number')
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null
}

/**
 * The headline account numbers for hqSocialReport and the growth review:
 * follows gained in the last seven full Miami days (KPI #1), unfollows, the
 * follower total, and the latest audience reading (Miami-Dade share, top
 * cities, best hours). Instagram's follows are `follows_and_unfollows`'s
 * FOLLOWER value and unfollows its NON_FOLLOWER value, as Meta's follow_type
 * breakdown reads; check against the app on the first live week. Empty
 * without Graph rows.
 */
export async function graphSummary(payload: Payload, now: Date = new Date()) {
  const today = todayISO(now)
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, -(i + 1)))
  const [days, audience, followerRows] = await Promise.all([
    payload.find({
      collection: 'hq-social-stats',
      where: { and: [{ kind: { equals: 'account' } }, { day: { in: week } }] },
      limit: 50,
      depth: 0,
      overrideAccess: true,
      select: { platform: true, day: true, metrics: true },
    }),
    payload.find({
      collection: 'hq-social-stats',
      where: { and: [{ kind: { equals: 'audience' } }, { day: { less_than_equal: today } }] },
      sort: '-day',
      limit: 1,
      depth: 0,
      overrideAccess: true,
      select: { day: true, metrics: true, audience: true },
    }),
    payload.find({
      collection: 'hq-social-stats',
      where: { and: [{ kind: { equals: 'account' } }, { platform: { equals: 'instagram' } }, { day: { greater_than_equal: addDays(today, -15) } }] },
      sort: '-day',
      limit: 20,
      depth: 0,
      overrideAccess: true,
      select: { day: true, metrics: true },
    }),
  ])
  const ig = days.docs.filter((r) => r.platform === 'instagram') as HqSocialStat[]
  const fb = days.docs.filter((r) => r.platform === 'facebook') as HqSocialStat[]

  // Net change from two follower totals about a week apart.
  const withTotal = followerRows.docs.filter((r) => typeof (r.metrics as Record<string, number>)?.followers_count === 'number')
  const newest = withTotal[0]
  const weekBefore = newest && withTotal.find((r) => (r.day ?? '') <= addDays(newest.day ?? '', -7))
  const total = (r: { metrics?: unknown } | undefined) => (r ? (r.metrics as Record<string, number>).followers_count : null)

  const fbLatest = [...fb].sort((a, b) => (b.day ?? '').localeCompare(a.day ?? ''))[0]
  const a = audience.docs[0]
  const aud = (a?.audience ?? null) as {
    follower_demographics?: { city?: Record<string, number>; timeframe?: string } | null
    miamiDade?: { cities?: Record<string, number> } | null
    online?: { bestLabels?: string[] } | null
  } | null
  const am = (a?.metrics ?? {}) as Record<string, number>
  const topCities = Object.entries(aud?.follower_demographics?.city ?? {})
    .sort((x, y) => y[1] - x[1])
    .slice(0, 10)
    .map(([city, followers]) => ({ city, followers }))

  return {
    instagram: {
      daysCounted: ig.length,
      followsLast7d: sumOf(ig, 'follows_and_unfollows.FOLLOWER'),
      unfollowsLast7d: sumOf(ig, 'follows_and_unfollows.NON_FOLLOWER'),
      reachLast7d: sumOf(ig, 'reach'),
      viewsLast7d: sumOf(ig, 'views'),
      profileLinkTapsLast7d: sumOf(ig, 'profile_links_taps'),
      followersNow: total(newest),
      followersChange: newest && weekBefore ? total(newest)! - total(weekBefore)! : null,
      followersChangeDays: newest && weekBefore ? daysBetween(weekBefore.day!, newest.day!) : null,
    },
    facebook: {
      daysCounted: fb.length,
      followsLast7d: sumOf(fb, 'page_daily_follows_unique'),
      unfollowsLast7d: sumOf(fb, 'page_daily_unfollows_unique'),
      viewsLast7d: sumOf(fb, 'page_media_view'),
      followersNow: fbLatest ? ((fbLatest.metrics as Record<string, number>).page_follows ?? null) : null,
    },
    audience: a
      ? {
          day: a.day,
          followers: am.followers_count ?? null,
          miamiDadeFollowers: am.miami_dade_followers ?? null,
          miamiDadeShare: am.miami_dade_share ?? null,
          miamiDadeShareOfListed: am.miami_dade_share_of_listed ?? null,
          timeframe: aud?.follower_demographics?.timeframe ?? null,
          topCities,
          bestHoursMiami: aud?.online?.bestLabels ?? [],
        }
      : null,
  }
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY)
