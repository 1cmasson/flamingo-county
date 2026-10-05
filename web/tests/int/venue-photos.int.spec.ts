// @vitest-environment node
// Uploads, sharp and the card renderer want Node, not jsdom.

import path from 'path'
import { NextRequest } from 'next/server'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import config from '@/payload.config'

import { GET } from '@/app/api/og/event/[slug]/route'
import { PhotoCredit } from '@/components/PhotoCredit'
import { creditLine, draftForPublished } from '@/lib/autoDraft'
import { eventCardPicture, renderSeasonCard, seasonCardPicture } from '@/lib/eventCard'
import { eventCardUrl } from '@/lib/eventCardUrl'
import { getEvent } from '@/lib/data'
import { addSiteMediaFromUrl, checkLicenseUrl, hqMcpTools, type SiteMediaArgs } from '@/lib/mcpTools'
import { canonicalLicenseUrl, licenseLabel, photoCredit, photoCreditText } from '@/lib/photoLicense'
import { SEASONS, sceneCreditText } from '@/lib/seasons'
import type { Media, User } from '@/payload-types'

// The allowlisted hosts resolve to a public address without touching the
// network; `localhost` still resolves to loopback.
vi.mock('dns/promises', () => ({
  lookup: vi.fn(async (host: string) => [
    { address: host === 'localhost' ? '127.0.0.1' : /^[\d.]+$/.test(host) ? host : '208.80.154.240', family: 4 },
  ]),
}))

const PESSAR = {
  credit: 'Phillip Pessar',
  license: 'cc-by-2.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/2.0/',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Hialeah_Park_Race_Track_(28830740140).jpg',
  modified: true,
} as const

/* ------------------------------------------------------------------------ */
/* Licences and credit lines                                                 */
/* ------------------------------------------------------------------------ */

describe('photo licences and credits', () => {
  it('labels and links each licence', () => {
    expect(licenseLabel('cc-by-2.0', 'es')).toBe('CC BY 2.0')
    expect(licenseLabel('cc-by-sa-4.0', 'en')).toBe('CC BY-SA 4.0')
    expect(licenseLabel('public-domain', 'es')).toBe('Dominio público')
    expect(canonicalLicenseUrl('cc-by-sa-4.0')).toBe('https://creativecommons.org/licenses/by-sa/4.0/')
    expect(canonicalLicenseUrl('cc0')).toBe('https://creativecommons.org/publicdomain/zero/1.0/')
    expect(canonicalLicenseUrl('public-domain')).toBeNull()
  })

  it('will not let a licence URL claim a different licence', () => {
    expect(checkLicenseUrl('cc-by-2.0', undefined)).toBe('https://creativecommons.org/licenses/by/2.0/')
    expect(checkLicenseUrl('cc-by-2.0', 'https://creativecommons.org/licenses/by/2.0/deed.es')).toBe('https://creativecommons.org/licenses/by/2.0/')
    expect(() => checkLicenseUrl('cc-by-2.0', 'https://creativecommons.org/licenses/by-nc/2.0/')).toThrow(/does not match/)
    expect(() => checkLicenseUrl('cc-by-4.0', 'https://example.com/licenses/by/4.0/')).toThrow(/does not match/)
  })

  it('credits a photo the same way everywhere, and says when a card is a BY-SA derivative', () => {
    const m = { id: 1, alt: 'x', ...PESSAR } as unknown as Media
    expect(photoCreditText(photoCredit(m, 'es', { cropped: true })!)).toBe('Foto: Phillip Pessar · CC BY 2.0 · recortada')
    expect(photoCreditText(photoCredit(m, 'en', { cropped: true })!)).toBe('Photo: Phillip Pessar · CC BY 2.0 · cropped')
    const sa = { ...m, credit: 'Town of Miami Lakes', license: 'cc-by-sa-4.0', licenseUrl: null } as unknown as Media
    expect(photoCreditText(photoCredit(sa, 'es', { cropped: true, card: true })!)).toBe(
      'Foto: Town of Miami Lakes · CC BY-SA 4.0 · recortada · tarjeta CC BY-SA 4.0',
    )
    // A partner's own photo: the name, nothing invented.
    const own = { id: 2, alt: 'x', credit: 'Club de la Amistad' } as unknown as Media
    expect(photoCreditText(photoCredit(own, 'es')!)).toBe('Foto: Club de la Amistad')
    expect(photoCredit({ id: 3, alt: 'x' } as unknown as Media, 'es')).toBeNull()
  })

  it('renders the credit with the source and the licence linked', () => {
    const m = { id: 1, alt: 'x', ...PESSAR } as unknown as Media
    const html = renderToStaticMarkup(PhotoCredit({ credit: photoCredit(m, 'es', { cropped: true })! }))
    expect(html).toContain(`href="${PESSAR.sourceUrl}"`)
    expect(html).toContain('href="https://creativecommons.org/licenses/by/2.0/"')
    expect(html.replace(/<[^>]+>/g, '')).toBe('Foto: Phillip Pessar · CC BY 2.0 · recortada')
    // A stored javascript: URL never becomes a link.
    const bad = photoCredit({ ...m, sourceUrl: 'javascript:alert(1)' } as unknown as Media, 'es')!
    expect(renderToStaticMarkup(PhotoCredit({ credit: bad }))).not.toContain('javascript:')
  })

  it('gives a social caption one credit line', () => {
    expect(creditLine({ id: 1, alt: 'x', ...PESSAR } as unknown as Media)).toBe(
      '📷 Foto: Phillip Pessar, CC BY 2.0 (https://creativecommons.org/licenses/by/2.0/)',
    )
    expect(creditLine({ id: 1, alt: 'x' } as unknown as Media)).toBeNull()
  })

  it('credits the Halloween scene on its cards', () => {
    const scene = SEASONS.halloween!.card.scene!
    expect(sceneCreditText(scene, 'es')).toBe('Ilustración basada en una foto de Phillip Pessar (CC BY 2.0)')
    expect(sceneCreditText(scene, 'en')).toBe('Illustration adapted from a photo by Phillip Pessar (CC BY 2.0)')
    expect(seasonCardPicture(SEASONS.halloween!, 'es')).toMatchObject({ mode: 'scene', credit: sceneCreditText(scene, 'es') })
  })
})

