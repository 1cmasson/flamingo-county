// @vitest-environment node
// Uploads (the event's photo) need Node's Blob and fs, not jsdom's.

import path from 'path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { eveningAfter } from '@/lib/autoDraft'
import { HQ_INTERNAL } from '@/lib/hq'
import type { Event, HqSocialDraft, Story } from '@/payload-types'

const OWNER = '1001'

function fakeTelegram() {
  const sent: { method: string; body: unknown }[] = []
  let messageId = 900
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
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

describe('eveningAfter', () => {
  it('is 7 PM Miami time the next day, in summer and winter time', () => {
    expect(eveningAfter(new Date('2026-10-01T12:00:00Z')).toISOString()).toBe('2026-10-02T23:00:00.000Z')
    // 11 PM Miami on Dec 1 is already Dec 2 in UTC; "tomorrow" is Miami's.
    expect(eveningAfter(new Date('2026-12-02T04:00:00Z')).toISOString()).toBe('2026-12-03T00:00:00.000Z')
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
