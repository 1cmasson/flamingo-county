// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { browserOf, normalizeUse, recordUse, resetUseCaches, resetUseLimit, toolUseReport } from '@/lib/uses'
import { linkKind } from '@/lib/useKinds'

/**
 * The site's use counter (lib/uses.ts): only known tools, actions, cards and
 * municipalities get in, targets must be real public pages, a search is kept
 * only when it is the site's own word, nothing identifying is stored, and the
 * growth review gets a summary.
 */

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const INSTAGRAM = `${IPHONE.replace(' Safari/604.1', '')} Instagram 400.0.0.0.0 (iPhone15,2; iOS 18_0; en_US)`
const FACEBOOK = `${IPHONE.replace(' Safari/604.1', '')} [FBAN/FBIOS;FBAV/480.0.0]`

const browser = (extra: Record<string, string> = {}) =>
  new Headers({ 'user-agent': IPHONE, 'sec-fetch-site': 'same-origin', host: 'flamingocounty.com', ...extra })

describe('normalizeUse', () => {
  it('keeps known actions, cards and municipalities', () => {
    expect(normalizeUse({ action: 'lookup', area: 'HIALEAH', lang: 'es' })).toMatchObject({
      tool: 'address',
      action: 'lookup',
      area: 'HIALEAH',
      lang: 'es',
    })
    expect(normalizeUse({ action: 'link', section: 'flood', area: 'MIAMI LAKES' })?.section).toBe('flood')
  })

  it('refuses unknown actions, and a link without its card', () => {
    expect(normalizeUse({ action: 'drop table' })).toBeNull()
    expect(normalizeUse({ action: 'link' })).toBeNull()
    expect(normalizeUse({ action: 'link', section: 'addr' })).toBeNull()
    expect(normalizeUse(null)).toBeNull()
    expect(normalizeUse('lookup')).toBeNull()
  })

  it('never keeps a string it does not know: an address in `area` is dropped', () => {
    const u = normalizeUse({ action: 'lookup', area: '5410 W 6 LN', lang: 'fr', section: 'trash', slug: '5410-w-6-ln-33012' })
    expect(u).toMatchObject({ tool: 'address', action: 'lookup' })
    expect(JSON.stringify(u)).not.toMatch(/5410|fr|trash/)
  })

  it('only lets an action happen where it can, and a social tap must name its network', () => {
    expect(normalizeUse({ tool: 'listing', action: 'call', target: 'el-gallo' })).toMatchObject({ tool: 'listing', action: 'call', target: 'el-gallo' })
    expect(normalizeUse({ tool: 'listing', action: 'lookup' })).toBeNull()
    expect(normalizeUse({ tool: 'story', action: 'going' })).toBeNull()
    expect(normalizeUse({ tool: 'nope', action: 'call' })).toBeNull()
    expect(normalizeUse({ tool: 'page', action: 'social' })).toBeNull()
    expect(normalizeUse({ tool: 'page', action: 'social', network: 'instagram' })?.network).toBe('instagram')
  })

  it('keeps a slug-shaped target and a site path, and takes the language from the path', () => {
    const u = normalizeUse({ tool: 'event', action: 'save', target: 'Not A Slug!', path: '/es/events/x?a=5410-w' })
    expect(u).toMatchObject({ target: undefined, path: '/es/events/x', lang: 'es' })
    expect(normalizeUse({ tool: 'page', action: 'call', path: '/admin/collections' })?.path).toBeUndefined()
    expect(normalizeUse({ tool: 'search', action: 'search', term: '  CEVÍCHE ', results: 3.7 })).toMatchObject({ term: 'ceviche', results: 3 })
    expect(normalizeUse({ tool: 'listing', action: 'call', term: 'x', results: 2 })).toMatchObject({ term: undefined, results: undefined })
  })
})

describe('linkKind', () => {
  const own = 'flamingocounty.com'
  it('names what a tapped link is, from its href', () => {
    expect(linkKind('tel:+13055551234', own)).toEqual({ action: 'call' })
    expect(linkKind('mailto:hola@x.com', own)).toEqual({ action: 'email' })
    expect(linkKind('https://www.google.com/maps/dir/?api=1&destination=x', own)).toEqual({ action: 'directions' })
    expect(linkKind('https://maps.apple.com/?daddr=x', own)).toEqual({ action: 'directions' })
    expect(linkKind('https://waze.com/ul?q=x', own)).toEqual({ action: 'directions' })
    expect(linkKind('https://www.instagram.com/elgallo/', own)).toEqual({ action: 'social', network: 'instagram' })
    expect(linkKind('https://wa.me/13055551234', own)).toEqual({ action: 'social', network: 'whatsapp' })
    expect(linkKind('https://elgallo.com', own)).toEqual({ action: 'website' })
  })
  it('leaves links inside the site to the page view', () => {
    expect(linkKind('/es/events', own)).toBeNull()
    expect(linkKind('https://www.flamingocounty.com/en/stories/x', own)).toBeNull()
    expect(linkKind('#search', own)).toBeNull()
    expect(linkKind('javascript:void(0)', own)).toBeNull()
  })
})

