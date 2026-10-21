import type { Payload } from 'payload'

import type { HqSocialStat } from '../payload-types'
import { miamiHour } from './brief'
import { SITE_TZ, todayISO } from './dates'
import { fileReview } from './growth'
import type { MetricSummary } from './postiz'
import { reelRatios } from './reelStats'
import { clip, esc, sendMessage, telegramConfigured, type InlineKeyboard } from './telegram'
import { weekMonday } from './week'

/**
 * The Monday nudge for the growth review: one Telegram message at 8 AM Miami
 * time with last week's headline numbers and a **▶️ Run the review** button.
 *
 * It only reminds. The review itself still runs when the owner asks: the
 * button files the same task `/review` does (`fileReview` in lib/growth.ts),
 * and the next Claude session runs it. Nothing here calls a model, and
 * nothing is posted anywhere but the owner's own chat.
 *
 * Once a week, whatever happens: the `reviewReminder` job runs hourly, and an
 * `hq-events` row of type `review.reminded` with the week's Monday as `refId`
 * is written *before* the send, so a later hour, a retry or a restart finds
 * it and stops. A send that fails removes the row again, so the next hour
 * tries once more.
 *
 * Off with `HQ_REVIEW_REMINDER=off` (HQ.md, *Growth review*).
 */

export const REMINDER_EVENT = 'review.reminded'
export const REVIEW_CALLBACK = 'rv:run'
/** On a Miami clock; after the 7:30 brief, so the two don't land together. */
export const REMINDER_HOUR = 8

const DAY = 24 * 60 * 60 * 1000
/** A day's channel snapshot is taken at 6 AM; 7½ days reaches last Monday's. */
const FOLLOWER_WINDOW_MS = 7.5 * DAY
const CHECKPOINT_ORDER = ['1h', '3h', '24h', '3d', '7d']
/** Readings old enough to rank a reel on. */
const SETTLED = new Set(['24h', '3d', '7d'])

/** The `hq-social-stats` fields read here (the finds below select only these). */
type StatRow = Pick<HqSocialStat, 'platform' | 'metrics'> &
  Partial<Pick<HqSocialStat, 'checkpoint' | 'mediaId' | 'caption' | 'permalink' | 'durationSec'>>

/** On unless `HQ_REVIEW_REMINDER` says off. Read per call, so the switch needs no redeploy of code. */
export function reminderEnabled(): boolean {
  return !/^(off|false|0|no)$/i.test((process.env.HQ_REVIEW_REMINDER ?? '').trim())
}

/** Monday, from 8 AM, on a Miami clock. Later hours make up a run missed during a deploy. */
export function isReminderTime(now: Date = new Date()): boolean {
  const dow = new Intl.DateTimeFormat('en-US', { timeZone: SITE_TZ, weekday: 'short' }).format(now)
  return dow === 'Mon' && miamiHour(now) >= REMINDER_HOUR
}

export function parseReviewCallback(data: string | undefined): boolean {
  return data === REVIEW_CALLBACK
}

const keyboard: InlineKeyboard = { inline_keyboard: [[{ text: '▶️ Run the review', callback_data: REVIEW_CALLBACK }]] }

/* ------------------------------------------------------------------------ */
/* Last week's numbers                                                       */
/* ------------------------------------------------------------------------ */

export type WeekNumbers = {
  followers: { total: number; byPlatform: { platform: string; gained: number }[] } | null
  reels: number | null
  best: { platform: string; caption: string; permalink: string | null; sharesPerReach: number } | null
}

/**
 * Followers gained per account: newest daily snapshot minus the oldest in the
 * window, on the account's follower count. Needs two snapshots.
 */
function followersGained(rows: StatRow[]): WeekNumbers['followers'] {
  const byPlatform = new Map<string, StatRow[]>()
  for (const r of rows) byPlatform.set(r.platform, [...(byPlatform.get(r.platform) ?? []), r])
  const out: { platform: string; gained: number }[] = []
  for (const [platform, snaps] of byPlatform) {
    if (snaps.length < 2) continue
    const first = snaps[0].metrics as Record<string, MetricSummary>
    const last = snaps[snaps.length - 1].metrics as Record<string, MetricSummary>
    const label = Object.keys(last).find((l) => /followers/i.test(l) && first[l])
    if (label) out.push({ platform, gained: last[label].latest - first[label].latest })
  }
  return out.length ? { total: out.reduce((a, b) => a + b.gained, 0), byPlatform: out } : null
}

/**
 * Graph reel rows are one per checkpoint, so each reel is first collapsed to
 * its furthest reading. Only reels read at 24h or later are ranked: early
 * shares per reach run high on a tiny reach, so a reel posted Sunday night
 * (only a 1h or 3h reading by Monday morning) is counted but can't be "best".
 * Instagram and Facebook carry the same reels, so the count is one platform's
 * (Instagram's when it has any), not the sum.
 */
function reelsOfTheWeek(rows: StatRow[]): Pick<WeekNumbers, 'reels' | 'best'> {
  const furthest = new Map<string, StatRow>()
  for (const r of rows) {
    if (!r.mediaId) continue
    const key = `${r.platform}:${r.mediaId}`
    const prev = furthest.get(key)
    if (!prev || CHECKPOINT_ORDER.indexOf(r.checkpoint ?? '') > CHECKPOINT_ORDER.indexOf(prev.checkpoint ?? '')) {
      furthest.set(key, r)
    }
  }
  const reels = [...furthest.values()]
  if (!reels.length) return { reels: null, best: null }

  const perPlatform = new Map<string, number>()
  for (const r of reels) perPlatform.set(r.platform, (perPlatform.get(r.platform) ?? 0) + 1)
  const count = perPlatform.get('instagram') ?? Math.max(...perPlatform.values())

  let best: WeekNumbers['best'] = null
  for (const r of reels) {
    if (!SETTLED.has(r.checkpoint ?? '')) continue
    const { sharesPerReach } = reelRatios(r.platform, r.metrics as Record<string, number>, r.durationSec)
    if (sharesPerReach === null || (best && sharesPerReach <= best.sharesPerReach)) continue
    best = { platform: r.platform, caption: r.caption ?? '', permalink: r.permalink ?? null, sharesPerReach }
  }
  return { reels: count, best }
}

