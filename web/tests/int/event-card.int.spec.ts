// @vitest-environment node
// The card route renders a PNG through next/og, which wants Node, not jsdom.

import { NextRequest } from 'next/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { GET } from '@/app/api/og/event/[slug]/route'
import { eventDateLine } from '@/lib/dates'
import { eventCardBackground, eventCardData, renderEventCard } from '@/lib/eventCard'
import { eventCardUrl } from '@/lib/eventCardUrl'
import { EVENT_SETTINGS, eventSetting } from '@/lib/eventSetting'
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
    expect(eventCardUrl(base, 'es', 'link')).toMatch(/^\/api\/og\/event\/sabor-fest\?lang=es&size=link&v=7\.[a-z0-9]+$/)
    expect(eventCardUrl({ ...base, updatedAt: '2026-10-02T10:00:00.000Z' }, 'es', 'link')).not.toBe(eventCardUrl(base, 'es', 'link'))
  })
})

describe('eventSetting: the scene behind the social poster', () => {
  const lakes = { id: 1, slug: 'lakes', name: 'MIAMI LAKES' }
  const hialeah = { id: 2, slug: 'hialeah', name: 'HIALEAH' }
  const community = { id: 7, slug: 'church', label: 'COMUNIDAD' }
  const at = (place: string, city: object, extra: object = {}) =>
    ({ id: 1, slug: 'x', title: 'x', venueType: 'place', place, city, kind: community, ...extra }) as unknown as Event
  const atListing = (name: string, category: string, city: object) =>
    ({ id: 1, slug: 'x', title: 'x', venueType: 'listing', listing: { id: 3, name, city, category: { id: 1, slug: category } }, kind: community }) as unknown as Event

  const havana = { id: 3, slug: 'havana', name: 'LITTLE HAVANA' }
  const elsewhere = { id: 4, slug: 'doral', name: 'DORAL' }

  it('picks the scene for the venues the site has posted', () => {
    expect(eventSetting(at('Biblioteca JFK', hialeah))).toBe('library')
    expect(eventSetting(at('Main Street', lakes))).toBe('main-street-lakes')
    expect(eventSetting(atListing('Casa Marín Restaurant', 'food', hialeah))).toBe('restaurant')
    expect(eventSetting(at('Milander Center for Arts & Entertainment', hialeah))).toBe('arts-center')
    // A name that says nothing: the city's own scene.
    expect(eventSetting(at('Sapphire', hialeah))).toBe('hialeah-gateway')
  })

  it('matches whole words, without accents, and never from the kind', () => {
    expect(eventSetting(at('Library of Hialeah', hialeah))).toBe('library')
    expect(eventSetting(at('Cafetería La Palma', hialeah))).toBe('restaurant')
    expect(eventSetting(at('Librería Universal', elsewhere))).toBeNull()
    expect(eventSetting(at('Calle Ocho', hialeah))).toBe('street-festival')
    expect(eventSetting(at('Iglesia San Juan', hialeah))).toBe('church')
    expect(eventSetting(at('Parroquia Inmaculada', havana))).toBe('church')
    expect(eventSetting(at('Museo Cubano', havana))).toBe('arts-center')
    expect(eventSetting(at('Art Deco Diner', elsewhere))).toBe('restaurant')
    expect(eventSetting(at('Parque Máximo Gómez', havana))).toBe('park')
    expect(eventSetting(at('Barbería El Corte', elsewhere))).toBeNull()
  })

  it('keeps the traps out: Hialeah Park, and a bare "hall"', () => {
    // The racetrack and casino: the city's scene, not a park.
    expect(eventSetting(at('Hialeah Park', hialeah))).toBe('hialeah-gateway')
    expect(eventSetting(at('Hialeah Park Racing & Casino', hialeah))).toBe('hialeah-gateway')
    expect(eventSetting(at('Amelia Earhart Park', hialeah))).toBe('park')
    expect(eventSetting(at('Hialeah City Hall', hialeah))).toBe('city-hall')
    expect(eventSetting(at('Town Hall', lakes))).toBe('city-hall')
    expect(eventSetting(at('Elks Hall', elsewhere))).toBeNull()
    expect(eventSetting(at('Salón de Fiestas Imperial', hialeah))).toBe('banquet-hall')
  })

  it('uses the listing category, then the city', () => {
    expect(eventSetting(atListing('Sapphire', 'food', hialeah))).toBe('restaurant')
    expect(eventSetting(atListing('The Bend', 'night', hialeah))).toBe('bar')
    expect(eventSetting(atListing('Club de la Amistad', 'nonprofit', hialeah))).toBe('hialeah-gateway')
    expect(eventSetting(at('Biblioteca', lakes))).toBe('library')
    expect(eventSetting(at('Somewhere', havana))).toBe('calle-ocho')
    expect(eventSetting(at('Somewhere', elsewhere))).toBeNull()
  })

  it("lets the event's own setting win, including no scene at all", () => {
    expect(eventSetting(at('Sapphire', hialeah, { setting: 'banquet-hall' }))).toBe('banquet-hall')
    expect(eventSetting(at('Biblioteca JFK', hialeah, { setting: 'flat' }))).toBeNull()
    expect(eventSetting(at('Biblioteca JFK', hialeah, { setting: null }))).toBe('library')
  })

  it('has art bundled for every scene it can pick', async () => {
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    for (const s of EVENT_SETTINGS) {
      expect(existsSync(join(process.cwd(), 'src/assets/og/settings', `${s}.jpg`)), s).toBe(true)
    }
  })

  it('draws the social poster over the scene', async () => {
    const ev = at('Main Street', lakes, { title: 'Sabor Fest', date: day('2026-10-10') })
    const flat = at('Sapphire', hialeah, { title: 'Sabor Fest', date: day('2026-10-10'), setting: 'flat' })
    const scene = Buffer.from(await renderEventCard(ev, 'es', 'social', '2026-10-02'))
    const plain = Buffer.from(await renderEventCard(flat, 'es', 'social', '2026-10-02'))
    expect(scene.subarray(1, 4).toString()).toBe('PNG')
    // A drawn scene does not compress like a flat colour with dots.
    expect(scene.length).toBeGreaterThan(plain.length * 1.5)
  }, 30000)
})