describe('browserOf', () => {
  it('names the app whose built-in browser it is', () => {
    expect(browserOf(IPHONE)).toBe('browser')
    expect(browserOf(INSTAGRAM)).toBe('instagram')
    expect(browserOf(FACEBOOK)).toBe('facebook')
    expect(browserOf('Mozilla/5.0 (iPhone) Snapchat/12.0')).toBe('other-app')
    expect(browserOf(null)).toBe('browser')
  })
})

describe('address tool uses', () => {
  let payload: Payload
  const since = new Date()

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })
  beforeEach(() => resetUseLimit())

  afterAll(async () => {
    if (!payload) return
    await payload.delete({
      collection: 'hq-uses',
      where: { createdAt: { greater_than_equal: since.toISOString() } },
      overrideAccess: true,
    })
  })

  const latest = async () =>
    (await payload.find({ collection: 'hq-uses', sort: '-id', limit: 1, overrideAccess: true })).docs[0]

  it('stores an action with its municipality and browser, and nothing identifying', async () => {
    const ok = await recordUse(
      payload,
      { action: 'lookup', area: 'HIALEAH', lang: 'es', slug: '5410-w-6-ln-33012' },
      browser({ 'user-agent': INSTAGRAM, 'cf-ipcountry': 'US', 'cf-ipcity': 'Hialeah' }),
    )
    expect(ok).toBe(true)
    const row = await latest()
    expect(row).toMatchObject({
      tool: 'address',
      action: 'lookup',
      area: 'HIALEAH',
      lang: 'es',
      browser: 'instagram',
      device: 'mobile',
      country: 'US',
    })
    const stored = JSON.stringify(row)
    expect(stored).not.toMatch(/5410|w-6-ln|Instagram 400|Hialeah"/)
  })

  it('skips bots, staff, other sites and unknown actions', async () => {
    const before = (await payload.count({ collection: 'hq-uses', overrideAccess: true })).totalDocs
    const results = await Promise.all([
      recordUse(payload, { action: 'lookup' }, browser({ 'user-agent': 'Googlebot/2.1' })),
      recordUse(payload, { action: 'lookup' }, browser({ cookie: 'payload-token=x' })),
      recordUse(payload, { action: 'lookup' }, browser({ cookie: 'fc-self=1' })),
      recordUse(payload, { action: 'lookup' }, browser({ 'sec-fetch-site': 'cross-site' })),
      recordUse(payload, { action: 'lookup' }, browser({ 'cf-ipcity': 'Prineville' })),
      recordUse(payload, { action: 'hack' }, browser()),
    ])
    expect(results.every((r) => r === false)).toBe(true)
    expect((await payload.count({ collection: 'hq-uses', overrideAccess: true })).totalDocs).toBe(before)
  })

  it('caps writes per minute', async () => {
    const t = Date.now()
    let written = 0
    for (let i = 0; i < 245; i++) if (await recordUse(payload, { action: 'map' }, browser(), t)) written++
    expect(written).toBe(240)
    expect(await recordUse(payload, { action: 'map' }, browser(), t + 61_000)).toBe(true)
    await payload.delete({ collection: 'hq-uses', where: { action: { equals: 'map' } }, overrideAccess: true })
  })

  describe('on the rest of the site', () => {
    let restore: () => void
    beforeAll(() => {
      // Pretend one business is published, with a menu the search knows.
      const count = payload.count.bind(payload)
      const find = payload.find.bind(payload)
      const c = vi.spyOn(payload, 'count').mockImplementation((async (args: Parameters<Payload['count']>[0]) =>
        args.collection === 'listings'
          ? { totalDocs: JSON.stringify(args.where).includes('"el-gallo"') ? 1 : 0 }
          : count(args)) as never)
      const f = vi.spyOn(payload, 'find').mockImplementation((async (args: Parameters<Payload['find']>[0]) =>
        args.collection === 'listings'
          ? { docs: [{ name: 'El Gallo', hood: 'Palm Springs', category: { label: 'Cafetería' }, research: { cuisine: ['Cuban'], signatureItems: ['Croqueta preparada'] } }] }
          : find(args)) as never)
      restore = () => {
        c.mockRestore()
        f.mockRestore()
      }
    })
    afterAll(() => restore())
    beforeEach(() => resetUseCaches())

    it('stores a tap on a real business, and refuses a made-up one', async () => {
      expect(await recordUse(payload, { tool: 'listing', action: 'directions', target: 'el-gallo', path: '/es/hialeah/el-gallo' }, browser())).toBe(true)
      expect(await latest()).toMatchObject({ tool: 'listing', action: 'directions', target: 'el-gallo', path: '/es/hialeah/el-gallo', lang: 'es' })
      expect(await recordUse(payload, { tool: 'listing', action: 'call', target: 'no-such-place' }, browser())).toBe(false)
    })

    it('knows the free-ride lines without asking the database', async () => {
      expect(await recordUse(payload, { tool: 'route', action: 'call', target: 'flamingo' }, browser())).toBe(true)
      expect(await recordUse(payload, { tool: 'route', action: 'call', target: 'nowhere' }, browser())).toBe(false)
    })

    it('keeps a search only when it is one of the site\'s words', async () => {
      expect(await recordUse(payload, { tool: 'search', action: 'search', term: 'Croqueta Preparada', results: 2 }, browser())).toBe(true)
      expect(await latest()).toMatchObject({ tool: 'search', term: 'croqueta preparada', results: 2 })
      expect(await recordUse(payload, { tool: 'search', action: 'no_match', term: 'Maria Lopez 5410 W 6 Ln', results: 0 }, browser())).toBe(true)
      const row = await latest()
      expect(row).toMatchObject({ tool: 'search', action: 'no_match', results: 0 })
      expect(row.term ?? null).toBeNull()
      expect(JSON.stringify(row)).not.toMatch(/maria|5410/i)
    })

    it('sums up businesses, searches and social taps for the growth review', async () => {
      await recordUse(payload, { tool: 'listing', action: 'call', target: 'el-gallo' }, browser())
      await recordUse(payload, { tool: 'listing', action: 'social', network: 'instagram', target: 'el-gallo' }, browser())
      const r = await toolUseReport(payload, 28)
      const gallo = r.listings.top.find((t) => t.target === 'el-gallo')
      expect(gallo?.total).toBeGreaterThanOrEqual(3)
      expect(gallo?.actions).toMatchObject({ call: 1, social: 1, directions: 1 })
      expect(r.searches.topTerms).toMatchObject({ 'croqueta preparada': 1 })
      expect(r.searches.foundNothing).toBeGreaterThanOrEqual(1)
      expect(r.socialNetworks).toMatchObject({ instagram: 1 })
    })
  })

  it('sums up the tool for the growth review', async () => {
    await payload.delete({
      collection: 'hq-uses',
      where: { createdAt: { greater_than_equal: since.toISOString() } },
      overrideAccess: true,
    })
    const fb = browser({ 'user-agent': FACEBOOK })
    for (const [use, h] of [
      [{ action: 'lookup', area: 'HIALEAH' }, browser()],
      [{ action: 'lookup', area: 'HIALEAH' }, fb],
      [{ action: 'lookup', area: 'MIAMI LAKES' }, fb],
      [{ action: 'lookup', area: 'HIALEAH' }, browser()],
      [{ action: 'calendar', area: 'HIALEAH' }, browser()],
      [{ action: 'copy_link', area: 'HIALEAH' }, fb],
      [{ action: 'link', section: 'flood', area: 'HIALEAH' }, browser()],
      [{ action: 'link', section: 'vote', area: 'HIALEAH' }, browser()],
      [{ action: 'link', section: 'flood', area: 'HIALEAH' }, browser()],
    ] as const) {
      expect(await recordUse(payload, use, h)).toBe(true)
    }
    const r = (await toolUseReport(payload, 28)).address
    expect(r.actions).toMatchObject({ lookup: 4, calendar: 1, copy_link: 1, link: 3 })
    expect(r.lookupsByBrowser).toEqual({ browser: 2, facebook: 2 })
    expect(r.lookupsByArea).toEqual({ HIALEAH: 3, 'MIAMI LAKES': 1 })
    expect(Object.keys(r.linksBySection)).toEqual(['flood', 'vote'])
    expect(r.calendarPerLookup).toBe(0.25)
  })
})