export async function weekNumbers(payload: Payload, now: Date = new Date()): Promise<WeekNumbers> {
  const [channels, reels] = await Promise.all([
    payload.find({
      collection: 'hq-social-stats',
      where: {
        and: [
          { kind: { equals: 'channel' } },
          { createdAt: { greater_than: new Date(now.getTime() - FOLLOWER_WINDOW_MS).toISOString() } },
        ],
      },
      sort: 'createdAt',
      limit: 100,
      depth: 0,
      overrideAccess: true,
      select: { platform: true, metrics: true, createdAt: true },
    }),
    payload.find({
      collection: 'hq-social-stats',
      where: {
        and: [
          { kind: { equals: 'reel' } },
          { mediaPublishedAt: { greater_than: new Date(now.getTime() - 7 * DAY).toISOString() } },
        ],
      },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
      select: { platform: true, checkpoint: true, mediaId: true, caption: true, permalink: true, durationSec: true, metrics: true },
    }),
  ])
  return { followers: followersGained(channels.docs), ...reelsOfTheWeek(reels.docs) }
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

/** The message. Each clause drops out when there is nothing behind it. */
export function reminderText(n: WeekNumbers): string {
  const parts: string[] = []
  if (n.followers) {
    const { total, byPlatform } = n.followers
    const split =
      byPlatform.length > 1
        ? ` (${byPlatform.map((p) => `${esc(p.platform)} ${signed(p.gained)}`).join(', ')})`
        : ` on ${esc(byPlatform[0].platform)}`
    parts.push(`${signed(total)} follower${Math.abs(total) === 1 ? '' : 's'}${split}`)
  }
  if (n.reels !== null) parts.push(`${n.reels} reel${n.reels === 1 ? '' : 's'} posted`)
  if (n.best) {
    const caption = esc(clip(n.best.caption.split('\n')[0].trim() || 'untitled', 40))
    const named = n.best.permalink ? `<a href="${esc(n.best.permalink).replace(/"/g, '&quot;')}">“${caption}”</a>` : `“${caption}”`
    const per100 = Math.round(n.best.sharesPerReach * 1000) / 10
    parts.push(`best reel: ${named} on ${esc(n.best.platform)}, ${per100} shares per 100 reached`)
  }
  const head = '📈 <b>Weekly growth review is ready to run.</b>'
  return parts.length ? `${head}\nLast 7 days: ${parts.join(' · ')}.` : head
}

/**
 * The hourly job's whole body. Returns whether a reminder went out; every
 * reason not to (switched off, no Telegram, not Monday 8 AM yet, already sent
 * this week) is a quiet false.
 */
export async function sendReviewReminder(payload: Payload, now: Date = new Date()): Promise<boolean> {
  if (!reminderEnabled() || !telegramConfigured() || !isReminderTime(now)) return false
  const week = weekMonday(todayISO(now))
  return (
    (await once(`remind:${week}`, async () => {
      const sent = await payload.count({
        collection: 'hq-events',
        where: { and: [{ type: { equals: REMINDER_EVENT } }, { refId: { equals: week } }] },
        overrideAccess: true,
      })
      if (sent.totalDocs) return false

      // Claimed first, as bookkeeping (`seen`, and left out of the brief and wrap).
      const claim = await payload.create({
        collection: 'hq-events',
        data: { type: REMINDER_EVENT, summary: `Growth review reminder, week of ${week}`, refId: week, status: 'seen' },
        overrideAccess: true,
      })
      try {
        // The numbers are a nicety: if they fail, the reminder still goes.
        const numbers = await weekNumbers(payload, now).catch((err) => {
          console.error('[hq] review reminder numbers failed:', err instanceof Error ? err.message : err)
          return { followers: null, reels: null, best: null }
        })
        await sendMessage(reminderText(numbers), { keyboard })
      } catch (err) {
        await payload.delete({ collection: 'hq-events', id: claim.id, overrideAccess: true }).catch(() => undefined)
        throw err
      }
      return true
    })) ?? false
  )
}

const busy = new Set<string>()

/**
 * Serialise by key; a second caller while the first is running gets null.
 * One process serves every request and runs every job (SQLite pins the
 * service to a single instance), so this is enough to stop a double tap
 * filing two tasks.
 */
async function once<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
  if (busy.has(key)) return null
  busy.add(key)
  try {
    return await fn()
  } finally {
    busy.delete(key)
  }
}

/**
 * The owner's tap on **▶️ Run the review**: the same find-or-file as `/review`.
 * Returns the text the message is edited to, or null while an earlier tap is
 * still being handled.
 */
export function runReviewFromButton(payload: Payload, now: Date = new Date()): Promise<string | null> {
  return once('tap', async () => {
    const { task, created } = await fileReview(payload, now, 'Telegram with the weekly reminder’s ▶️ Run the review button')
    return created
      ? 'Review requested ✅ — Claude will run it at the next session.'
      : `Already requested ✅ — task #${task.id} is waiting for Claude.`
  })
}