/* ------------------------------------------------------------------------ */
/* Against the database                                                      */
/* ------------------------------------------------------------------------ */

/** A real JPEG of the given size, as a server would send it. */
async function jpeg(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: '#2a7' } }).jpeg().toBuffer()
}

describe('venue photos against the database', () => {
  let payload: Payload
  let user: User
  let mcpReq: PayloadRequest
  const made: { collection: 'events' | 'event-kinds' | 'cities' | 'media'; id: number }[] = []

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    user = await payload.create({
      collection: 'users',
      data: { email: `photo-test-${Date.now()}@example.com`, password: 'not-a-real-password-1' },
      overrideAccess: true,
    })
    mcpReq = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    mcpReq.payloadAPI = 'MCP'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  afterAll(async () => {
    if (!payload) return
    const ids = made.filter((m) => m.collection === 'events').map((m) => String(m.id))
    if (ids.length) {
      const { docs } = await payload.find({ collection: 'hq-social-drafts', where: { sourceId: { in: ids } }, limit: 100, overrideAccess: true })
      for (const d of docs) {
        await payload.delete({ collection: 'hq-social-drafts', id: d.id, overrideAccess: true })
        for (const m of d.media ?? []) {
          await payload.delete({ collection: 'hq-media', id: typeof m === 'object' ? m.id : m, overrideAccess: true }).catch(() => undefined)
        }
        await payload.delete({ collection: 'hq-events', where: { refId: { equals: String(d.id) } }, overrideAccess: true })
      }
    }
    for (const m of made.reverse()) await payload.delete({ collection: m.collection, id: m.id, overrideAccess: true }).catch(() => undefined)
    if (user) await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
  })

  const args = (over: Partial<SiteMediaArgs> = {}): SiteMediaArgs => ({
    url: 'https://upload.wikimedia.org/wikipedia/commons/1/14/Hialeah_Park_Race_Track_%2828830740140%29.jpg',
    altEs: 'La entrada del clubhouse de Hialeah Park',
    altEn: 'The clubhouse entrance at Hialeah Park',
    credit: PESSAR.credit,
    license: PESSAR.license,
    sourceUrl: PESSAR.sourceUrl,
    ...over,
  })

  it('is an MCP tool', () => {
    expect(hqMcpTools.map((t) => t.name)).toContain('hqAddSiteMediaFromUrl')
  })

  it('refuses other hosts, http, redirects, NC/ND licences and a missing credit, before or without saving anything', async () => {
    const fetch = vi.fn(async () => new Response(await jpeg(1200, 800), { headers: { 'content-type': 'image/jpeg' } }))
    vi.stubGlobal('fetch', fetch)
    const before = (await payload.count({ collection: 'media', overrideAccess: true })).totalDocs

    await expect(addSiteMediaFromUrl(mcpReq, args({ url: 'http://upload.wikimedia.org/a.jpg' }))).rejects.toThrow(/https/)
    for (const url of [
      'https://example.com/a.jpg',
      'https://upload.wikimedia.org.evil.example/a.jpg',
      'https://maps.googleapis.com/maps/api/streetview?x=1',
      'https://s3-media0.fl.yelpcdn.com/bphoto/a.jpg',
      'https://localhost/a.jpg',
      'https://127.0.0.1/a.jpg',
    ]) {
      await expect(addSiteMediaFromUrl(mcpReq, args({ url })), url).rejects.toThrow(/not allowed/)
    }
    await expect(addSiteMediaFromUrl(mcpReq, args({ url: 'https://upload.wikimedia.org:8443/a.jpg' }))).rejects.toThrow(/port/)
    for (const license of ['cc-by-nc-4.0', 'cc-by-nd-4.0', 'cc-by-nc-sa-2.0', 'all-rights-reserved', '']) {
      await expect(addSiteMediaFromUrl(mcpReq, args({ license })), license).rejects.toThrow(/not allowed/)
    }
    await expect(addSiteMediaFromUrl(mcpReq, args({ credit: '  ' }))).rejects.toThrow(/credit is required/)
    await expect(addSiteMediaFromUrl(mcpReq, args({ credit: undefined as never }))).rejects.toThrow(/credit is required/)
    await expect(addSiteMediaFromUrl(mcpReq, args({ licenseUrl: 'https://creativecommons.org/licenses/by-nc/2.0/' }))).rejects.toThrow(/does not match/)
    await expect(addSiteMediaFromUrl(mcpReq, args({ sourceUrl: 'https://www.google.com/maps/place/x' }))).rejects.toThrow(/description page/)
    await expect(addSiteMediaFromUrl(mcpReq, args({ altEs: '' }))).rejects.toThrow(/Alt text/)
    expect(fetch).not.toHaveBeenCalled()

    // A redirect is refused, and fetch is told never to follow one.
    let redirectMode: RequestRedirect | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: unknown, init?: RequestInit) => {
        redirectMode = init?.redirect
        return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } })
      }),
    )
    await expect(addSiteMediaFromUrl(mcpReq, args())).rejects.toThrow(/redirect/)
    expect(redirectMode).toBe('error')

    // Not an image, whatever the header says; and too small for the cards.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'image/jpeg' } })))
    await expect(addSiteMediaFromUrl(mcpReq, args())).rejects.toThrow(/readable JPEG or PNG/)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })))
    await expect(addSiteMediaFromUrl(mcpReq, args())).rejects.toThrow(/JPEG or PNG only/)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await jpeg(600, 400), { headers: { 'content-type': 'image/jpeg' } })))
    await expect(addSiteMediaFromUrl(mcpReq, args())).rejects.toThrow(/Too small/)

    expect((await payload.count({ collection: 'media', overrideAccess: true })).totalDocs).toBe(before)
  })

  it('imports a licensed photo into the public media with its credit, licence and source', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await jpeg(3000, 2000), { headers: { 'content-type': 'image/jpeg' } })))
    const out = await addSiteMediaFromUrl(mcpReq, args({ focalY: 40 }))
    made.push({ collection: 'media', id: out.id })
    // Cut to 2560 on its long side before Payload makes its sizes.
    expect(out).toMatchObject({ width: 2560, height: 1707 })
    expect(out.filename).toMatch(/^Hialeah_Park_Race_Track_-28830740140-.*\.webp$/)

    const en = await payload.findByID({ collection: 'media', id: out.id, locale: 'en', overrideAccess: true })
    const es = await payload.findByID({ collection: 'media', id: out.id, locale: 'es', overrideAccess: true })
    expect(en).toMatchObject({ ...PESSAR, alt: 'The clubhouse entrance at Hialeah Park', mimeType: 'image/webp', focalX: 50, focalY: 40 })
    expect(es.alt).toBe('La entrada del clubhouse de Hialeah Park')
  })

  it('draws an event card with the photo framed on it, and the plain card without one', async () => {
    const stamp = Date.now()
    const kind = await payload.create({ collection: 'event-kinds', data: { slug: `vp-kind-${stamp}`, label: 'Outdoors', bg: '#000', ink: '#fff' } as never, overrideAccess: true })
    const city = await payload.create({ collection: 'cities', data: { slug: `vp-city-${stamp}`, name: 'HIALEAH', accent: '#FF2E88' } as never, overrideAccess: true })
    const photo = await payload.create({
      collection: 'media',
      data: { alt: 'Clubhouse', ...PESSAR },
      filePath: path.resolve(process.cwd(), 'public/uploads/flamingo-city-favicon-180.png'),
      overrideAccess: true,
    })
    made.push({ collection: 'event-kinds', id: kind.id }, { collection: 'cities', id: city.id }, { collection: 'media', id: photo.id })
    const data = { title: 'Tarde en Hialeah Park', date: '2099-10-24T12:00:00.000Z', timeLabel: '1–6 PM', kind: kind.id, venueType: 'place', place: 'Hialeah Park', city: city.id, _status: 'published' }
    const withPhoto = await payload.create({ collection: 'events', data: { ...data, slug: `vp-photo-${stamp}`, image: photo.id } as never, overrideAccess: true })
    const plain = await payload.create({ collection: 'events', data: { ...data, slug: `vp-plain-${stamp}` } as never, overrideAccess: true })
    made.push({ collection: 'events', id: withPhoto.id }, { collection: 'events', id: plain.id })

    const read = (await getEvent('es', withPhoto.slug))!
    expect(eventCardPicture(read, 'es')).toMatchObject({ mode: 'frame', credit: 'Foto: Phillip Pessar · CC BY 2.0 · recortada' })
    expect(eventCardPicture((await getEvent('es', plain.slug))!, 'es')).toBeNull()
    // Editing the photo's credit changes the card's URL, as editing the event does.
    await new Promise((r) => setTimeout(r, 5))
    await payload.update({ collection: 'media', id: photo.id, data: { credit: 'Phillip Pessar (Flickr)' }, overrideAccess: true })
    const reread = (await getEvent('es', withPhoto.slug))!
    expect(eventCardUrl(reread, 'es', 'link')).not.toBe(eventCardUrl(read, 'es', 'link'))
    await payload.update({ collection: 'media', id: photo.id, data: { credit: PESSAR.credit }, overrideAccess: true })

    const get = async (slug: string, size: string) => {
      const res = await GET(new NextRequest(`http://localhost/api/og/event/${slug}?lang=es&size=${size}`), { params: Promise.resolve({ slug }) })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/png')
      return Buffer.from(await res.arrayBuffer())
    }
    for (const [size, dims] of [
      ['link', [1200, 630]],
      ['social', [1080, 1350]],
      ['card', [960, 720]],
    ] as const) {
      const a = await get(withPhoto.slug, size)
      const b = await get(plain.slug, size)
      expect([a.readUInt32BE(16), a.readUInt32BE(20)]).toEqual(dims)
      // Same fields, so only the picture tells them apart.
      expect(a.equals(b), size).toBe(false)
    }
    // The page hero shows the photo itself, so its card is the plain one.
    expect((await get(withPhoto.slug, 'page')).equals(await get(plain.slug, 'page'))).toBe(true)
  })

  it('draws the Halloween scene behind the season card', async () => {
    const s = SEASONS.halloween!
    const withScene = Buffer.from(await renderSeasonCard(s, 'es', 'link', 2026))
    const without = Buffer.from(await renderSeasonCard(s, 'es', 'link', 2026, s.card.theme, { scene: false }))
    expect(withScene.subarray(1, 4).toString()).toBe('PNG')
    expect(withScene.equals(without)).toBe(false)
  })

  it('credits the photo at the end of an auto-drafted post', async () => {
    const stamp = Date.now()
    const city = await payload.create({ collection: 'cities', data: { slug: `vp-c2-${stamp}`, name: 'HIALEAH' } as never, overrideAccess: true })
    const kind = await payload.create({ collection: 'event-kinds', data: { slug: `vp-k2-${stamp}`, label: 'Outdoors', bg: '#000', ink: '#fff' } as never, overrideAccess: true })
    made.push({ collection: 'event-kinds', id: kind.id })
    const photo = await payload.create({
      collection: 'media',
      data: { alt: 'Clubhouse', ...PESSAR },
      filePath: path.resolve(process.cwd(), 'public/uploads/flamingo-city-favicon-180.png'),
      overrideAccess: true,
    })
    made.push({ collection: 'cities', id: city.id }, { collection: 'media', id: photo.id })
    const ev = await payload.create({
      collection: 'events',
      data: { slug: `vp-post-${stamp}`, title: 'Tarde en Hialeah Park', date: '2099-10-24T12:00:00.000Z', kind: kind.id, venueType: 'place', place: 'Hialeah Park', city: city.id, image: photo.id, _status: 'published' } as never,
      overrideAccess: true,
    })
    made.push({ collection: 'events', id: ev.id })

    const draft = (await draftForPublished(payload, 'events', ev.id))!
    expect(draft.caption.split('\n').at(-1)).toBe('📷 Foto: Phillip Pessar, CC BY 2.0 (https://creativecommons.org/licenses/by/2.0/)')
    expect(draft.caption).toContain(`/go/fb/${draft.id}`)
    // The picture is the event's card with the photo framed on it.
    expect(draft.platforms).toEqual(['facebook', 'instagram'])
    const media = await payload.findByID({ collection: 'hq-media', id: (draft.media![0] as { id: number }).id ?? draft.media![0], overrideAccess: true })
    expect(media).toMatchObject({ mimeType: 'image/jpeg', width: 1080, height: 1350 })
  })
})
