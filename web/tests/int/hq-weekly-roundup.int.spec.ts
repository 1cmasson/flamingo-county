// @vitest-environment node
// The cards are drawn with sharp and Satori, which need Node, not jsdom.

import path from 'path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { todayISO } from '@/lib/dates'
import { coverScene, eventsPerDay, parseWeek, weekEvents, weekMonday, weekRange } from '@/lib/week'
import {
  ROUNDUP_MAX_EVENTS,
  draftWeeklyRoundup,
  isRoundupTime,
  pickRoundupEvents,
  roundupExists,
  roundupKey,
} from '@/lib/weeklyRoundup'
import type { Event, HqMedia, HqSocialDraft } from '@/payload-types'

/** A Miami wall-clock instant, with its offset written out. */
const at = (stamp: string) => new Date(stamp)
const day = (iso: string) => `${iso}T12:00:00.000Z`

describe('the week, Monday to Sunday on a Miami clock', () => {
  it('puts Sunday in the week before it, and any day under its Monday', () => {
    expect(weekMonday('2026-10-12')).toBe('2026-10-12')
    expect(weekMonday('2026-10-15')).toBe('2026-10-12')
    expect(weekMonday('2026-10-18')).toBe('2026-10-12')
    expect(weekMonday('2026-10-19')).toBe('2026-10-19')
    expect(parseWeek('2026-10-17')).toBe('2026-10-12')
    expect(parseWeek('2026-02-30')).toBeNull()
    expect(parseWeek('next-week')).toBeNull()
  })

  it("reads the day in Miami, not the server's zone", () => {
    // Monday 00:30 UTC is still Sunday evening in Miami: last week.
    const sundayNight = at('2026-10-12T02:30:00Z')
    expect(todayISO(sundayNight)).toBe('2026-10-11')
    expect(weekMonday(todayISO(sundayNight))).toBe('2026-10-05')
    // Sunday 23:30 Miami, then Monday 00:30 Miami.
    expect(weekMonday(todayISO(at('2026-10-11T23:30:00-04:00')))).toBe('2026-10-05')
    expect(weekMonday(todayISO(at('2026-10-12T00:30:00-04:00')))).toBe('2026-10-12')
  })

  it('drafts on Mondays from 7 AM Miami, across the end of daylight time', () => {
    expect(isRoundupTime(at('2026-10-12T06:59:00-04:00'))).toBe(false)
    expect(isRoundupTime(at('2026-10-12T07:00:00-04:00'))).toBe(true)
    expect(isRoundupTime(at('2026-10-12T23:30:00-04:00'))).toBe(true)
    expect(isRoundupTime(at('2026-10-13T07:15:00-04:00'))).toBe(false)
    // Monday 1:00 UTC is Sunday night in Miami.
    expect(isRoundupTime(at('2026-10-12T01:00:00Z'))).toBe(false)
    // 2 November 2026 is the first Monday on EST (UTC-5): 11:59 UTC is 6:59 AM.
    expect(isRoundupTime(at('2026-11-02T11:59:00Z'))).toBe(false)
    expect(isRoundupTime(at('2026-11-02T12:00:00Z'))).toBe(true)
  })

  it('lists each event once, under its first day in the week', () => {
    const ev = (id: number, date: string, extra: Partial<Event> = {}) =>
      ({ id, date: day(date), endDate: null, startTime: null, endTime: null, ...extra }) as unknown as Event
    const events = [
      ev(1, '2026-09-18', { endDate: day('2026-10-19') }), // an exhibit, open since September
      ev(2, '2026-10-11', { startTime: '21:00', endTime: '01:00' }), // last Sunday night, past midnight
      ev(3, '2026-10-17'),
      ev(4, '2026-10-18'),
      ev(5, '2026-10-19'), // next Monday
    ]
    const days = weekEvents(events, '2026-10-12')
    expect(days.map((d) => [d.iso, d.items.map((e) => e.id)])).toEqual([
      ['2026-10-12', [1]],
      ['2026-10-17', [3]],
      ['2026-10-18', [4]],
    ])
    // Midweek, the days gone are gone.
    expect(weekEvents(events, '2026-10-12', '2026-10-17').map((d) => d.iso)).toEqual(['2026-10-17', '2026-10-18'])
    // The exhibit is on every day of the week.
    expect(eventsPerDay([events[0], events[2]], '2026-10-12')).toEqual([1, 1, 1, 1, 1, 2, 1])
  })

  it('names the week and turns the scene, keeping a one-city week on its own scene', () => {
    expect(weekRange('2026-10-12', 'es')).toBe('12–18 OCT')
    expect(weekRange('2026-09-28', 'en')).toBe('28 SEP – 4 OCT')
    const scenes = ['2026-10-12', '2026-10-19', '2026-10-26'].map((m) => coverScene(m, ['hialeah', 'lakes']))
    expect(scenes[0]).not.toBe(scenes[1])
    expect(scenes[0]).toBe(scenes[2])
    expect(coverScene('2026-10-19', ['hialeah', 'hialeah'])).toBe('hialeah-gateway')
    // Little Havana is left out of the cover's branding for now, even for a week all its own.
    for (const m of ['2026-10-12', '2026-10-19']) expect(coverScene(m, ['havana'])).not.toBe('calle-ocho')
  })
})

