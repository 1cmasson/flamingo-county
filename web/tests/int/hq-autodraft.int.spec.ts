// @vitest-environment node
// Uploads (the event's photo) need Node's Blob and fs, not jsdom's.

import path from 'path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { draftForPublished, pickPostTime, postDeadline } from '@/lib/autoDraft'
import { HQ_INTERNAL } from '@/lib/hq'
import type { Event, HqSocialDraft, Story } from '@/payload-types'

const OWNER = '1001'

function fakeTelegram() {
  const sent: { method: string; body: unknown }[] = []
  let messageId = 900
  // Anything that is not Telegram goes through: the event card's renderer
  // loads its WebAssembly with fetch.
  const realFetch = globalThis.fetch
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (!String(input instanceof Request ? input.url : input).includes('api.telegram.org')) return realFetch(input, init)
      const method = String(input).split('/').pop()!
      sent.push({ method, body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body })
      return Response.json({ ok: true, result: { message_id: ++messageId } })
    }),
  )
  /** The preview of a draft: a photo with its caption, or a text message. */
  const previews = () =>
    sent
      .filter((s) => s.method === 'sendPhoto' || s.method === 'sendMessage')
      .map((s) =>
        s.body instanceof FormData ? String(s.body.get('caption')) : String((s.body as { text?: string }).text),
      )
      .filter((t) => t.includes('Social draft #'))
  return { previews }
}

/** A Miami wall-clock time in October 2026 (EDT, UTC-4) as an instant. */
const oct = (day: number, hhmm: string) => new Date(`2026-10-${String(day).padStart(2, '0')}T${hhmm}:00-04:00`)
const iso = (d: Date) => d.toISOString()

describe('pickPostTime: when an auto-draft goes out', () => {
  const farEvent = postDeadline({ date: '2026-12-31T12:00:00.000Z', endDate: null, startTime: '20:00' }, oct(2, '00:10'))

  it('a publish at 00:10 Miami lands at 11:30 the same day, not at midnight', () => {
    expect(iso(pickPostTime(oct(2, '00:10'), [], farEvent))).toBe(iso(oct(2, '11:30')))
  })

  it('takes the evening slot after the morning one has gone, and needs 30 minutes of notice', () => {
    expect(iso(pickPostTime(oct(2, '11:05'), [], farEvent))).toBe(iso(oct(2, '19:00')))
    expect(iso(pickPostTime(oct(2, '18:35'), [], farEvent))).toBe(iso(oct(3, '11:30')))
    // A story has no deadline at all.
    expect(iso(pickPostTime(oct(2, '00:10'), [], null))).toBe(iso(oct(2, '11:30')))
  })

  it('skips a slot within 3 hours of another waiting draft', () => {
    expect(iso(pickPostTime(oct(2, '00:10'), [oct(2, '11:30')], farEvent))).toBe(iso(oct(2, '19:00')))
    // 13:00 is 1.5 hours from 11:30; 19:00 is six hours clear of it.
    expect(iso(pickPostTime(oct(2, '00:10'), [oct(2, '13:00')], farEvent))).toBe(iso(oct(2, '19:00')))
    expect(iso(pickPostTime(oct(2, '00:10'), [oct(2, '11:30'), oct(2, '19:00')], farEvent))).toBe(iso(oct(3, '11:30')))
  })

  it('never schedules after the event starts', () => {
    const now = oct(2, '10:00')
    // Starts at noon: the 11:30 slot is free and before it.
    const noon = postDeadline({ date: '2026-10-02T12:00:00.000Z', endDate: null, startTime: '12:00' }, now)
    expect(iso(pickPostTime(now, [], noon))).toBe(iso(oct(2, '11:30')))
    // 11:30 is crowded, but 19:00 is after the start: 11:30 anyway, spacing or not.
    expect(iso(pickPostTime(now, [oct(2, '11:00')], noon))).toBe(iso(oct(2, '11:30')))
    // Starts at 13:00 and it is 11:15: the next slot (19:00) is too late, so it goes out on approval.
    const late = oct(2, '11:15')
    const one = postDeadline({ date: '2026-10-02T12:00:00.000Z', endDate: null, startTime: '13:00' }, late)
    expect(iso(pickPostTime(late, [], one))).toBe(iso(late))
  })

  it('an event with no clock may still go out on the morning of its day', () => {
    const sat = postDeadline({ date: '2026-10-03T12:00:00.000Z', endDate: null, startTime: null }, oct(2, '20:00'))
    expect(iso(sat)).toBe(iso(oct(3, '11:30')))
    expect(iso(pickPostTime(oct(2, '20:00'), [], sat))).toBe(iso(oct(3, '11:30')))
  })

  it('a run that has already started is announced while it lasts, not at once', () => {
    const now = oct(2, '00:10')
    const exhibit = postDeadline({ date: '2026-09-18T12:00:00.000Z', endDate: '2026-10-19T12:00:00.000Z', startTime: null }, now)
    expect(iso(exhibit)).toBe(iso(oct(19, '19:00')))
    expect(iso(pickPostTime(now, [], exhibit))).toBe(iso(oct(2, '11:30')))
  })

  it('keeps Miami wall-clock times across the end of daylight time', () => {
    // 1 November 2026: EDT until 2 AM, EST after. 11:30 EST is 16:30 UTC.
    const now = new Date('2026-11-01T00:10:00-04:00')
    expect(iso(pickPostTime(now, [], null))).toBe('2026-11-01T16:30:00.000Z')
    expect(iso(pickPostTime(new Date('2026-11-01T12:00:00-05:00'), [], null))).toBe('2026-11-02T00:00:00.000Z')
  })
})

