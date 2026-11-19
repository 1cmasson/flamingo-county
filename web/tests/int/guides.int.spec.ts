// @vitest-environment node
import { existsSync } from 'node:fs'
import { NextRequest } from 'next/server'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { GET as guideCard } from '@/app/api/og/guide/[key]/route'
import sitemap from '@/app/sitemap'
import { FoodGuide, guideMetadata } from '@/components/FoodGuide'
import { noPrice } from '@/fields/shared'
import { guideCardUrl } from '@/lib/eventCardUrl'
import { allGuides, filterSpots, GUIDE_FILTERS, GUIDES, spotDirections, type Guide } from '@/lib/guides'

const lechon = GUIDES.lechon as Guide

/** Every string a guide prints, in both languages. */
function strings(guide: Guide): string[] {
  const out: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(guide)
  return out
}

describe('food guides', () => {
  it('make no price claims', () => {
    for (const guide of allGuides()) {
      for (const text of strings(guide)) expect(noPrice(text), text).toBe(true)
      expect(strings(guide).join(' ')).not.toMatch(/\$/)
    }
  })

  it('are written in both languages', () => {
    for (const guide of allGuides()) {
      for (const copy of [guide.title, guide.metaTitle, guide.description, guide.question, guide.answer, guide.when, guide.hook, guide.callShort, ...guide.intro]) {
        expect(copy.en.trim()).not.toBe('')
        expect(copy.es.trim()).not.toBe('')
        expect(copy.es).not.toBe(copy.en)
      }
      expect(guide.metaTitle.en.length).toBeLessThanOrEqual(60)
      expect(guide.metaTitle.es.length).toBeLessThanOrEqual(60)
      expect(guide.description.en.length).toBeLessThanOrEqual(160)
      expect(guide.description.es.length).toBeLessThanOrEqual(160)
      // The hook and the call line are the whole first screen above the list: one line each on a phone, near enough.
      for (const line of [guide.hook, guide.callShort]) {
        expect(line.en.length).toBeLessThanOrEqual(100)
        expect(line.es.length).toBeLessThanOrEqual(100)
      }
    }
  })

  it('say, for every place, what to confirm before counting on it', () => {
    for (const guide of allGuides()) {
      const keys = guide.spots.map((s) => s.key)
      expect(new Set(keys).size).toBe(keys.length)
      for (const spot of guide.spots) {
        expect(spot.addresses.length).toBeGreaterThan(0)
        expect(spot.filters.length).toBeGreaterThan(0)
        expect(spot.ask.en).toMatch(/call to confirm/i)
        expect(spot.ask.es).toMatch(/llama para confirmar/i)
      }
    }
  })

  it('has its own page folder, which wins over [city]', () => {
    for (const guide of allGuides()) {
      expect(existsSync(join(import.meta.dirname, `../../src/app/(frontend)/[lang]/${guide.path}/page.tsx`))).toBe(true)
    }
  })

  it('filters by what a place is good for, and an unknown filter shows them all', () => {
    expect(filterSpots(lechon, null)).toHaveLength(lechon.spots.length)
    expect(filterSpots(lechon, 'nonsense')).toHaveLength(lechon.spots.length)
    for (const f of GUIDE_FILTERS) {
      const kept = filterSpots(lechon, f)
      expect(kept.length).toBeGreaterThan(0)
      expect(kept.every((s) => s.filters.includes(f))).toBe(true)
    }
    expect(filterSpots(lechon, 'whole').map((s) => s.key)).toContain('matadero-cabrera')
    expect(filterSpots(lechon, 'delivery').map((s) => s.key)).toEqual(['puerquito-asado', 'puerquito-relleno'])
  })

  it('gives directions by Apple Maps or our trip planner, never Google Maps', () => {
    const d = spotDirections('Mesa’s BBQ', '1125 W 29th St, Hialeah, FL 33012')
    expect(d.plan).toMatch(/^\/bus\/trip\?to=/)
    expect(new URLSearchParams(d.plan.split('?')[1]).get('to')).toBe('Mesa’s BBQ, 1125 W 29th St, Hialeah, FL 33012')
    expect(d.apple).toMatch(/^https:\/\/maps\.apple\.com\/\?daddr=/)
  })

  it('keeps a filtered view out of the index, and the whole guide canonical', () => {
    expect(guideMetadata(lechon, 'es').robots).toBeUndefined()
    const filtered = guideMetadata(lechon, 'es', 'delivery')
    expect(filtered.robots).toEqual({ index: false, follow: true })
    expect(filtered.alternates?.canonical).toBe('/es/lechon')
  })

  it('shares as its own card, in each language', () => {
    for (const lang of ['es', 'en'] as const) {
      const meta = guideMetadata(lechon, lang)
      const images = (meta.openGraph as { images: { url: string; width?: number; height?: number }[] }).images
      expect(images[0]).toMatchObject({ url: guideCardUrl('lechon', lang, 'link'), width: 1200, height: 630 })
      expect(meta.twitter).toMatchObject({ card: 'summary_large_image' })
    }
    expect(guideCardUrl('lechon', 'es', 'link')).toBe('/api/og/guide/lechon?lang=es&size=link&v=3')
  })

  it('keeps its card copy short and free of prices', () => {
    for (const guide of allGuides()) {
      for (const copy of [guide.card.title, guide.card.chip, guide.card.ticket, guide.card.line]) {
        expect(copy.es).not.toBe('')
        expect(copy.en).not.toBe('')
      }
      expect(guide.card.title.es.length).toBeLessThanOrEqual(24)
      expect(guide.card.title.en.length).toBeLessThanOrEqual(24)
    }
  })
})

