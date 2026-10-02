// @vitest-environment node
// The card route renders a PNG through next/og, which wants Node, not jsdom.

import { NextRequest } from 'next/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { GET } from '@/app/api/og/event/[slug]/route'
import { eventDateLine } from '@/lib/dates'
import { eventCardData } from '@/lib/eventCard'
import { eventCardUrl } from '@/lib/eventCardUrl'
import { eventSource, eventVenue } from '@/lib/eventVenue'
import type { Event } from '@/payload-types'

const day = (d: string) => `${d}T12:00:00.000Z`

describe('eventDateLine: the date on the event card', () => {
  it('names the day of a one-day event', () => {
    expect(eventDateLine({ date: day('2026-10-10') }, 'es', '2026-10-02')).toBe('Sábado 10 de octubre')
    expect(eventDateLine({ date: day('2026-10-10') }, 'en', '2026-10-02')).toBe('Saturday, October 10')
  })

  it('treats a night past midnight as one day', () => {
    const night = { date: day('2026-10-10'), startTime: '21:00', endTime: '01:00' }
    expect(eventDateLine(night, 'es', '2026-10-02')).toBe('Sábado 10 de octubre')
  })

  it('says until when for a run that is already on, from its first day', () => {
    const run = { date: day('2026-09-18'), endDate: day('2026-10-19') }
    expect(eventDateLine(run, 'es', '2026-10-02')).toBe('Hasta el 19 de octubre')
    expect(eventDateLine(run, 'en', '2026-10-02')).toBe('Through October 19')
    expect(eventDateLine(run, 'es', '2026-09-18')).toBe('Hasta el 19 de octubre')
  })

  it('gives both ends of a run that has not started', () => {
    const run = { date: day('2026-09-18'), endDate: day('2026-10-19') }
    expect(eventDateLine(run, 'es', '2026-09-01')).toBe('Del 18 de sep. al 19 de oct.')
    expect(eventDateLine(run, 'en', '2026-09-01')).toBe('Sep. 18 to Oct. 19')
    const sameMonth = { date: day('2026-10-24'), endDate: day('2026-10-25') }
    expect(eventDateLine(sameMonth, 'es', '2026-10-02')).toBe('Del 24 al 25 de oct.')
    expect(eventDateLine(sameMonth, 'en', '2026-10-02')).toBe('Oct. 24 to 25')
  })
})

describe('what the card and the event page say', () => {
  const city = { id: 1, slug: 'lakes', name: 'MIAMI LAKES', accent: '#16E0F2' }
  const base = {
    id: 1,
    slug: 'sabor-fest',
    title: 'Sabor Fest',
    date: day('2026-10-10'),
    timeLabel: '4–9 PM',
    venueType: 'place',
    place: 'Main Street',
    hood: 'Main Street',
    city,
    kind: { id: 1, slug: 'food', label: 'COMIDA Y BEBIDA' },
    eventStatus: 'scheduled',
    updatedAt: '2026-10-01T10:00:00.000Z',
    createdAt: '2026-10-01T10:00:00.000Z',
  } as unknown as Event

  it('prints the place once when the hood only repeats it', () => {
    expect(eventVenue(base).hood).toBe('')
    expect(eventCardData(base, 'es', '2026-10-02')).toMatchObject({
      title: 'Sabor Fest',
      city: 'MIAMI LAKES',
      kind: 'COMIDA Y BEBIDA',
      dateLine: 'Sábado 10 de octubre',
      meta: '4–9 PM · Main Street',
    })
    expect(eventCardData({ ...base, hood: 'Town Center' }, 'es', '2026-10-02').meta).toBe('4–9 PM · Main Street · Town Center')
  })

  it('never draws a price', () => {
    const d = eventCardData({ ...base, timeLabel: '$20 at the door' }, 'en', '2026-10-02')
    expect(JSON.stringify(d)).not.toContain('$')
  })

  it('links the source: a listing on the site, else an http(s) site, else just the name', () => {
    expect(eventSource({ organizerName: 'City of Hialeah', organizerUrl: 'https://www.hialeahfl.gov/events' }, 'es')).toEqual({
      name: 'City of Hialeah',
      href: 'https://www.hialeahfl.gov/events',
      external: true,
    })
    expect(eventSource({ organizerUrl: 'https://www.hialeahfl.gov/' }, 'es')?.name).toBe('hialeahfl.gov')
    expect(eventSource({ organizerName: 'City of Hialeah', organizerUrl: 'javascript:alert(1)' }, 'es')).toEqual({
      name: 'City of Hialeah',
      href: null,
      external: false,
    })
    const organizer = { id: 9, slug: 'club', name: 'Club de la Amistad', city: { id: 2, slug: 'hialeah' } }
    expect(eventSource({ organizer, organizerName: 'ignored' } as never, 'en')).toEqual({
      name: 'Club de la Amistad',
      href: '/en/hialeah/club',
      external: false,
    })
    expect(eventSource({}, 'es')).toBeNull()
  })

  it('versions the card URL with the event and the design', () => {
    expect(eventCardUrl(base, 'es', 'link')).toMatch(/^\/api\/og\/event\/sabor-fest\?lang=es&size=link&v=1\.[a-z0-9]+$/)
    expect(eventCardUrl({ ...base, updatedAt: '2026-10-02T10:00:00.000Z' }, 'es', 'link')).not.toBe(eventCardUrl(base, 'es', 'link'))
  })
})