describe('the wide scenes: link, page and card', () => {
  const hialeah = { id: 2, slug: 'hialeah', name: 'HIALEAH' }
  const elsewhere = { id: 4, slug: 'doral', name: 'DORAL' }
  const community = { id: 7, slug: 'church', label: 'COMUNIDAD' }
  const at = (place: string, city: object, extra: object = {}) =>
    ({ id: 1, slug: 'x', title: 'Cuentos de Halloween', date: day('2026-10-24'), timeLabel: '10 AM', venueType: 'place', place, city, kind: community, ...extra }) as unknown as Event
  const photo = {
    image: { id: 5, filename: 'venue.jpg', mimeType: 'image/jpeg', updatedAt: '2026-10-01T10:00:00.000Z', sizes: {} },
  }
  const WIDE = ['link', 'page', 'card'] as const

  it('draws the wide art at link, page and card, and the portrait art on the poster', () => {
    const ev = at('Biblioteca JFK', hialeah)
    for (const size of WIDE) {
      expect(eventCardBackground(ev, 'es', size), size).toEqual({ kind: 'scene', setting: 'library', art: 'wide' })
    }
    expect(eventCardBackground(ev, 'es', 'social')).toEqual({ kind: 'scene', setting: 'library', art: 'portrait' })
  })

  it("follows the event's own setting and the city's default", () => {
    expect(eventCardBackground(at('Sapphire', hialeah, { setting: 'park' }), 'es', 'card')).toMatchObject({ setting: 'park', art: 'wide' })
    expect(eventCardBackground(at('Sapphire', hialeah), 'es', 'link')).toMatchObject({ setting: 'hialeah-gateway', art: 'wide' })
  })

  it('stays flat with no scene: set to None, or outside the three cities', () => {
    for (const size of [...WIDE, 'social'] as const) {
      expect(eventCardBackground(at('Biblioteca JFK', hialeah, { setting: 'flat' }), 'es', size)).toEqual({ kind: 'flat' })
      expect(eventCardBackground(at('Somewhere', elsewhere), 'es', size)).toEqual({ kind: 'flat' })
    }
  })

  it("lets the event's photo win over any scene, at every size", () => {
    for (const size of [...WIDE, 'social'] as const) {
      const bg = eventCardBackground(at('Biblioteca JFK', hialeah, { setting: 'park', ...photo }), 'es', size)
      expect(bg.kind, size).toBe('photo')
    }
  })

  it('has wide art bundled for every scene it can pick', async () => {
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    for (const s of EVENT_SETTINGS) {
      expect(existsSync(join(process.cwd(), 'src/assets/og/settings-wide', `${s}.jpg`)), s).toBe(true)
    }
  })

  it('draws the wide sizes over the scene, and flat without one', async () => {
    const ev = at('Biblioteca JFK', hialeah)
    const none = at('Biblioteca JFK', hialeah, { setting: 'flat' })
    for (const size of WIDE) {
      const scene = Buffer.from(await renderEventCard(ev, 'es', size, '2026-10-05'))
      const plain = Buffer.from(await renderEventCard(none, 'es', size, '2026-10-05'))
      expect(scene.subarray(1, 4).toString()).toBe('PNG')
      // A drawn scene does not compress like a flat colour with dots.
      expect(scene.length, size).toBeGreaterThan(plain.length * 1.5)
    }
  }, 60000)

  it("dresses a Halloween event's hero, link preview and poster in the season's palette, not the board's tile", async () => {
    const plain = at('Biblioteca JFK', hialeah)
    const spooky = at('Biblioteca JFK', hialeah, { season: 'halloween' })
    const draw = async (ev: Event, size: 'page' | 'link' | 'card' | 'social') =>
      Buffer.from(await renderEventCard(ev, 'es', size, '2026-10-05'))
    for (const size of ['page', 'link', 'social'] as const) {
      expect((await draw(spooky, size)).equals(await draw(plain, size)), size).toBe(false)
    }
    expect((await draw(spooky, 'card')).equals(await draw(plain, 'card'))).toBe(true)
  }, 60000)
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
      const res = await get(published.slug, `lang=es&size=${size}&v=3.x`)
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
