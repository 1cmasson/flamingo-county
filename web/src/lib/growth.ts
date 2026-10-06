import type { Payload } from 'payload'

import type { HqVisit } from '../payload-types'
import { addDays, todayISO } from './dates'
import { esc } from './telegram'
import { channelOf, isDatacenterCity, type Channel } from './visits'

/**
 * The growth loop: what the site's own counter saw (`trafficReport`), the
 * brief's one-line version of it, and `/review` in Telegram, which asks Claude
 * for a growth review (web/hq/growth-review.md).
 *
 * There is no schedule. The owner asks; the next Claude session runs it.
 */

const DAY = 24 * 60 * 60 * 1000
const TOP = 15

type Tally = Map<string, number>
const bump = (m: Tally, k: string | null | undefined, n = 1) => {
  if (k) m.set(k, (m.get(k) ?? 0) + n)
}
const top = (m: Tally, n = TOP) =>
  [...m]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([key, count]) => ({ key, count }))

const pct = (now: number, before: number): number | null =>
  before === 0 ? null : Math.round(((now - before) / before) * 100)

/**
 * Views and visits over the last `days` Miami days (today included), from
 * `hq-visits`. Visits are entry rows; views are all rows.
 *
 * Aggregated here rather than in SQL to stay on Payload's API. That is fine
 * into the tens of thousands of rows a month; past that, move it to a GROUP BY.
 */
