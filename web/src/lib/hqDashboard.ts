import type { Payload } from 'payload'

import type { HqMedia } from '../payload-types'
import { HEADLINE } from './brief'
import { miamiTime } from './hq'
import { socialReport } from './mcpTools'
import { PLATFORMS, isRunningCount, type MetricSummary } from './postiz'
import { KIND_LABEL, isRequestKind } from './requestKinds'

/**
 * Everything the HQ dashboard (`/admin/hq`, components/hq/HqDashboard.tsx)
 * shows, as plain data. The view only renders this, so what the owner sees on
 * the phone is what the test checks.
 *
 * Read-only, and an overview: no visitor PII. Every query names the fields it
 * reads, so a listing request's phone and email, a publish request's preview
 * (which can quote a listing's phone) and an event's `data` are never loaded,
 * let alone rendered. Free text that someone typed (summaries, titles,
 * captions) still goes through `scrub` in case it quotes a contact.
 *
 * Links are admin paths (`/collections/hq-tasks/3`); the view prefixes the
 * admin route.
 */

const DAY = 86_400_000
const LIST = { inbox: 12, requests: 8, tasks: 15, drafts: 10, publish: 10, upcoming: 20 }

export type Metric = { label: string; value: number; window: 'now' | '7d' }

export type HqDashboardData = {
  inbox: {
    count: number
    href: string
    items: { id: number; summary: string; type: string; at: string; href: string }[]
  }
  listingRequests: {
    count: number
    href: string
    items: { id: number; business: string; kind: string; at: string; href: string }[]
  }
  tasks: {
    count: number
    href: string
    items: {
      id: number
      title: string
      claude: boolean
      doing: boolean
      due: string | null
      overdue: boolean
      href: string
    }[]
  }
  drafts: {
    count: number
    href: string
    items: {
      id: number
      caption: string
      platforms: string[]
      when: string
      cover: { url: string; video: boolean } | null
      href: string
    }[]
  }
  publishRequests: {
    count: number
    href: string
    items: {
      id: number
      title: string
      collection: string
      at: string
      expires: string | null
      href: string
    }[]
  }
  upcoming: {
    href: string
    items: { id: number; caption: string; platforms: string[]; when: string; href: string }[]
  }
  week: {
    posts: {
      id: number
      caption: string
      published: string | null
      results: { platform: string; checkpoint: string; metrics: Metric[] }[]
      clicks: number
      href: string
    }[]
    clicks: {
      total: number
      href: string
      bySource: { source: string; count: number; href: string }[]
    }
  }
  accounts: { platform: string; at: string; metrics: Metric[]; href: string }[]
}

