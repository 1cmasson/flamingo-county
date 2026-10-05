// @vitest-environment node
// The season card route renders a PNG through next/og, which wants Node, not jsdom.

import { NextRequest } from 'next/server'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import config from '@/payload.config'

import { GET } from '@/app/api/og/season/[key]/route'
import sitemap from '@/app/sitemap'
import { SeasonGuide } from '@/components/SeasonGuide'
import { getSeasonEvents } from '@/lib/data'
import { seasonCardUrl } from '@/lib/eventCardUrl'
import { eventListJsonLd } from '@/lib/jsonld'
import { groupByWeek, isSeasonOpen, SEASONS, seasonEvents, seasonWindow, type Season } from '@/lib/seasons'
import type { Event, User } from '@/payload-types'

const day = (d: string) => `${d}T12:00:00.000Z`
const halloween = SEASONS.halloween as Season

describe('the season window', () => {
  it('is open from Oct 1 to Nov 2 in Miami, and names that year', () => {
    expect(isSeasonOpen(halloween, '2026-09-30')).toBe(false)
    expect(isSeasonOpen(halloween, '2026-10-01')).toBe(true)
    expect(isSeasonOpen(halloween, '2026-11-02')).toBe(true)
    expect(isSeasonOpen(halloween, '2026-11-03')).toBe(false)
    expect(seasonWindow(halloween, '2026-10-05')).toEqual({ year: 2026, from: '2026-10-01', to: '2026-11-02' })
    expect(halloween.title('es', 2026)).toBe('Halloween en Hialeah 2026')
    expect(halloween.title('en', 2026)).toBe('Halloween in Hialeah 2026')
  })

  it('wraps into January for a season that does (Navidad)', () => {
    const navidad = { window: { from: '11-20', to: '01-06' } }
    expect(seasonWindow(navidad, '2027-01-03')).toEqual({ year: 2026, from: '2026-11-20', to: '2027-01-06' })
    expect(isSeasonOpen(navidad, '2027-01-03')).toBe(true)
    expect(isSeasonOpen(navidad, '2026-12-24')).toBe(true)
    expect(isSeasonOpen(navidad, '2027-01-07')).toBe(false)
  })

  it('keeps prices out of every word the guide says', () => {
    const copy = JSON.stringify({
      ...halloween,
      t: [halloween.title('es', 2026), halloween.metaTitle('es', 2026), halloween.description('es', 2026), halloween.description('en', 2026)],
    })
    expect(copy).not.toMatch(/\$|\bfree\b|gratis|precio|price/i)
  })
})

describe('which events a guide lists', () => {
  const ev = (slug: string, o: Partial<Event>) => ({ slug, title: slug, date: day('2026-10-31'), season: 'halloween', ...o }) as Event

  it('takes its season only, drops finished events, keeps a run that is on, by date', () => {
    const list = seasonEvents(
      [
        ev('trunk', { date: day('2026-10-31') }),
        ev('navidad', { season: 'navidad', date: day('2026-12-05') }),
        ev('untagged', { season: null }),
        ev('over', { date: day('2026-10-02') }),
        ev('haunted', { date: day('2026-10-01'), endDate: day('2026-10-31') }),
        ev('spook', { date: day('2026-10-24') }),
      ],
      'halloween',
      '2026-10-05',
    )
    expect(list.map((e) => e.slug)).toEqual(['haunted', 'spook', 'trunk'])
  })

  it('groups by week, with a run that has started under this week', () => {
    const weeks = groupByWeek(
      [
        ev('haunted', { date: day('2026-10-01'), endDate: day('2026-10-31') }),
        ev('spook', { date: day('2026-10-24') }),
        ev('fiesta', { date: day('2026-10-30') }),
        ev('trunk', { date: day('2026-10-31') }),
      ],
      '2026-10-05',
    )
    expect(weeks.map((w) => [w.from, w.to, w.current, w.items.map((e) => e.slug)])).toEqual([
      ['2026-10-05', '2026-10-11', true, ['haunted']],
      ['2026-10-19', '2026-10-25', false, ['spook']],
      ['2026-10-26', '2026-11-01', false, ['fiesta', 'trunk']],
    ])
  })

  it('nests the events in an ItemList without their own @context', () => {
    const list = eventListJsonLd('Halloween en Hialeah 2026', '/es/halloween', [
      { '@context': 'https://schema.org', '@type': 'Event', name: 'Trunk' },
    ])
    expect(list).toMatchObject({ '@type': 'ItemList', url: 'https://flamingocounty.com/es/halloween', numberOfItems: 1 })
    expect((list.itemListElement as { item: object }[])[0].item).toEqual({ '@type': 'Event', name: 'Trunk' })
  })
})