describe('which events the roundup shows', () => {
  const ev = (id: number, date: string, extra: Partial<Event> = {}) =>
    ({ id, date: day(date), endDate: null, star: false, image: null, ...extra }) as unknown as Event

  it('takes them all, in date order, when there are nine or fewer', () => {
    const days = weekEvents([ev(1, '2026-10-17'), ev(2, '2026-10-13')], '2026-10-12')
    const { chosen, total } = pickRoundupEvents(days)
    expect(chosen.map((p) => p.ev.id)).toEqual([2, 1])
    expect(total).toBe(2)
  })

  it('keeps nine of more: starred first, then with a photo, then the earliest, shown by date', () => {
    const events = [
      ...Array.from({ length: 9 }, (_, i) => ev(i + 1, '2026-10-12')),
      ev(20, '2026-10-18', { star: true }),
      ev(21, '2026-10-17', { image: 5 }),
      ev(22, '2026-10-16'),
    ]
    const { chosen, total } = pickRoundupEvents(weekEvents(events, '2026-10-12'))
    expect(total).toBe(12)
    expect(chosen).toHaveLength(ROUNDUP_MAX_EVENTS)
    const ids = chosen.map((p) => p.ev.id)
    expect(ids).toContain(20)
    expect(ids).toContain(21)
    expect(ids).not.toContain(22)
    // Seven of the Monday ones, then Saturday's, then Sunday's.
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 21, 20])
  })
})

