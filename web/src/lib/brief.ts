import type { Payload } from 'payload'

import type { HqEvent } from '../payload-types'
import { SITE_TZ } from './dates'
import { miamiTime, recordEvent } from './hq'
import { isRunningCount, type MetricSummary } from './postiz'
import { esc, sendMessage, telegramConfigured } from './telegram'

/** How far back the first brief looks, before there is a previous one to start from. */
const FIRST_BRIEF_WINDOW_MS = 24 * 60 * 60 * 1000
const RECENT_LINES = 8
const TASK_LINES = 10

/** The hour, 0–23, on a Miami wall clock. */
export function miamiHour(now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: SITE_TZ,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(now)
  return Number(h)
}

/**
 * Whether an hourly brief run should actually send: only the one at 7 AM on a
 * Miami clock, whatever zone the server runs in. See src/jobs/morningBrief.ts.
 */
export function isBriefHour(now: Date = new Date()): boolean {
  return miamiHour(now) === 7
}

async function since(payload: Payload, now: Date): Promise<Date> {
  const last = await payload.find({
    collection: 'hq-events',
    where: { type: { equals: 'brief.sent' } },
    sort: '-createdAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const at = last.docs[0]?.createdAt
  return at ? new Date(at) : new Date(now.getTime() - FIRST_BRIEF_WINDOW_MS)
}

/**
 * The two numbers per account worth a line in the brief. Labels are the live
 * instance's own (checked 2026-10-01); a label that stops existing just drops
 * out, and an account with none of these falls back to its first two.
 */
export const HEADLINE: Record<string, string[]> = {
  facebook: ['Page followers', 'Page Impressions'],
  instagram: ['Reach', 'Likes'],
  tiktok: ['Followers', 'Total Likes'],
}

const n = (v: number) => new Intl.NumberFormat('en-US').format(Math.round(v))

/** "Reach 1,240". A running count reads its latest value, a flow its sum over the window. */
export function metricLine(label: string, m: MetricSummary): string {
  return `${label} ${n(isRunningCount(label) ? m.latest : m.sum)}`
}

function headline(platform: string, metrics: Record<string, MetricSummary>): string {
  const labels = (HEADLINE[platform] ?? []).filter((l) => metrics[l])
  const pick = labels.length ? labels : Object.keys(metrics).slice(0, 2)
  return pick.map((l) => metricLine(l, metrics[l])).join(' · ')
}

async function socialsSection(payload: Payload, from: Date, now: Date): Promise<string[]> {
  const [channels, posts, clicks] = await Promise.all([
    payload.find({
      collection: 'hq-social-stats',
      where: {
        and: [
          { kind: { equals: 'channel' } },
          { createdAt: { greater_than: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString() } },
        ],
      },
      sort: '-createdAt',
      limit: 20,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'hq-social-stats',
      where: { and: [{ kind: { equals: 'post' } }, { createdAt: { greater_than: from.toISOString() } }] },
      sort: '-createdAt',
      limit: 10,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'hq-clicks',
      where: { createdAt: { greater_than: from.toISOString() } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const out: string[] = []
  const latest = new Map<string, Record<string, MetricSummary>>()
  for (const c of channels.docs) {
    if (!latest.has(c.platform)) latest.set(c.platform, c.metrics as Record<string, MetricSummary>)
  }
  for (const [platform, metrics] of latest) {
    const line = headline(platform, metrics)
    if (line) out.push(`• ${esc(platform)}: ${esc(line)}`)
  }
  for (const p of posts.docs) {
    const draft = typeof p.draft === 'object' ? p.draft?.id : p.draft
    const line = headline(p.platform, p.metrics as Record<string, MetricSummary>)
    out.push(`• Post #${draft ?? '?'} on ${esc(p.platform)} at ${esc(p.checkpoint ?? '?')}: ${esc(line || 'no numbers')}`)
  }
  if (clicks.docs.length) {
    const bySource = new Map<string, number>()
    for (const c of clicks.docs) bySource.set(c.source, (bySource.get(c.source) ?? 0) + 1)
    out.push(
      `• Link clicks: ${[...bySource].sort((a, b) => b[1] - a[1]).map(([s, k]) => `${esc(s)} ${k}`).join(' · ')}`,
    )
  }
  return out.length ? ['', '<b>Socials</b> <i>(accounts: last 7 days)</i>', ...out] : []
}

const count = (payload: Payload, collection: 'listing-requests' | 'listings' | 'hq-social-drafts', where: object) =>
  payload
    .count({ collection, where: where as never, overrideAccess: true })
    .then((r) => r.totalDocs)

/**
 * The brief as Telegram HTML: what happened since the last one, and what is
 * still waiting on the owner. Every section is read from the database, so the
 * brief, the admin and (later) Claude over MCP can never disagree.
 */
export async function buildBrief(payload: Payload, now: Date = new Date()): Promise<string> {
  const from = await since(payload, now)
  const dayAhead = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const [events, tasks, newRequests, needsOwner, pendingDrafts, upcoming] = await Promise.all([
    payload.find({
      collection: 'hq-events',
      where: {
        and: [
          { createdAt: { greater_than: from.toISOString() } },
          { type: { not_equals: 'brief.sent' } },
        ],
      },
      sort: '-createdAt',
      limit: 200,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'hq-tasks',
      where: { status: { not_equals: 'done' } },
      sort: 'dueAt',
      limit: TASK_LINES,
      depth: 0,
      overrideAccess: true,
    }),
    count(payload, 'listing-requests', { status: { equals: 'new' } }),
    count(payload, 'listings', { publicationStatus: { equals: 'needs_owner_confirmation' } }),
    count(payload, 'hq-social-drafts', { status: { equals: 'pending' } }),
    payload.find({
      collection: 'hq-social-drafts',
      where: {
        and: [
          { status: { equals: 'scheduled' } },
          { scheduledFor: { greater_than: now.toISOString() } },
          { scheduledFor: { less_than: dayAhead.toISOString() } },
        ],
      },
      sort: 'scheduledFor',
      limit: 10,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: SITE_TZ,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(now)
  const out: string[] = [`<b>☀️ Flamingo HQ — ${esc(date)}</b>`, '']

  // Since the last brief
  const byType = new Map<string, number>()
  for (const e of events.docs) byType.set(e.type, (byType.get(e.type) ?? 0) + 1)
  out.push(`<b>Since ${esc(miamiTime(from))}</b>`)
  if (!events.docs.length) {
    out.push('Quiet — nothing new.')
  } else {
    out.push([...byType].map(([t, n]) => `${esc(t)} ×${n}`).join(' · '))
    for (const e of events.docs.slice(0, RECENT_LINES) as HqEvent[]) out.push(`• ${esc(e.summary)}`)
    if (events.docs.length > RECENT_LINES) out.push(`<i>…and ${events.docs.length - RECENT_LINES} more in the admin</i>`)
  }

  // Waiting on you
  out.push('', '<b>Waiting on you</b>')
  const waiting = [
    newRequests && `${newRequests} new listing request${newRequests === 1 ? '' : 's'}`,
    pendingDrafts && `${pendingDrafts} social draft${pendingDrafts === 1 ? '' : 's'} to approve`,
    needsOwner && `${needsOwner} listing${needsOwner === 1 ? '' : 's'} still need owner confirmation`,
  ].filter(Boolean)
  out.push(waiting.length ? waiting.map((w) => `• ${w}`).join('\n') : 'Nothing. 🎉')

  if (tasks.docs.length) {
    out.push('', '<b>Open tasks</b>')
    for (const t of tasks.docs) {
      const due = t.dueAt ? ` — due ${esc(miamiTime(t.dueAt))}` : ''
      const who = t.assignee === 'claude' ? ' 🤖' : ''
      out.push(`• ${esc(t.title)}${who}${due}`)
    }
  }

  out.push(...(await socialsSection(payload, from, now)))

  if (upcoming.docs.length) {
    out.push('', '<b>Posting in the next 24h</b>')
    for (const d of upcoming.docs) {
      out.push(`• ${esc(miamiTime(d.scheduledFor))} — ${esc((d.platforms ?? []).join(', '))}`)
    }
  }

  return out.join('\n')
}

/**
 * Build and send the brief, then log it — the log row is what the next brief
 * counts from. Returns false, without logging, when Telegram is not set up, so
 * an unconfigured environment does not silently eat the window.
 */
export async function sendBrief(payload: Payload, now: Date = new Date()): Promise<boolean> {
  if (!telegramConfigured()) return false
  await sendMessage(await buildBrief(payload, now))
  await recordEvent(payload, { type: 'brief.sent', summary: `Brief sent ${miamiTime(now)}` })
  return true
}