describe('auto-drafting a social post when a page goes live', () => {
  let payload: Payload
  const made: { collection: 'events' | 'stories' | 'event-kinds' | 'cities' | 'media'; id: number }[] = []
  let kind: number
  let city: number
  let photo: number

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const stamp = Date.now()
    kind = (await payload.create({ collection: 'event-kinds', data: { slug: `ad-kind-${stamp}`, label: 'Music', bg: '#000', ink: '#fff' } as never, overrideAccess: true })).id
    city = (await payload.create({ collection: 'cities', data: { slug: `ad-city-${stamp}`, name: 'LITTLE HAVANA' } as never, overrideAccess: true })).id
    photo = (
      await payload.create({
        collection: 'media',
        data: { alt: 'A band' },
        filePath: path.resolve(process.cwd(), 'public/uploads/flamingo-city-favicon-180.png'),
        overrideAccess: true,
      })
    ).id
    made.push({ collection: 'event-kinds', id: kind }, { collection: 'cities', id: city }, { collection: 'media', id: photo })
  })

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.TELEGRAM_OWNER_CHAT_ID = OWNER
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_OWNER_CHAT_ID
  })

  afterAll(async () => {
    if (!payload) return
    const ids = made.filter((m) => m.collection === 'events' || m.collection === 'stories').map((m) => String(m.id))
    const { docs } = await payload.find({ collection: 'hq-social-drafts', where: { sourceId: { in: ids } }, limit: 100, overrideAccess: true })
    for (const d of docs) {
      await payload.delete({ collection: 'hq-social-drafts', id: d.id, overrideAccess: true })
      for (const m of d.media ?? []) {
        await payload.delete({ collection: 'hq-media', id: typeof m === 'object' ? m.id : m, overrideAccess: true }).catch(() => undefined)
      }
      await payload.delete({ collection: 'hq-events', where: { refId: { equals: String(d.id) } }, overrideAccess: true })
    }
    for (const m of made.reverse()) await payload.delete({ collection: m.collection, id: m.id, overrideAccess: true }).catch(() => undefined)
  })

  const draftsFor = async (collection: string, id: number) =>
    (
      await payload.find({
        collection: 'hq-social-drafts',
        where: { and: [{ sourceCollection: { equals: collection } }, { sourceId: { equals: String(id) } }] },
        depth: 1,
        overrideAccess: true,
      })
    ).docs as HqSocialDraft[]

  /** A bilingual event saved as a draft, as Claude would leave it. */
  async function draftEvent(date: string, extra: Record<string, unknown> = {}): Promise<Event> {
    const slug = `ad-event-${Date.now()}-${Math.round(Math.random() * 1e6)}`
    const ev = await payload.create({
      collection: 'events',
      data: {
        slug,
        title: 'Son night',
        date,
        timeLabel: '9PM–1AM',
        kind,
        venueType: 'place',
        place: 'Máximo Gómez Park',
        city,
        freeLabel: 'FREE ENTRY',
        note: 'Live son and a domino table.',
        image: photo,
        _status: 'draft',
        ...extra,
      } as never,
      locale: 'en',
      draft: true,
      overrideAccess: true,
    })
    made.push({ collection: 'events', id: ev.id })
    await payload.update({
      collection: 'events',
      id: ev.id,
      data: { title: 'Noche de son', timeLabel: '9PM–1AM', place: 'Parque Máximo Gómez', freeLabel: 'ENTRADA LIBRE', note: 'Son en vivo. Entrada $20 en la puerta.' } as never,
      locale: 'es',
      draft: true,
      overrideAccess: true,
    })
    return ev as Event
  }

  const publish = (collection: 'events' | 'stories', id: number) =>
    payload.update({ collection, id, data: { _status: 'published' } as never, draft: false, overrideAccess: true })

  it('saving a draft drafts nothing; publishing it drafts exactly one pending post, from the record alone', async () => {
    const tg = fakeTelegram()
    const ev = await draftEvent('2099-03-14')
    expect(await draftsFor('events', ev.id)).toHaveLength(0)

    await publish('events', ev.id)
    const drafts = await draftsFor('events', ev.id)
    expect(drafts).toHaveLength(1)
    const d = drafts[0]
    expect(d).toMatchObject({ status: 'pending', pillar: 'event', language: 'both', platforms: ['facebook', 'instagram'] })

    // Every line is a field of the event; the Spanish note named a price, so it is left out.
    expect(d.caption).toBe(
      [
        'Noche de son',
        '🗓 Sábado, 14 de marzo · 9PM–1AM',
        '📍 Parque Máximo Gómez, Little Havana',
        'ENTRADA LIBRE',
        '',
        'Son night',
        '🗓 Saturday, March 14 · 9PM–1AM',
        '📍 Máximo Gómez Park, Little Havana',
        'FREE ENTRY',
        'Live son and a domino table.',
        '',
        `👉 https://flamingocounty.com/go/fb/${d.id}?to=/es/events/${ev.slug}`,
      ].join('\n'),
    )
    expect(d.caption).not.toContain('$')
    expect(d.caption).not.toContain('Entrada')

    // The site's WebP photo, re-encoded into HQ media as a JPEG.
    const media = d.media?.[0]
    expect(typeof media === 'object' && media?.mimeType).toBe('image/jpeg')

    // The day after, at 7 PM Miami time.
    expect(new Date(d.scheduledFor).getTime()).toBeGreaterThan(Date.now())

    // One Telegram preview, of the final caption with its link.
    await vi.waitFor(() => expect(tg.previews()).toHaveLength(1))
    expect(tg.previews()[0]).toContain(`/go/fb/${d.id}`)
    await vi.waitFor(async () =>
      expect((await payload.findByID({ collection: 'hq-social-drafts', id: d.id, overrideAccess: true })).telegramMessageId).toBeTruthy(),
    )
  })

  it('never drafts a page twice: not on a republish, nor on saving the live page again', async () => {
    const tg = fakeTelegram()
    const ev = await draftEvent('2099-03-14')
    await publish('events', ev.id)
    expect(await draftsFor('events', ev.id)).toHaveLength(1)

    // Edited as a draft, then published again: that is draft → published once more.
    await payload.update({ collection: 'events', id: ev.id, data: { title: 'Son night, again' } as never, locale: 'en', draft: true, overrideAccess: true })
    await publish('events', ev.id)
    // The live page saved again, published → published.
    await publish('events', ev.id)
    expect(await draftsFor('events', ev.id)).toHaveLength(1)
    await vi.waitFor(() => expect(tg.previews()).toHaveLength(1))
  })

  it('makes a text-only Facebook draft for a page with no photo', async () => {
    const tg = fakeTelegram()
    const story = (await payload.create({
      collection: 'stories',
      data: { slug: `ad-story-${Date.now()}`, title: 'The last cigar roller', dek: 'Forty years at one bench.', _status: 'draft' } as never,
      locale: 'en',
      draft: true,
      overrideAccess: true,
    })) as Story
    made.push({ collection: 'stories', id: story.id })
    await payload.update({ collection: 'stories', id: story.id, data: { title: 'El último torcedor' } as never, locale: 'es', draft: true, overrideAccess: true })
    // A draft left by a deleted page whose id SQLite has handed on to this one.
    const stale = await payload.create({
      collection: 'hq-social-drafts',
      data: { caption: 'old', platforms: ['facebook'], scheduledFor: '2020-01-01T00:00:00Z', sourceCollection: 'stories', sourceId: String(story.id), createdAt: '2020-01-01T00:00:00.000Z' },
      overrideAccess: true,
      context: { [HQ_INTERNAL]: true },
    })

    await publish('stories', story.id)
    const [d, ...rest] = (await draftsFor('stories', story.id)).filter((x) => x.id !== stale.id)
    await payload.delete({ collection: 'hq-social-drafts', id: stale.id, overrideAccess: true })
    expect(rest).toHaveLength(0)
    expect(d).toMatchObject({ status: 'pending', pillar: 'story', language: 'both', platforms: ['facebook'], media: [] })
    // No Spanish dek was written, so none is shown — the English is not repeated under it.
    expect(d.caption).toBe(
      [
        'El último torcedor',
        '',
        'The last cigar roller',
        'Forty years at one bench.',
        '',
        `👉 https://flamingocounty.com/go/fb/${d.id}?to=/es/stories/${story.slug}`,
      ].join('\n'),
    )
    await vi.waitFor(() => expect(tg.previews()).toHaveLength(1))
  })

  it('gives an event with no photo its generated card, so it goes to Instagram too', async () => {
    fakeTelegram()
    const ev = await draftEvent('2099-03-14', { image: null })
    await publish('events', ev.id)
    const [d] = await draftsFor('events', ev.id)
    expect(d.platforms).toEqual(['facebook', 'instagram'])
    const media = d.media?.[0]
    expect(typeof media === 'object' && media).toMatchObject({ mimeType: 'image/jpeg', width: 1080, height: 1350 })
  })

  it('draws the card for an event written only in English, with the English title', async () => {
    fakeTelegram()
    const card = vi.spyOn(await import('@/lib/eventCard'), 'renderEventCard')
    const ev = (await payload.create({
      collection: 'events',
      data: { slug: `ad-en-only-${Date.now()}`, title: 'Domino night', date: '2099-03-14', timeLabel: '7 PM', kind, venueType: 'place', place: 'Máximo Gómez Park', city, _status: 'draft' } as never,
      locale: 'en',
      draft: true,
      overrideAccess: true,
    })) as Event
    made.push({ collection: 'events', id: ev.id })
    await publish('events', ev.id)
    const [d] = await draftsFor('events', ev.id)
    expect(d.platforms).toEqual(['facebook', 'instagram'])
    const drawn = card.mock.calls.find(([e]) => e.id === ev.id)?.[0]
    expect(drawn?.title).toBe('Domino night')
    card.mockRestore()
  })

  it('spreads pages published together over different slots, 3 hours apart', async () => {
    fakeTelegram()
    const evs = await Promise.all([draftEvent('2099-03-14'), draftEvent('2099-03-15'), draftEvent('2099-03-16')])
    const before = Date.now()
    await Promise.all(evs.map((ev) => publish('events', ev.id)))
    const times = (await Promise.all(evs.map((ev) => draftsFor('events', ev.id))))
      .map((ds) => {
        expect(ds).toHaveLength(1)
        return new Date(ds[0].scheduledFor).getTime()
      })
      .sort((a, b) => a - b)
    expect(times[0]).toBeGreaterThanOrEqual(before + 30 * 60_000)
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(3 * 3600_000)
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(3 * 3600_000)
  })

  it('schedules a draft written at 00:10 Miami time for 11:30 that morning', async () => {
    fakeTelegram()
    const ev = await draftEvent('2099-03-14')
    // Published, its real-time draft dropped, then drafted again as if the
    // clock read 00:10 on a day with nothing else waiting near it.
    await publish('events', ev.id)
    for (const d of await draftsFor('events', ev.id)) await payload.delete({ collection: 'hq-social-drafts', id: d.id, overrideAccess: true })
    const d = await draftForPublished(payload, 'events', ev.id, new Date('2099-03-01T00:10:00-05:00'))
    expect(d?.scheduledFor && new Date(d.scheduledFor).toISOString()).toBe(new Date('2099-03-01T11:30:00-05:00').toISOString())
  })

  it('drafts nothing for an event that is already over, or cancelled', async () => {
    fakeTelegram()
    const past = await draftEvent('2020-01-04')
    await publish('events', past.id)
    const cancelled = await draftEvent('2099-03-14', { eventStatus: 'cancelled' })
    await publish('events', cancelled.id)
    expect(await draftsFor('events', past.id)).toHaveLength(0)
    expect(await draftsFor('events', cancelled.id)).toHaveLength(0)
  })

  it('keeps publishing when drafting fails', async () => {
    fakeTelegram()
    const ev = await draftEvent('2099-03-14')
    const find = payload.find.bind(payload)
    const spy = vi.spyOn(payload, 'find').mockImplementation(((args: { collection: string }) =>
      args.collection === 'hq-social-drafts' ? Promise.reject(new Error('boom')) : find(args as never)) as never)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await expect(publish('events', ev.id)).resolves.toMatchObject({ _status: 'published' })
      expect(errors).toHaveBeenCalledWith('[hq] auto-draft failed:', 'boom')
    } finally {
      spy.mockRestore()
      errors.mockRestore()
    }
    expect(await draftsFor('events', ev.id)).toHaveLength(0)
  })
})