describe('the Monday roundup draft', () => {
  let payload: Payload
  const events: number[] = []
  const made: { collection: 'event-kinds' | 'cities' | 'media'; id: number }[] = []
  let kind: number
  let city: number
  let photo: number

  // Weeks in 2097, which no other spec uses: the shared test database must
  // not put anyone else's events in them.
  const WEEK = '2097-06-03'
  /** Two weeks on: nothing at all is on. */
  const EMPTY_WEEK = '2097-06-17'
  /** Monday 7:15 AM in Miami (EDT), the job's first run that drafts. */
  const MONDAY_RUN = new Date('2097-06-03T07:15:00-04:00')

  function fakeTelegram() {
    const sent: string[] = []
    const realFetch = globalThis.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (!String(input instanceof Request ? input.url : input).includes('api.telegram.org')) return realFetch(input, init)
        sent.push(String(input).split('/').pop()!)
        return Response.json({ ok: true, result: { message_id: 1 } })
      }),
    )
    return sent
  }

  async function event(date: string, title: [string, string], extra: Record<string, unknown> = {}): Promise<Event> {
    const ev = await payload.create({
      collection: 'events',
      data: {
        slug: `wr-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        title: title[1],
        date,
        timeLabel: '7 PM',
        kind,
        venueType: 'place',
        place: 'Milander Park',
        city,
        _status: 'published',
        ...extra,
      } as never,
      locale: 'en',
      overrideAccess: true,
    })
    events.push(ev.id)
    await payload.update({ collection: 'events', id: ev.id, data: { title: title[0] } as never, locale: 'es', overrideAccess: true })
    return ev as Event
  }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const stamp = Date.now()
    kind = (await payload.create({ collection: 'event-kinds', data: { slug: `wr-kind-${stamp}`, label: 'Music', bg: '#000', ink: '#fff' } as never, overrideAccess: true })).id
    city = (await payload.create({ collection: 'cities', data: { slug: `wr-city-${stamp}`, name: 'HIALEAH' } as never, overrideAccess: true })).id
    photo = (
      await payload.create({
        collection: 'media',
        data: { alt: 'A band' },
        filePath: path.resolve(process.cwd(), 'public/uploads/flamingo-city-favicon-180.png'),
        overrideAccess: true,
      })
    ).id
    made.push({ collection: 'event-kinds', id: kind }, { collection: 'cities', id: city }, { collection: 'media', id: photo })

    // Eleven events across the week: two will not fit the carousel.
    const week = ['2097-06-03', '2097-06-04', '2097-06-05', '2097-06-06', '2097-06-07', '2097-06-08', '2097-06-09']
    for (let i = 0; i < 11; i++) {
      await event(week[i % 7], [`Noche de son ${i + 1}`, `Son night ${i + 1}`], i === 10 ? { star: true } : {})
    }
    // Not this week's, or not to be announced.
    await event('2097-06-02', ['Domingo de dominó', 'Domino Sunday'])
    await event('2097-06-10', ['La otra semana', 'Next week'])
    await event('2097-06-05', ['Cancelado', 'Called off'], { eventStatus: 'cancelled' })
    await event('2097-06-05', ['Rifa a $5', 'Raffle, $5'])
  }, 60_000)

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.TELEGRAM_OWNER_CHAT_ID = '1001'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_OWNER_CHAT_ID
  })

  afterAll(async () => {
    if (!payload) return
    const { docs } = await payload.find({
      collection: 'hq-social-drafts',
      where: { dedupeKey: { in: [roundupKey(WEEK), roundupKey(EMPTY_WEEK)] } },
      limit: 10,
      overrideAccess: true,
    })
    for (const d of docs) {
      await payload.delete({ collection: 'hq-social-drafts', id: d.id, overrideAccess: true })
      for (const m of d.media ?? []) {
        await payload.delete({ collection: 'hq-media', id: typeof m === 'object' ? m.id : m, overrideAccess: true }).catch(() => undefined)
      }
      await payload.delete({ collection: 'hq-events', where: { refId: { equals: String(d.id) } }, overrideAccess: true })
    }
    for (const id of events) await payload.delete({ collection: 'events', id, overrideAccess: true }).catch(() => undefined)
    for (const m of made.reverse()) await payload.delete({ collection: m.collection, id: m.id, overrideAccess: true }).catch(() => undefined)
  })

  it('drafts one pending carousel for the week: the cover, then nine Spanish cards', async () => {
    const tg = fakeTelegram()
    expect(await roundupExists(payload, WEEK)).toBe(false)
    const d = (await draftWeeklyRoundup(payload, MONDAY_RUN)) as HqSocialDraft
    expect(d).toMatchObject({
      status: 'pending',
      platforms: ['facebook', 'instagram'],
      pillar: 'event',
      language: 'both',
      sourceCollection: 'weekly-roundup',
      sourceId: WEEK,
      dedupeKey: roundupKey(WEEK),
    })
    // 11:30 that Monday, Miami time.
    expect(new Date(d.scheduledFor).toISOString()).toBe(new Date('2097-06-03T11:30:00-04:00').toISOString())

    const media = (await payload.findByID({ collection: 'hq-social-drafts', id: d.id, depth: 1, overrideAccess: true })).media as HqMedia[]
    expect(media).toHaveLength(10)
    for (const m of media) expect(m).toMatchObject({ mimeType: 'image/jpeg', width: 1080, height: 1350 })
    expect(media[0].note).toMatch(/Weekly roundup cover/)
    expect(media.slice(1).every((m) => /Generated ES card/.test(m.note ?? ''))).toBe(true)

    // Spanish first, one line per event shown, then English, then the link to the week's page.
    const lines = d.caption.split('\n')
    expect(lines[0]).toBe('📅 Esta semana en Flamingo County, 3–9 jun:')
    expect(d.caption).toContain('📅 This week in Flamingo County, Jun 3–9:')
    expect(d.caption).toContain('🗓 Lun 3 · Noche de son 1 · Hialeah')
    expect(d.caption).toContain('🗓 Mon 3 · Son night 1 · Hialeah')
    expect(d.caption).toContain('…y 2 más en la web.')
    expect(d.caption).toContain('…and 2 more on the site.')
    expect(d.caption.indexOf('Noche de son')).toBeLessThan(d.caption.indexOf('Son night'))
    expect(lines[lines.length - 1]).toBe(`👉 https://flamingocounty.com/go/fb/${d.id}?to=/es/this-week`)
    // The starred one is in; the week's last plain ones are not.
    expect(d.caption).toContain('Noche de son 11')
    // Not this week's, cancelled, or naming a price.
    for (const text of ['Domingo de dominó', 'La otra semana', 'Cancelado', '$']) expect(d.caption).not.toContain(text)
    expect(d.caption.length).toBeLessThanOrEqual(2000)

    const logged = await payload.find({ collection: 'hq-events', where: { refId: { equals: String(d.id) } }, overrideAccess: true })
    expect(logged.docs.map((e) => e.type)).toContain('social.draft_created')
    await vi.waitFor(() => expect(tg).toContain('sendPhoto'))
  }, 120_000)

  it('never drafts the same week twice: not on a later run, nor from another process', async () => {
    fakeTelegram()
    expect(await roundupExists(payload, '2097-06-07')).toBe(true)
    expect(await draftWeeklyRoundup(payload, new Date('2097-06-03T08:15:00-04:00'))).toBeNull()
    const { totalDocs } = await payload.count({ collection: 'hq-social-drafts', where: { dedupeKey: { equals: roundupKey(WEEK) } }, overrideAccess: true })
    expect(totalDocs).toBe(1)
    // Two processes racing past the check: the database refuses the second row.
    await expect(
      payload.create({
        collection: 'hq-social-drafts',
        data: { caption: 'x', platforms: ['facebook'], scheduledFor: MONDAY_RUN.toISOString(), dedupeKey: roundupKey(WEEK) },
        overrideAccess: true,
        context: { hqInternal: true },
      }),
    ).rejects.toThrow()
  })

  it('drafts nothing for a week with nothing on', async () => {
    fakeTelegram()
    expect(await draftWeeklyRoundup(payload, new Date('2097-06-17T07:15:00-04:00'))).toBeNull()
    expect(await roundupExists(payload, EMPTY_WEEK)).toBe(false)
  })
})