const EMAIL = /[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi
// (305) 555-0142, 305-555-0142, 305.555.0142, +1 305 555 0142. Not dates.
const PHONE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b/g

/** Blanks anything shaped like an email or a US phone number. */
export function scrub(text: string): string {
  return text.replace(EMAIL, '[email]').replace(PHONE, '[phone]')
}

function clip(text: string | null | undefined, max = 140): string {
  const t = scrub((text ?? '').replace(/\s+/g, ' ').trim())
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

const doc = (collection: string, id: number | string) => `/collections/${collection}/${id}`

/** A list view filtered by `where`, in the query-string shape the admin reads. */
function list(collection: string, where: Record<string, Record<string, string>> = {}): string {
  const qs = Object.entries(where)
    .flatMap(([field, ops]) =>
      Object.entries(ops).map(([op, v]) => `where[${field}][${op}]=${encodeURIComponent(v)}`),
    )
    .join('&')
  return `/collections/${collection}${qs ? `?${qs}` : ''}`
}

/** The account's headline numbers first, then whatever else there is, up to `max`. */
function pickMetrics(platform: string, readings: Record<string, number>, max = 4): Metric[] {
  const labels = Object.keys(readings)
  const first = (HEADLINE[platform] ?? []).filter((l) => labels.includes(l))
  const ordered = [...first, ...labels.filter((l) => !first.includes(l))].slice(0, max)
  return ordered.map((label) => ({
    label,
    value: readings[label],
    window: isRunningCount(label) ? 'now' : '7d',
  }))
}

function coverOf(media: unknown): { url: string; video: boolean } | null {
  const first = Array.isArray(media) ? media[0] : undefined
  if (!first || typeof first !== 'object') return null
  const m = first as HqMedia
  const url = m.url ?? (m.filename ? `/api/hq-media/file/${encodeURIComponent(m.filename)}` : null)
  if (!url) return null
  return { url, video: (m.mimeType ?? '').startsWith('video/') }
}

export async function loadHqDashboard(
  payload: Payload,
  now: Date = new Date(),
): Promise<HqDashboardData> {
  const weekAgo = new Date(now.getTime() - 7 * DAY).toISOString()
  const weekAhead = new Date(now.getTime() + 7 * DAY).toISOString()
  const common = { depth: 0, overrideAccess: true } as const

  const [events, requests, tasks, drafts, publish, upcoming, clicks, report, ...channels] =
    await Promise.all([
      payload.find({
        collection: 'hq-events',
        where: { status: { equals: 'new' } },
        select: { summary: true, type: true, createdAt: true },
        sort: '-createdAt',
        limit: LIST.inbox,
        ...common,
      }),
      payload.find({
        collection: 'listing-requests',
        where: { status: { equals: 'new' } },
        select: { business: true, kind: true, createdAt: true },
        sort: '-createdAt',
        limit: LIST.requests,
        ...common,
      }),
      payload.find({
        collection: 'hq-tasks',
        where: { status: { not_equals: 'done' } },
        select: { title: true, assignee: true, status: true, dueAt: true, createdAt: true },
        sort: '-createdAt',
        limit: 100,
        ...common,
      }),
      payload.find({
        collection: 'hq-social-drafts',
        where: { status: { equals: 'pending' } },
        select: { caption: true, platforms: true, scheduledFor: true, media: true },
        sort: 'scheduledFor',
        limit: LIST.drafts,
        depth: 1,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'hq-publish-requests',
        where: { status: { equals: 'pending' } },
        select: { title: true, collection: true, createdAt: true, expiresAt: true },
        sort: '-createdAt',
        limit: LIST.publish,
        ...common,
      }),
      payload.find({
        collection: 'hq-social-drafts',
        where: {
          and: [
            { status: { equals: 'scheduled' } },
            { scheduledFor: { greater_than_equal: now.toISOString() } },
            { scheduledFor: { less_than: weekAhead } },
          ],
        },
        select: { caption: true, platforms: true, scheduledFor: true },
        sort: 'scheduledFor',
        limit: LIST.upcoming,
        ...common,
      }),
      payload.find({
        collection: 'hq-clicks',
        where: { createdAt: { greater_than: weekAgo } },
        select: { source: true },
        limit: 10_000,
        pagination: false,
        ...common,
      }),
      socialReport(payload, 7, now),
      ...PLATFORMS.map((platform) =>
        payload.find({
          collection: 'hq-social-stats',
          where: { and: [{ kind: { equals: 'channel' } }, { platform: { equals: platform } }] },
          select: { platform: true, metrics: true, createdAt: true },
          sort: '-createdAt',
          limit: 1,
          ...common,
        }),
      ),
    ])

  // Dated tasks first, soonest first; undated ones after, newest first.
  const sortedTasks = [...tasks.docs].sort((a, b) => {
    if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt)
    if (a.dueAt || b.dueAt) return a.dueAt ? -1 : 1
    return b.createdAt.localeCompare(a.createdAt)
  })

  const bySource = new Map<string, number>()
  for (const c of clicks.docs) bySource.set(c.source, (bySource.get(c.source) ?? 0) + 1)

  return {
    inbox: {
      count: events.totalDocs,
      href: list('hq-events', { status: { equals: 'new' } }),
      items: events.docs.map((e) => ({
        id: e.id,
        summary: clip(e.summary, 160),
        type: e.type,
        at: miamiTime(e.createdAt),
        href: doc('hq-events', e.id),
      })),
    },
    listingRequests: {
      count: requests.totalDocs,
      href: list('listing-requests', { status: { equals: 'new' } }),
      items: requests.docs.map((r) => ({
        id: r.id,
        business: clip(r.business, 80),
        kind: KIND_LABEL[isRequestKind(r.kind) ? r.kind : 'listing'],
        at: miamiTime(r.createdAt),
        href: doc('listing-requests', r.id),
      })),
    },
    tasks: {
      count: tasks.totalDocs,
      href: list('hq-tasks', { status: { not_equals: 'done' } }),
      items: sortedTasks.slice(0, LIST.tasks).map((t) => ({
        id: t.id,
        title: clip(t.title, 120),
        claude: t.assignee === 'claude',
        doing: t.status === 'doing',
        due: t.dueAt ? miamiTime(t.dueAt) : null,
        overdue: Boolean(t.dueAt && new Date(t.dueAt) < now),
        href: doc('hq-tasks', t.id),
      })),
    },
    drafts: {
      count: drafts.totalDocs,
      href: list('hq-social-drafts', { status: { equals: 'pending' } }),
      items: drafts.docs.map((d) => ({
        id: d.id,
        caption: clip(d.caption),
        platforms: d.platforms ?? [],
        when: miamiTime(d.scheduledFor),
        cover: coverOf(d.media),
        href: doc('hq-social-drafts', d.id),
      })),
    },
    publishRequests: {
      count: publish.totalDocs,
      href: list('hq-publish-requests', { status: { equals: 'pending' } }),
      items: publish.docs.map((r) => ({
        id: r.id,
        title: clip(r.title || `${r.collection} #${r.id}`, 120),
        collection: r.collection,
        at: miamiTime(r.createdAt),
        expires: r.expiresAt ? miamiTime(r.expiresAt) : null,
        href: doc('hq-publish-requests', r.id),
      })),
    },
    upcoming: {
      href: list('hq-social-drafts', { status: { equals: 'scheduled' } }),
      items: upcoming.docs.map((d) => ({
        id: d.id,
        caption: clip(d.caption, 100),
        platforms: d.platforms ?? [],
        when: miamiTime(d.scheduledFor),
        href: doc('hq-social-drafts', d.id),
      })),
    },
    week: {
      posts: report.posts.map((p) => ({
        id: p.draft,
        caption: clip(p.caption, 100),
        published: p.publishedMiami,
        results: Object.entries(p.results).map(([platform, r]) => ({
          platform,
          checkpoint: r.checkpoint,
          metrics: pickMetrics(platform, r.metrics, 3),
        })),
        clicks: p.linkClicks,
        href: doc('hq-social-drafts', p.draft),
      })),
      clicks: {
        total: clicks.docs.length,
        href: list('hq-clicks', { createdAt: { greater_than: weekAgo } }),
        bySource: [...bySource]
          .sort((a, b) => b[1] - a[1])
          .map(([source, count]) => ({
            source,
            count,
            href: list('hq-clicks', {
              source: { equals: source },
              createdAt: { greater_than: weekAgo },
            }),
          })),
      },
    },
    accounts: channels.flatMap((r) =>
      r.docs.slice(0, 1).map((c) => {
        const metrics = (c.metrics ?? {}) as Record<string, MetricSummary>
        const readings = Object.fromEntries(
          Object.entries(metrics).map(([label, m]) => [
            label,
            isRunningCount(label) ? m.latest : m.sum,
          ]),
        )
        return {
          platform: c.platform,
          at: miamiTime(c.createdAt),
          metrics: pickMetrics(c.platform, readings),
          href: doc('hq-social-stats', c.id),
        }
      }),
    ),
  }
}