describe('the guide card route', () => {
  const get = (key: string, query: string) =>
    guideCard(new NextRequest(`http://localhost/api/og/guide/${key}?${query}`), { params: Promise.resolve({ key }) })
  const pngSize = (buf: ArrayBuffer) => {
    const b = Buffer.from(buf)
    expect(b.subarray(1, 4).toString()).toBe('PNG')
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  }

  it('draws the lechón card for link previews in both languages, as a long-cached PNG', async () => {
    for (const lang of ['es', 'en']) {
      const res = await get('lechon', `lang=${lang}&size=link`)
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('image/png')
      expect(res.headers.get('Cache-Control')).toMatch(/max-age=86400/)
      expect(pngSize(await res.arrayBuffer())).toEqual({ width: 1200, height: 630 })
    }
    expect(pngSize(await (await get('lechon', 'lang=es&size=social')).arrayBuffer())).toEqual({ width: 1080, height: 1350 })
  })

  it('is a 404 for a guide that does not exist', async () => {
    expect((await get('pavo', 'lang=es')).status).toBe(404)
    expect((await get('constructor', 'lang=es')).status).toBe(404)
  })
})

describe('the lechón page', () => {
  let payload: Payload
  const made: { collection: 'cities' | 'categories' | 'listings'; id: number }[] = []
  const stamp = Date.now()

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    // Molina's Ranch is in the directory: the guide links its listing. Make
    // one for the test unless the database already has it.
    const { docs } = await payload.find({ collection: 'listings', where: { slug: { equals: 'molinas-ranch' } }, limit: 1, overrideAccess: true })
    if (!docs.length) {
      const city = await payload.create({ collection: 'cities', data: { slug: `gde-city-${stamp}`, name: 'HIALEAH' } as never, overrideAccess: true })
      made.push({ collection: 'cities', id: city.id })
      const category = await payload.create({ collection: 'categories', data: { slug: `gde-cat-${stamp}`, label: 'Test' } as never, overrideAccess: true })
      made.push({ collection: 'categories', id: category.id })
      const listing = await payload.create({
        collection: 'listings',
        data: { slug: 'molinas-ranch', name: 'Molina’s Ranch Restaurant', city: city.id, category: category.id, _status: 'published' } as never,
        overrideAccess: true,
      })
      made.push({ collection: 'listings', id: listing.id })
    }
  })

  afterAll(async () => {
    if (!payload) return
    for (const m of [...made].reverse()) await payload.delete({ collection: m.collection, id: m.id, overrideAccess: true })
  })

  it('lists every place in order, with its directions and what to confirm', async () => {
    const html = renderToStaticMarkup(await FoodGuide({ guide: lechon, lang: 'es' }))
    expect(html).toContain(lechon.title.es)
    let at = -1
    for (const spot of lechon.spots) {
      const i = html.indexOf(`id="${spot.key}"`)
      expect(i, spot.key).toBeGreaterThan(at)
      at = i
    }
    expect(html).toContain('/es/bus/trip?to=')
    expect(html).not.toMatch(/google\.[a-z.]+\/maps/)
    expect(html.match(/llama para confirmar/g)?.length).toBe(lechon.spots.length)
    // The Sedano's card carries all four stores.
    for (const a of lechon.spots.find((s) => s.key === 'sedanos')!.addresses) expect(html).toContain(a)
    // The directory listing is linked; places outside the directory are not.
    expect(html).toMatch(/href="\/es\/[a-z0-9-]+\/molinas-ranch"/)
    expect(html).toContain('"@type":"ItemList"')
  })

  it('puts the places first: the reading (intro, questions, tips) comes after the list', async () => {
    const html = renderToStaticMarkup(await FoodGuide({ guide: lechon, lang: 'es' }))
    const firstSpot = html.indexOf(`id="${lechon.spots[0].key}"`)
    const lastSpot = html.indexOf(`id="${lechon.spots.at(-1)!.key}"`)
    expect(html.indexOf(lechon.hook.es)).toBeLessThan(firstSpot)
    expect(html.indexOf('href="#llama-antes"')).toBeLessThan(firstSpot)
    expect(html.indexOf('id="llama-antes"')).toBeGreaterThan(lastSpot)
    expect(html.indexOf(lechon.intro[0].es)).toBeGreaterThan(lastSpot)
    expect(html.indexOf(lechon.tips[0].text.es)).toBeGreaterThan(lastSpot)
  })

  it('narrows the list with ?f=, as a link', async () => {
    const html = renderToStaticMarkup(await FoodGuide({ guide: lechon, lang: 'en', filter: 'delivery' }))
    expect(html).toContain('id="puerquito-asado"')
    expect(html).not.toContain('id="las-vinas"')
    expect(html).toContain('href="/en/lechon?f=whole"')
    expect(html).toContain('href="/en/lechon"')
    expect(html).toContain('2 spots')
  })

  it('is in the sitemap in both languages', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls.some((u) => u.endsWith('/es/lechon'))).toBe(true)
    expect(urls.some((u) => u.endsWith('/en/lechon'))).toBe(true)
  })
})