describe('the card route', () => {
  let payload: Payload
  const made: { collection: 'events' | 'event-kinds' | 'cities'; id: number }[] = []
  let published: Event
  let draft: Event

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const stamp = Date.now()
    const kind = await payload.create({ collection: 'event-kinds', data: { slug: `ec-kind-${stamp}`, label: 'Food & drink', bg: '#000', ink: '#fff' } as never, overrideAccess: true })
    const city = await payload.create({ collection: 'cities', data: { slug: `ec-city-${stamp}`, name: 'MIAMI LAKES', accent: '#16E0F2' } as never, overrideAccess: true })
    made.push({ collection: 'event-kinds', id: kind.id }, { collection: 'cities', id: city.id })
    const data = { title: 'Sabor Fest', date: day('2099-10-10'), timeLabel: '4–9 PM', kind: kind.id, venueType: 'place', place: 'Main Street', city: city.id }
    published = (await payload.create({ collection: 'events', data: { ...data, slug: `ec-pub-${stamp}`, _status: 'published' } as never, overrideAccess: true })) as Event
    draft = (await payload.create({ collection: 'events', data: { ...data, slug: `ec-draft-${stamp}`, _status: 'draft' } as never, draft: true, overrideAccess: true })) as Event
    made.push({ collection: 'events', id: published.id }, { collection: 'events', id: draft.id })
  })

  afterAll(async () => {
    if (!payload) return
    for (const m of made.reverse()) await payload.delete({ collection: m.collection, id: m.id, overrideAccess: true }).catch(() => undefined)
  })

  const get = (slug: string, query: string) =>
    GET(new NextRequest(`http://localhost/api/og/event/${slug}?${query}`), { params: Promise.resolve({ slug }) })

  /** Width and height from a PNG's header. */
  const pngSize = (buf: ArrayBuffer) => {
    const b = Buffer.from(buf)
    expect(b.subarray(1, 4).toString()).toBe('PNG')
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  }

  it('draws a published event at each size, with a long cache', async () => {
    for (const [size, dims] of [
      ['link', { width: 1200, height: 630 }],
      ['social', { width: 1080, height: 1350 }],
      ['page', { width: 1200, height: 630 }],
      ['card', { width: 960, height: 720 }],
    ] as const) {
      const res = await get(published.slug, `lang=es&size=${size}&v=1.x`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/png')
      expect(res.headers.get('cache-control')).toContain('s-maxage')
      expect(pngSize(await res.arrayBuffer())).toEqual(dims)
    }
  })

  it('is a 404 for a draft and for a slug that does not exist', async () => {
    expect((await get(draft.slug, 'lang=es&size=link')).status).toBe(404)
    expect((await get('no-such-event', 'lang=en')).status).toBe(404)
  })
})
