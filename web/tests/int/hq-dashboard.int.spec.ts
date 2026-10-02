// @vitest-environment node
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { getPayload, type CollectionSlug, type Payload } from 'payload'
import config from '@/payload.config'

import { loadHqDashboard, scrub } from '@/lib/hqDashboard'

const DAY = 86_400_000
const PHONE = '(305) 555-0142'
const EMAIL = 'pat.owner@example.invalid'
const OWNER = 'Pat Q. Owner'
const EMAIL_PATTERN = /[^\s@"]+@[^\s@"]+\.[a-z]{2,}/i
const PHONE_PATTERN = /\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b/

describe('scrub', () => {
  it('blanks emails and US phone numbers, and leaves dates and ids alone', () => {
    expect(scrub(`Call ${PHONE} or 305.555.0142 or +1 305 555 0142, mail ${EMAIL}`)).toBe(
      'Call [phone] or [phone] or [phone], mail [email]',
    )
    expect(scrub('Draft #12345 for 2026-10-01 at 19:30')).toBe(
      'Draft #12345 for 2026-10-01 at 19:30',
    )
  })
})

/**
 * An empty database of its own, so "empty" means empty whatever the other
 * specs have left in the shared one. Same config, a second Payload instance
 * (its own cache key) on a fresh SQLite file; Payload pushes the schema.
 */
describe('HQ dashboard on an empty database', () => {
  let payload: Payload
  let dir: string

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'hq-dash-'))
    const base = await config
    // Sanitized and raw adapter types differ only in an optional flag.
    const db = sqliteAdapter({
      client: { url: `file:${path.join(dir, 'empty.db')}` },
    }) as unknown as typeof base.db
    payload = await getPayload({ config: { ...base, db }, key: 'hq-dashboard-empty' })
  })

  afterAll(async () => {
    await payload?.destroy?.().catch(() => undefined)
    rmSync(dir, { recursive: true, force: true })
  })

  it('renders every section with zero counts and no rows', async () => {
    const d = await loadHqDashboard(payload)
    expect(d.inbox).toMatchObject({ count: 0, items: [] })
    expect(d.listingRequests).toMatchObject({ count: 0, items: [] })
    expect(d.tasks).toMatchObject({ count: 0, items: [] })
    expect(d.drafts).toMatchObject({ count: 0, items: [] })
    expect(d.publishRequests).toMatchObject({ count: 0, items: [] })
    expect(d.upcoming.items).toEqual([])
    expect(d.week.posts).toEqual([])
    expect(d.week.clicks).toMatchObject({ total: 0, bySource: [] })
    expect(d.accounts).toEqual([])
    // Plain data: it survives the trip to the client unchanged.
    expect(JSON.parse(JSON.stringify(d))).toEqual(d)
  })
})

