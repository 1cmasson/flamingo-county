// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import config from '@payload-config'
import { HQ_INTERNAL, decideDraft, draftFingerprint } from '../../src/lib/hq'
import { STALE_AFTER_MS, eventGone, outdatedProblem } from '../../src/lib/outdated'
import type { HqSocialDraft } from '../../src/payload-types'
import { makeHqMedia } from './helpers/facebook'

describe('eventGone', () => {
  const now = new Date('2026-10-19T22:00:00Z')
  const ev = { date: '2026-10-19T12:00:00.000Z', eventStatus: 'scheduled', _status: 'published' } as const
  it('keeps an event that is on today or still running', () => {
    expect(eventGone(ev, now)).toBeNull()
    expect(eventGone({ ...ev, date: '2026-10-03T12:00:00.000Z', endDate: '2026-10-31T12:00:00.000Z' }, now)).toBeNull()
  })
  it('names why an event is gone', () => {
    expect(eventGone({ ...ev, date: '2026-10-18T12:00:00.000Z' }, now)).toMatch(/over/)
    expect(eventGone({ ...ev, eventStatus: 'cancelled' }, now)).toMatch(/cancelled/)
    expect(eventGone({ ...ev, eventStatus: 'postponed' }, now)).toMatch(/postponed/)
    expect(eventGone({ ...ev, _status: 'draft' }, now)).toMatch(/no longer on the site/)
  })
})

describe('outdated event drafts, against the database', () => {
  let payload: Payload
  let mediaId: number
  let kind: number
  let city: number
  const drafts: number[] = []
  const events: number[] = []
  const calls: string[] = []

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    mediaId = await makeHqMedia(payload)
    const stamp = Date.now()
    kind = (await payload.create({ collection: 'event-kinds', data: { slug: `od-kind-${stamp}`, label: 'Music', bg: '#000', ink: '#fff' } as never, overrideAccess: true })).id
    city = (await payload.create({ collection: 'cities', data: { slug: `od-city-${stamp}`, name: 'HIALEAH' } as never, overrideAccess: true })).id
  })
  beforeEach(() => {
    calls.length = 0
    process.env.POSTIZ_API_URL = 'https://postiz.test/api/public/v1'
    process.env.POSTIZ_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url))
      return new Response('{}', { status: 200 })
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.POSTIZ_API_URL
    delete process.env.POSTIZ_API_KEY
  })
  afterAll(async () => {
    for (const id of drafts) await payload.delete({ collection: 'hq-social-drafts', id, overrideAccess: true }).catch(() => undefined)
    for (const id of events) await payload.delete({ collection: 'events', id, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'hq-media', id: mediaId, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'event-kinds', id: kind, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'cities', id: city, overrideAccess: true }).catch(() => undefined)
  })

  const event = async (date: string) => {
    const slug = `od-event-${Date.now()}-${Math.round(Math.random() * 1e6)}`
    const ev = await payload.create({
      collection: 'events',
      data: { slug, title: 'Son night', date, timeLabel: '9PM', kind, venueType: 'place', place: 'Park', city, _status: 'published' } as never,
      overrideAccess: true,
    })
    events.push(ev.id)
    return ev
  }
  const story = async (slug: string, data: Record<string, unknown> = {}) => {
    const d = await payload.create({
      collection: 'hq-social-drafts',
      data: {
        caption: `Son night\n👉 https://flamingocounty.com/es/events/${slug}`,
        format: 'story',
        platforms: ['instagram'],
        pillar: 'event',
        language: 'es',
        media: [mediaId],
        scheduledFor: '2030-01-01T13:00:00Z',
        status: 'pending',
        ...data,
      } as never,
      overrideAccess: true,
      context: { [HQ_INTERNAL]: true },
    })
    drafts.push(d.id)
    await payload.update({ collection: 'hq-social-drafts', id: d.id, data: { previewedHash: draftFingerprint(d as never) }, overrideAccess: true, context: { [HQ_INTERNAL]: true } })
    return d as HqSocialDraft
  }

  it('refuses at Approve a story for a finished event, and rejects it', async () => {
    const ev = await event('2020-01-01T12:00:00.000Z')
    const d = await story(ev.slug)
    expect(await decideDraft(payload, d.id, 'approve')).toMatch(/not posted: its event is over/)
    const after = await payload.findByID({ collection: 'hq-social-drafts', id: d.id, overrideAccess: true })
    expect(after.status).toBe('rejected')
    expect(after.error).toMatch(/Outdated/)
    expect(calls).toHaveLength(0)
  })

  it('finds the event by its key as well as by the caption', async () => {
    const ev = await event('2020-01-01T12:00:00.000Z')
    const d = await story('some-other-page', { dedupeKey: `event-story:${ev.id}` })
    expect(await outdatedProblem(payload, d)).toMatch(/over/)
  })

  it('lets through a story for an event still ahead', async () => {
    const ev = await event('2030-01-01T12:00:00.000Z')
    expect(await outdatedProblem(payload, await story(ev.slug))).toBeNull()
  })

  it('refuses a carousel approved long after its time, not one set a few minutes back', async () => {
    const now = new Date('2026-10-22T16:00:00Z')
    const carousel = (scheduledFor: string) =>
      ({ pillar: 'event', caption: 'Lo que hay esta semana', scheduledFor, sourceCollection: null, sourceId: null, dedupeKey: null }) as HqSocialDraft
    expect(await outdatedProblem(payload, carousel('2026-10-19T15:30:00Z'), now)).toMatch(/out of date/)
    expect(await outdatedProblem(payload, carousel(new Date(now.getTime() - 5 * 60_000).toISOString()), now)).toBeNull()
    expect(await outdatedProblem(payload, carousel(new Date(now.getTime() - STALE_AFTER_MS - 1).toISOString()), now)).toMatch(/out of date/)
    expect(await outdatedProblem(payload, { ...carousel('2020-01-01T00:00:00Z'), pillar: 'story' }, now)).toBeNull()
  })

  it('takes down a waiting story when its event is cancelled', async () => {
    const ev = await event('2030-01-01T12:00:00.000Z')
    const d = await story(ev.slug)
    await payload.update({ collection: 'events', id: ev.id, data: { eventStatus: 'cancelled' } as never, overrideAccess: true })
    expect((await payload.findByID({ collection: 'hq-social-drafts', id: d.id, overrideAccess: true })).status).toBe('rejected')
  })

  it('leaves the story alone on a draft save of the event', async () => {
    const ev = await event('2030-01-01T12:00:00.000Z')
    const d = await story(ev.slug)
    await payload.update({ collection: 'events', id: ev.id, data: { eventStatus: 'cancelled' } as never, draft: true, overrideAccess: true })
    expect((await payload.findByID({ collection: 'hq-social-drafts', id: d.id, overrideAccess: true })).status).toBe('pending')
  })
})