describe('the guide against the database', () => {
  let payload: Payload
  let user: User
  let mcpReq: PayloadRequest
  const events: number[] = []
  const made: { collection: 'event-kinds' | 'cities'; id: number }[] = []
  const stamp = Date.now()
  const slug = (s: string) => `ssn-${s}-${stamp}`
  // Far future, so the real "today" of the sitemap and the page sees them as on.
  const TODAY = '2099-10-05'

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const kind = await payload.create({ collection: 'event-kinds', data: { slug: `ssn-kind-${stamp}`, label: 'Family', bg: '#000', ink: '#fff' } as never, overrideAccess: true })
    const city = await payload.create({ collection: 'cities', data: { slug: `ssn-city-${stamp}`, name: 'HIALEAH', accent: '#FF2E88' } as never, overrideAccess: true })
    made.push({ collection: 'event-kinds', id: kind.id }, { collection: 'cities', id: city.id })
    const base = { timeLabel: '5–8 PM', kind: kind.id, venueType: 'place', place: 'Milander Park', city: city.id, organizerName: 'City of Hialeah', organizerUrl: 'https://www.hialeahfl.gov' }
    const add = async (s: string, data: Record<string, unknown>, status: 'published' | 'draft' = 'published') => {
      const doc = await payload.create({
        collection: 'events',
        data: { ...base, ...data, slug: slug(s), title: s, _status: status } as never,
        draft: status === 'draft',
        overrideAccess: true,
      })
      events.push(doc.id)
      return doc
    }
    await add('trunk', { date: day('2099-10-31'), season: 'halloween' })
    await add('haunted', { date: day('2099-10-01'), endDate: day('2099-10-20'), season: 'halloween' })
    await add('over', { date: day('2099-10-02'), season: 'halloween' })
    await add('draft', { date: day('2099-10-30'), season: 'halloween' }, 'draft')
    await add('navidad', { date: day('2099-12-05'), season: 'navidad' })
    await add('untagged', { date: day('2099-10-29') })

    user = await payload.create({
      collection: 'users',
      data: { email: `season-test-${stamp}@example.com`, password: 'not-a-real-password-1' },
      overrideAccess: true,
    })
    mcpReq = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    mcpReq.payloadAPI = 'MCP'
  })

  afterAll(async () => {
    if (!payload) return
    for (const id of events) await payload.delete({ collection: 'events', id, overrideAccess: true }).catch(() => undefined)
    for (const m of made.reverse()) await payload.delete({ collection: m.collection, id: m.id, overrideAccess: true }).catch(() => undefined)
    // Publishing an event drafts a social post for it (lib/autoDraft.ts).
    await payload.delete({
      collection: 'hq-social-drafts',
      where: { and: [{ sourceCollection: { equals: 'events' } }, { sourceId: { in: events.map(String) } }] },
      overrideAccess: true,
    })
    if (user) await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
  })

  const mine = (list: Event[]) => list.map((e) => e.slug).filter((s) => s.endsWith(`-${stamp}`))

  it('lists published Halloween events still on: no drafts, no other season, nothing finished', async () => {
    expect(mine(await getSeasonEvents('es', 'halloween', TODAY))).toEqual([slug('haunted'), slug('trunk')])
    expect(mine(await getSeasonEvents('es', 'navidad', TODAY))).toEqual([slug('navidad')])
  })

  it('takes the season over MCP as a draft, and still refuses a non-draft write', async () => {
    const id = events[events.length - 1]
    await payload.update({ collection: 'events', id, data: { season: 'halloween' }, draft: true, req: mcpReq, overrideAccess: false })
    const latest = await payload.findByID({ collection: 'events', id, draft: true, overrideAccess: true })
    expect(latest.season).toBe('halloween')
    // The draft is not live: the published row is still untagged.
    expect(mine(await getSeasonEvents('es', 'halloween', TODAY))).not.toContain(slug('untagged'))
    await expect(
      payload.update({ collection: 'events', id, data: { season: 'navidad' }, req: mcpReq, overrideAccess: false }),
    ).rejects.toThrow(/draft/)
  })

  it('shows a friendly line, not an error, when nothing is tagged', async () => {
    const none = { ...halloween, key: 'zz-none' } as unknown as Season
    const html = renderToStaticMarkup(await SeasonGuide({ season: none, lang: 'es' }))
    expect(html).toContain('data-season-empty')
    expect(html).toContain(halloween.empty.es)
    expect(html).not.toContain('/es/events/ssn-')
    // The way back to the whole board is there either way.
    expect(html).toContain('href="/es/events"')
  })

  it('is in the sitemap in both languages, dated by its newest listed event', async () => {
    const entries = await sitemap()
    const es = entries.find((e) => e.url === 'https://flamingocounty.com/es/halloween')
    const en = entries.find((e) => e.url === 'https://flamingocounty.com/en/halloween')
    expect(es && en).toBeTruthy()
    expect(es?.alternates?.languages).toMatchObject({ en: 'https://flamingocounty.com/en/halloween' })
    const trunk = await payload.find({ collection: 'events', where: { slug: { equals: slug('trunk') } }, overrideAccess: true })
    expect(new Date(es?.lastModified as Date).getTime()).toBeGreaterThanOrEqual(Date.parse(trunk.docs[0].updatedAt))
  })
})

describe('the season card route', () => {
  const get = (key: string, query: string) =>
    GET(new NextRequest(`http://localhost/api/og/season/${key}?${query}`), { params: Promise.resolve({ key }) })

  const pngSize = (buf: ArrayBuffer) => {
    const b = Buffer.from(buf)
    expect(b.subarray(1, 4).toString()).toBe('PNG')
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  }

  it('draws the Halloween card at each size, as a long-cached PNG', async () => {
    for (const [size, dims] of [
      ['link', { width: 1200, height: 630 }],
      ['social', { width: 1080, height: 1350 }],
      ['page', { width: 1200, height: 630 }],
    ] as const) {
      for (const lang of ['es', 'en']) {
        const res = await get('halloween', `lang=${lang}&size=${size}&v=1.2026`)
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toBe('image/png')
        expect(res.headers.get('cache-control')).toContain('s-maxage')
        expect(pngSize(await res.arrayBuffer())).toEqual(dims)
      }
    }
  })

  it('is a 404 for a season that does not exist', async () => {
    expect((await get('no-such-season', 'lang=es')).status).toBe(404)
  })

  it('versions its URL with the year', () => {
    expect(seasonCardUrl('halloween', 'es', 'link', 2026)).toBe('/api/og/season/halloween?lang=es&size=link&v=1.2026')
  })
})