describe('HQ dashboard with data', () => {
  let payload: Payload
  const created: { collection: CollectionSlug; id: number }[] = []
  const now = new Date()
  const ids: Record<string, number> = {}

  const make = async <T extends { id: number }>(
    collection: CollectionSlug,
    data: Record<string, unknown>,
  ) => {
    const doc = (await payload.create({
      collection,
      data: data as never,
      overrideAccess: true,
      context: { hqInternal: true },
    })) as unknown as T
    created.push({ collection, id: doc.id })
    return doc
  }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const iso = (offset: number) => new Date(now.getTime() + offset).toISOString()

    ids.request = (
      await make('listing-requests', {
        business: 'DASH-TEST Panadería',
        owner: OWNER,
        phone: PHONE,
        email: EMAIL,
        story: `Call me at ${PHONE}`,
        status: 'new',
      })
    ).id
    ids.event = (
      await make('hq-events', {
        type: 'test.note',
        summary: `DASH-TEST note, reply to ${EMAIL}`,
        status: 'new',
      })
    ).id
    ids.later = (
      await make('hq-tasks', { title: 'DASH-TEST later', dueAt: iso(3 * DAY), assignee: 'me' })
    ).id
    ids.soon = (
      await make('hq-tasks', { title: 'DASH-TEST soon', dueAt: iso(-DAY), assignee: 'claude' })
    ).id
    ids.pending = (
      await make('hq-social-drafts', {
        caption: 'DASH-TEST pending post',
        platforms: ['facebook'],
        scheduledFor: iso(2 * DAY),
        status: 'pending',
      })
    ).id
    ids.scheduled = (
      await make('hq-social-drafts', {
        caption: 'DASH-TEST scheduled post',
        platforms: ['facebook'],
        scheduledFor: iso(2 * DAY),
        status: 'scheduled',
      })
    ).id
    ids.farOff = (
      await make('hq-social-drafts', {
        caption: 'DASH-TEST far-off post',
        platforms: ['facebook'],
        scheduledFor: iso(10 * DAY),
        status: 'scheduled',
      })
    ).id
    ids.posted = (
      await make('hq-social-drafts', {
        caption: 'DASH-TEST posted',
        platforms: ['facebook'],
        scheduledFor: iso(-2 * DAY),
        publishAt: iso(-2 * DAY),
        status: 'scheduled',
      })
    ).id
    await make('hq-social-stats', {
      kind: 'post',
      platform: 'facebook',
      checkpoint: '24h',
      draft: ids.posted,
      metrics: { 'Post Impressions': { latest: 40, sum: 210 } },
    })
    await make('hq-clicks', { source: 'fb', draft: ids.posted, to: '/es' })
    await make('hq-clicks', { source: 'dash-test-bio', to: '/es' })
    ids.channel = (
      await make('hq-social-stats', {
        kind: 'channel',
        platform: 'facebook',
        metrics: {
          'Page Impressions': { latest: 10, sum: 345 },
          'Page followers': { latest: 120, sum: 800 },
        },
      })
    ).id
    ids.publish = (
      await make('hq-publish-requests', {
        title: 'DASH-TEST listing',
        collection: 'listings',
        targetId: '1',
        status: 'pending',
        reason: `Owner asked; their cell is ${PHONE}`,
        preview: `Phone: ${PHONE}\nEmail: ${EMAIL}`,
      })
    ).id
  })

  afterAll(async () => {
    if (!payload) return
    for (const { collection, id } of created.reverse()) {
      await payload.delete({ collection, id, overrideAccess: true }).catch(() => undefined)
    }
    await payload
      .delete({
        collection: 'hq-events',
        where: {
          and: [
            { refCollection: { equals: 'listing-requests' } },
            { refId: { equals: String(ids.request) } },
          ],
        },
        overrideAccess: true,
      })
      .catch(() => undefined)
  })

  it('lists what is waiting, each linked to its record', async () => {
    const d = await loadHqDashboard(payload, now)

    expect(d.inbox.count).toBeGreaterThanOrEqual(2)
    expect(d.inbox.items.find((e) => e.id === ids.event)).toMatchObject({
      href: `/collections/hq-events/${ids.event}`,
    })
    expect(d.inbox.href).toBe('/collections/hq-events?where[status][equals]=new')

    expect(d.listingRequests.items.find((r) => r.id === ids.request)).toEqual(
      expect.objectContaining({
        business: 'DASH-TEST Panadería',
        href: `/collections/listing-requests/${ids.request}`,
      }),
    )

    // Soonest due first; Claude's marked; overdue flagged.
    const mine = d.tasks.items.filter((t) => t.title.startsWith('DASH-TEST'))
    expect(mine.map((t) => t.title)).toEqual(['DASH-TEST soon', 'DASH-TEST later'])
    expect(mine[0]).toMatchObject({ claude: true, overdue: true })
    expect(mine[1]).toMatchObject({ claude: false, overdue: false })

    expect(d.drafts.items.find((p) => p.id === ids.pending)).toMatchObject({
      caption: 'DASH-TEST pending post',
      platforms: ['facebook'],
      cover: null,
      href: `/collections/hq-social-drafts/${ids.pending}`,
    })

    expect(d.publishRequests.items.find((r) => r.id === ids.publish)).toMatchObject({
      title: 'DASH-TEST listing',
      collection: 'listings',
      href: `/collections/hq-publish-requests/${ids.publish}`,
    })

    const upcoming = d.upcoming.items.map((p) => p.id)
    expect(upcoming).toContain(ids.scheduled)
    expect(upcoming).not.toContain(ids.farOff)
    expect(upcoming).not.toContain(ids.posted)
  })

  it('shows the week’s post results, clicks and the latest account numbers', async () => {
    const d = await loadHqDashboard(payload, now)

    const post = d.week.posts.find((p) => p.id === ids.posted)
    expect(post).toMatchObject({ clicks: 1, href: `/collections/hq-social-drafts/${ids.posted}` })
    expect(post?.results).toEqual([
      {
        platform: 'facebook',
        checkpoint: '24h',
        metrics: [{ label: 'Post Impressions', value: 210, window: '7d' }],
      },
    ])

    expect(d.week.clicks.total).toBeGreaterThanOrEqual(2)
    expect(d.week.clicks.bySource.find((s) => s.source === 'dash-test-bio')).toMatchObject({
      count: 1,
    })

    // A running count reads its latest value, a flow its sum; headline first.
    expect(d.accounts.find((a) => a.platform === 'facebook')).toMatchObject({
      href: `/collections/hq-social-stats/${ids.channel}`,
      metrics: [
        { label: 'Page followers', value: 120, window: 'now' },
        { label: 'Page Impressions', value: 345, window: '7d' },
      ],
    })
  })

  it('carries no phone, email or contact name', async () => {
    const json = JSON.stringify(await loadHqDashboard(payload, now))
    expect(json).not.toContain('555-0142')
    expect(json).not.toContain(EMAIL)
    expect(json).not.toContain(OWNER)
    expect(json).not.toMatch(EMAIL_PATTERN)
    expect(json).not.toMatch(PHONE_PATTERN)
    expect(json).toContain('DASH-TEST note, reply to [email]')
  })
})