export async function trafficReport(payload: Payload, days = 28, now: Date = new Date()) {
  const today = todayISO(now)
  const firstDay = addDays(today, -(days - 1))
  // A day either side in UTC, then filtered by Miami day, so the edges are right.
  const since = new Date(new Date(`${firstDay}T00:00:00.000Z`).getTime() - DAY)

  const [rows, first] = await Promise.all([
    payload.find({
      collection: 'hq-visits',
      where: { createdAt: { greater_than_equal: since.toISOString() } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { path: true, entry: true, source: true, refHost: true, device: true, country: true, region: true, city: true, createdAt: true },
    }),
    payload.find({ collection: 'hq-visits', sort: 'createdAt', limit: 1, depth: 0, overrideAccess: true, select: { createdAt: true } }),
  ])

  const daily = new Map<string, { views: number; visits: number }>()
  for (let i = 0; i < days; i++) daily.set(addDays(firstDay, i), { views: 0, visits: 0 })

  const lastWeekFrom = addDays(today, -6)
  const prevWeekFrom = addDays(today, -13)
  const week = { views: 0, visits: 0 }
  const prevWeek = { views: 0, visits: 0 }

  const channels = new Map<Channel, number>()
  const sources: Tally = new Map()
  const referrers: Tally = new Map()
  const landing: Tally = new Map()
  const pages: Tally = new Map()
  const lang: Tally = new Map()
  const device: Tally = new Map()
  const countries: Tally = new Map()
  const regions: Tally = new Map()
  const cities: Tally = new Map()
  let views = 0
  let visits = 0

  for (const v of rows.docs as HqVisit[]) {
    const d = todayISO(new Date(v.createdAt))
    const bucket = daily.get(d)
    // Rows stored before `recordVisit` learned to drop platform link checkers.
    if (!bucket || isDatacenterCity(v.city)) continue
    views += 1
    bucket.views += 1
    bump(pages, v.path)
    const l = v.path.split('/')[1]
    bump(lang, l === 'es' || l === 'en' ? l : 'other')
    if (d >= lastWeekFrom) week.views += 1
    else if (d >= prevWeekFrom) prevWeek.views += 1
    if (!v.entry) continue

    visits += 1
    bucket.visits += 1
    if (d >= lastWeekFrom) week.visits += 1
    else if (d >= prevWeekFrom) prevWeek.visits += 1
    const source = v.source || 'direct'
    const channel = channelOf(source)
    channels.set(channel, (channels.get(channel) ?? 0) + 1)
    bump(sources, source)
    if (channel === 'referral') bump(referrers, v.refHost ?? source)
    bump(landing, v.path)
    bump(device, v.device)
    bump(countries, v.country)
    bump(regions, v.country && v.region ? `${v.country}-${v.region}` : null)
    bump(cities, v.city)
  }

  const measuredSince = first.docs[0]?.createdAt ?? null
  return {
    window: { from: firstDay, to: today, days },
    measuredSince,
    note:
      'Site visit counter (hq-visits). A visit = its first page (entry); views = every page. Bots, link previews, platform link checkers in data centres, anyone signed in to the admin and devices the owner marked at /api/view/self are not counted. Until the owner marked their devices, their own signed-out browsing was counted too (likely most early "Miami Gardens" visits), so read the first days with care. Region/city only appear once Cloudflare sends location headers. Small numbers: compare weeks, not days.',
    totals: { views, visits },
    last7Days: { ...week, visitsChangePct: pct(week.visits, prevWeek.visits) },
    previous7Days: prevWeek,
    daily: [...daily].map(([day, n]) => ({ day, ...n })),
    visitsByChannel: Object.fromEntries(
      (['search', 'social', 'ai', 'referral', 'campaign', 'direct'] as Channel[]).map((c) => [c, channels.get(c) ?? 0]),
    ),
    visitsBySource: top(sources),
    // Links from other websites: partners, press, directories. Each is a backlink worth knowing about.
    referringSites: top(referrers),
    landingPages: top(landing),
    topPages: top(pages),
    viewsByLanguage: Object.fromEntries(lang),
    visitsByDevice: Object.fromEntries(device),
    visitsByCountry: top(countries, 5),
    visitsByRegion: top(regions, 5),
    visitsByCity: top(cities, 10),
  }
}

export type TrafficReport = Awaited<ReturnType<typeof trafficReport>>

/**
 * The brief's "Site" section: last 7 days of visits and where they came from.
 * Empty until the counter has its first row, so a fresh install says nothing.
 */
export function siteSection(t: TrafficReport): string[] {
  if (!t.measuredSince) return []
  const { visits, views, visitsChangePct } = t.last7Days
  const change =
    visitsChangePct === null ? '' : ` (${visitsChangePct >= 0 ? '+' : ''}${visitsChangePct}% vs the week before)`
  const out = ['', '<b>Site</b> <i>(last 7 days)</i>', `• ${visits} visit${visits === 1 ? '' : 's'}${change} · ${views} page views`]
  // Sources over the same 7 days would need a second pass; the 28-day mix is
  // steadier at these numbers anyway, and is labeled as such.
  const mix = t.visitsBySource.slice(0, 4)
  if (mix.length) out.push(`• From (28 days): ${mix.map((s) => `${esc(s.key)} ${s.count}`).join(' · ')}`)
  const landing = t.landingPages[0]
  if (landing) out.push(`• Top landing page (28 days): ${esc(landing.key)} (${landing.count})`)
  return out
}

/**
 * Every review task's title starts with exactly this, and that prefix is how
 * one is recognized: by the dedup below, by the MCP server's instructions and
 * by growth-review.md. Other tasks merely *about* the growth review (the build
 * task, say) must not count as a request for one.
 */
export const REVIEW_PREFIX = 'Growth review (asked '

/**
 * `/review` in Telegram: file one task asking Claude for a growth review, and
 * answer at once with this week's numbers so the tap is never empty-handed.
 * A second `/review` while one is still open points at it instead of piling up.
 */
export async function requestReview(payload: Payload, now: Date = new Date()): Promise<string> {
  const open = await payload.find({
    collection: 'hq-tasks',
    where: {
      and: [
        { title: { contains: REVIEW_PREFIX } },
        { assignee: { equals: 'claude' } },
        { status: { not_equals: 'done' } },
      ],
    },
    limit: 20,
    depth: 0,
    overrideAccess: true,
  })
  // `contains` ignores case and position; the prefix must be the start.
  const pending = open.docs.find((t) => t.title.startsWith(REVIEW_PREFIX))

  let head: string
  if (pending) {
    head = `🤖 Already asked: task #${pending.id} is waiting for Claude.`
  } else {
    const task = await payload.create({
      collection: 'hq-tasks',
      data: {
        title: `${REVIEW_PREFIX}${todayISO(now)})`,
        detail:
          'Asked for in Telegram with /review. Run web/hq/growth-review.md: hqGrowthContext, close or open experiments, rewrite the playbook, up to 3 next moves, one Telegram summary.',
        assignee: 'claude',
        status: 'open',
      },
      overrideAccess: true,
    })
    head = `🤖 Growth review filed as task #${task.id}. Next time you open Claude Code on Flamingo County, it runs first and sends you the summary here.`
  }

  const t = await trafficReport(payload, 28, now)
  const site = siteSection(t)
  return [head, ...(site.length ? site : ['', '<i>The site counter has no visits yet.</i>'])].join('\n')
}
