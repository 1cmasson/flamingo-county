// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { REVIEW_PREFIX, requestReview, siteSection, trafficReport } from '@/lib/growth'
import { growthContext, hqMcpTools } from '@/lib/mcpTools'
import { HELP } from '@/lib/telegramBot'
import {
  channelOf,
  classifySource,
  normalizePath,
  recordVisit,
  resetVisitLimit,
  selfCookie,
  shouldCount,
  signedInToAdmin,
} from '@/lib/visits'
import { GET as markSelf } from '@/app/api/view/self/route'

/**
 * The growth loop: the site's own visit counter (lib/visits.ts), the traffic
 * report and brief line (lib/growth.ts), `/review`, and `hqGrowthContext`.
 * See web/hq/growth-review.md.
 */

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

const browser = (extra: Record<string, string> = {}) =>
  new Headers({ 'user-agent': IPHONE, 'sec-fetch-site': 'same-origin', host: 'flamingocounty.com', ...extra })

describe('visit classification', () => {
  it('names where a visit came from', () => {
    expect(classifySource('google.com', null)).toBe('google')
    expect(classifySource('google.com.mx', null)).toBe('google')
    // Gemini lives on a google.com subdomain; it is an answer engine, not search.
    expect(classifySource('gemini.google.com', null)).toBe('gemini')
    expect(classifySource('l.facebook.com', null)).toBe('facebook')
    expect(classifySource('chatgpt.com', null)).toBe('chatgpt')
    expect(classifySource('t.co', null)).toBe('x')
    expect(classifySource('elrinconcito.com', null)).toBe('elrinconcito.com')
    expect(classifySource(null, null)).toBe('direct')
  })

  it('lets utm_source win over the referrer', () => {
    expect(classifySource('l.instagram.com', 'facebook')).toBe('facebook')
    expect(classifySource(null, 'ig')).toBe('instagram')
    expect(classifySource(null, 'chatgpt.com')).toBe('chatgpt')
    expect(classifySource(null, 'QR')).toBe('qr')
    // Junk in the tag falls back to the referrer.
    expect(classifySource('bing.com', '<script>')).toBe('bing')
  })

  it('groups sources into channels', () => {
    expect(channelOf('google')).toBe('search')
    expect(channelOf('perplexity')).toBe('ai')
    expect(channelOf('tiktok')).toBe('social')
    expect(channelOf('elrinconcito.com')).toBe('referral')
    expect(channelOf('qr')).toBe('campaign')
    expect(channelOf('direct')).toBe('direct')
  })

  it('keeps only a site path', () => {
    expect(normalizePath('/es/hialeah/?utm_source=x#top')).toBe('/es/hialeah')
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('//evil.com/x')).toBeNull()
    expect(normalizePath('https://evil.com/')).toBeNull()
    expect(normalizePath(`/${'a'.repeat(300)}`)).toBeNull()
    expect(normalizePath(42)).toBeNull()
  })

  it('does not count bots, audits, staff or other sites', () => {
    expect(shouldCount(browser())).toBe(true)
    expect(shouldCount(browser({ 'user-agent': 'facebookexternalhit/1.1' }))).toBe(false)
    expect(shouldCount(browser({ 'user-agent': `${MAC} Chrome-Lighthouse` }))).toBe(false)
    expect(shouldCount(browser({ cookie: 'fc.lang=es; payload-token=abc' }))).toBe(false)
    expect(shouldCount(browser({ 'sec-fetch-site': 'cross-site' }))).toBe(false)
    // An older browser that sends no Sec-Fetch-Site still counts.
    const old = browser()
    old.delete('sec-fetch-site')
    expect(shouldCount(old)).toBe(true)
  })

  it('does not count the owner’s marked devices', () => {
    expect(shouldCount(browser({ cookie: 'fc.lang=es; fc-self=1' }))).toBe(false)
    expect(shouldCount(browser({ cookie: 'fc-self=1' }))).toBe(false)
    // Only the exact mark; an emptied (unmarked) cookie counts again.
    expect(shouldCount(browser({ cookie: 'fc-self=' }))).toBe(true)
    expect(shouldCount(browser({ cookie: 'fc-selfie=1' }))).toBe(true)
  })

  it('does not count platforms’ link checkers in data centres', () => {
    // Meta's checker on Oct 2: an ordinary phone browser, from Prineville, OR.
    expect(shouldCount(browser({ 'cf-ipcity': 'Prineville' }))).toBe(false)
    expect(shouldCount(browser({ 'cf-ipcity': 'clonee' }))).toBe(false)
    expect(shouldCount(browser({ 'cf-ipcity': 'Boardman' }))).toBe(false)
    expect(shouldCount(browser({ 'cf-ipcity': 'Hialeah' }))).toBe(true)
  })

  it('marks and unmarks a device at /api/view/self', async () => {
    const on = markSelf(new Request('https://flamingocounty.com/api/view/self'))
    expect(on.headers.get('set-cookie')).toBe(selfCookie(true))
    expect(selfCookie(true)).toMatch(/^fc-self=1; Path=\/; Max-Age=\d+;.*HttpOnly/)
    expect(await on.text()).toContain('ya no cuenta')
    const off = markSelf(new Request('https://flamingocounty.com/api/view/self?off'))
    expect(off.headers.get('set-cookie')).toMatch(/^fc-self=; Path=\/; Max-Age=0;/)
  })

  it('knows a browser signed in to the admin, which the beacon then marks', () => {
    expect(signedInToAdmin(browser({ cookie: 'fc.lang=es; payload-token=abc' }))).toBe(true)
    expect(signedInToAdmin(browser({ cookie: 'fc-self=1' }))).toBe(false)
    expect(signedInToAdmin(browser())).toBe(false)
  })
})

describe('growth loop', () => {
  let payload: Payload
  const tag = `growth-${Date.now()}`
  const visitIds: number[] = []
  const cleanup: [string, number][] = []

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_OWNER_CHAT_ID
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no network in this suite', { status: 500 })))
  })
  beforeEach(() => resetVisitLimit())

  afterAll(async () => {
    vi.unstubAllGlobals()
    if (!payload) return
    await payload.delete({ collection: 'hq-visits', where: { path: { like: tag } }, overrideAccess: true })
    for (const [collection, id] of cleanup.reverse()) {
      await payload.delete({ collection: collection as never, id, overrideAccess: true }).catch(() => undefined)
    }
    await payload.delete({ collection: 'hq-tasks', where: { title: { contains: REVIEW_PREFIX } }, overrideAccess: true })
  })

  const latest = async () =>
    (await payload.find({ collection: 'hq-visits', where: { path: { like: tag } }, sort: '-id', limit: 1, overrideAccess: true }))
      .docs[0]

  describe('recordVisit', () => {
    it('stores an entry with its source, and nothing identifying', async () => {
      const ok = await recordVisit(
        payload,
        { path: `/es/${tag}/a?x=1`, entry: true, ref: 'www.Google.com', utm: null },
        browser({ 'cf-ipcountry': 'US', 'cf-region-code': 'FL', 'cf-ipcity': 'Hialeah', 'x-forwarded-for': '203.0.113.9' }),
      )
      expect(ok).toBe(true)
      const row = await latest()
      visitIds.push(row.id)
      expect(row).toMatchObject({
        path: `/es/${tag}/a`,
        entry: true,
        source: 'google',
        refHost: 'google.com',
        lang: 'es',
        device: 'mobile',
        country: 'US',
        region: 'FL',
        city: 'Hialeah',
      })
      expect(JSON.stringify(row)).not.toMatch(/203\.0\.113\.9|iPhone OS/)
    })

    it('gives a later page of the visit no source', async () => {
      await recordVisit(payload, { path: `/en/${tag}/b`, entry: false, ref: 'google.com', utm: 'facebook' }, browser())
      const row = await latest()
      expect(row).toMatchObject({ entry: false, lang: 'en' })
      expect(row.source ?? null).toBeNull()
      expect(row.refHost ?? null).toBeNull()
    })

    it('treats our own host as no referrer', async () => {
      await recordVisit(payload, { path: `/es/${tag}/c`, entry: true, ref: 'flamingocounty.com', utm: null }, browser())
      expect(await latest()).toMatchObject({ source: 'direct' })
    })

    it('skips bots, staff, the admin and junk paths', async () => {
      const before = (await payload.count({ collection: 'hq-visits', overrideAccess: true })).totalDocs
      const results = await Promise.all([
        recordVisit(payload, { path: `/es/${tag}/d`, entry: true }, browser({ 'user-agent': 'Googlebot/2.1' })),
        recordVisit(payload, { path: `/es/${tag}/d`, entry: true }, browser({ cookie: 'payload-token=x' })),
        recordVisit(payload, { path: '/admin/hq', entry: true }, browser()),
        recordVisit(payload, { path: '//evil.com', entry: true }, browser()),
      ])
      expect(results).toEqual([false, false, false, false])
      expect((await payload.count({ collection: 'hq-visits', overrideAccess: true })).totalDocs).toBe(before)
    })

    it('caps writes per minute', async () => {
      const t = 1_000_000
      let written = 0
      for (let i = 0; i < 245; i++) {
        if (await recordVisit(payload, { path: `/es/${tag}/cap`, entry: false }, browser(), t)) written++
      }
      expect(written).toBe(240)
      expect(await recordVisit(payload, { path: `/es/${tag}/cap`, entry: false }, browser(), t + 61_000)).toBe(true)
    }, 60_000)
  })

  describe('trafficReport', () => {
    // A far-future window, so nothing else in the test database falls into it.
    const now = new Date('2099-03-20T16:00:00Z')
    const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString()

    beforeAll(async () => {
      const rows = [
        // This week: 3 visits (google, facebook, a partner's site), 5 views.
        { path: `/es/${tag}/home`, entry: true, source: 'google', createdAt: at(1), country: 'US', region: 'FL', city: 'Hialeah' },
        { path: `/es/${tag}/menu`, entry: false, createdAt: at(1) },
        { path: `/es/${tag}/home`, entry: true, source: 'facebook', createdAt: at(2), country: 'US' },
        { path: `/en/${tag}/spot`, entry: true, source: 'elrinconcito.com', refHost: 'elrinconcito.com', createdAt: at(3) },
        { path: `/en/${tag}/spot`, entry: false, createdAt: at(3) },
        // The week before: 2 visits.
        { path: `/es/${tag}/home`, entry: true, source: 'direct', createdAt: at(9) },
        { path: `/es/${tag}/home`, entry: true, source: 'google', createdAt: at(10) },
        // Meta's link checker, stored before the counter dropped it: not a visit.
        { path: `/es/${tag}/home`, entry: true, source: 'facebook', createdAt: at(2), country: 'US', region: 'OR', city: 'Prineville' },
        // Outside the 28-day window.
        { path: `/es/${tag}/old`, entry: true, source: 'google', createdAt: at(40) },
      ]
      for (const data of rows) {
        const doc = await payload.create({ collection: 'hq-visits', data: data as never, overrideAccess: true })
        visitIds.push(doc.id)
      }
    })

    it('counts visits and views by week, channel, source and page', async () => {
      const t = await trafficReport(payload, 28, now)
      expect(t.window).toEqual({ from: '2099-02-21', to: '2099-03-20', days: 28 })
      expect(t.totals).toEqual({ views: 7, visits: 5 })
      expect(t.last7Days).toEqual({ views: 5, visits: 3, visitsChangePct: 50 })
      expect(t.previous7Days).toEqual({ views: 2, visits: 2 })
      expect(t.visitsByChannel).toEqual({ search: 2, social: 1, ai: 0, referral: 1, campaign: 0, direct: 1 })
      expect(t.visitsBySource[0]).toEqual({ key: 'google', count: 2 })
      expect(t.referringSites).toEqual([{ key: 'elrinconcito.com', count: 1 }])
      expect(t.landingPages[0]).toEqual({ key: `/es/${tag}/home`, count: 4 })
      expect(t.viewsByLanguage).toEqual({ es: 5, en: 2 })
      expect(t.visitsByRegion).toEqual([{ key: 'US-FL', count: 1 }])
      expect(t.visitsByCity).toEqual([{ key: 'Hialeah', count: 1 }])
      expect(t.daily).toHaveLength(28)
      expect(t.daily.reduce((n, d) => n + d.views, 0)).toBe(7)
    })

    it('becomes the brief’s Site section', async () => {
      const lines = siteSection(await trafficReport(payload, 28, now)).join('\n')
      expect(lines).toContain('<b>Site</b>')
      expect(lines).toContain('3 visits (+50% vs the week before) · 5 page views')
      expect(lines).toContain('google 2')
    })

    it('says nothing before the counter has any rows', () => {
      expect(siteSection({ measuredSince: null } as never)).toEqual([])
    })
  })

  describe('/review', () => {
    it('is in the bot’s help', () => {
      expect(HELP).toContain('/review')
    })

    it('files one task for Claude, and points at it when asked again', async () => {
      // A task *about* the growth review, like the one that built it, is not a request for one.
      const decoy = await payload.create({
        collection: 'hq-tasks',
        data: { title: `HQ-G1: Growth loop foundation, /review, growth review prompt ${tag}`, assignee: 'claude', status: 'doing' },
        overrideAccess: true,
      })
      cleanup.push(['hq-tasks', decoy.id])

      const first = await requestReview(payload)
      expect(first).not.toContain(`#${decoy.id}`)
      const open = await payload.find({
        collection: 'hq-tasks',
        where: { and: [{ title: { contains: REVIEW_PREFIX } }, { status: { not_equals: 'done' } }] },
        overrideAccess: true,
      })
      expect(open.totalDocs).toBe(1)
      expect(open.docs[0]).toMatchObject({ assignee: 'claude', status: 'open' })
      expect(first).toContain(`task #${open.docs[0].id}`)

      const second = await requestReview(payload)
      expect(second).toContain(`Already asked: task #${open.docs[0].id}`)
      const after = await payload.count({
        collection: 'hq-tasks',
        where: { and: [{ title: { contains: REVIEW_PREFIX } }, { status: { not_equals: 'done' } }] },
        overrideAccess: true,
      })
      expect(after.totalDocs).toBe(1)
    })
  })

  describe('hqGrowthContext', () => {
    const PII_EMAIL = `growth-canary-${Date.now()}@example.com`

    beforeAll(async () => {
      const exp = await payload.create({
        collection: 'hq-experiments',
        data: {
          title: `${tag} weekend page`,
          status: 'running',
          hypothesis: 'A weekly weekend page brings search visits.',
          metric: 'visits landing on the weekend page',
          baseline: '0',
          expected: '20 visits a week by week 4',
          startedOn: '2099-03-01T00:00:00.000Z',
          checkOn: '2099-03-29T00:00:00.000Z',
        },
        overrideAccess: true,
      })
      cleanup.push(['hq-experiments', exp.id])
      const dropped = await payload.create({
        collection: 'hq-experiments',
        data: { title: `${tag} dropped`, status: 'dropped', hypothesis: 'x', metric: 'y' },
        overrideAccess: true,
      })
      cleanup.push(['hq-experiments', dropped.id])
      // An intake event whose summary names a person: counted, never listed.
      const ev = await payload.create({
        collection: 'hq-events',
        data: { type: 'listing_request.created', summary: `New request from ${PII_EMAIL}`, status: 'new' },
        overrideAccess: true,
      })
      cleanup.push(['hq-events', ev.id])
    })

    it('is a tool', () => {
      expect(hqMcpTools.map((t) => t.name)).toContain('hqGrowthContext')
    })

    it('carries traffic, inventory, experiments and the social review, without contact details', async () => {
      const ctx = await growthContext(payload)
      expect(ctx.goal).toMatch(/Miami-Dade/)
      expect(ctx.traffic.window.days).toBe(28)
      expect(ctx.inventory.listings).toHaveProperty('ready')
      expect(ctx.socialReport.windowDays).toBe(28)
      expect(ctx).toHaveProperty('upcomingEvents')
      const titles = ctx.experiments.map((e) => e.title)
      expect(titles).toContain(`${tag} weekend page`)
      expect(titles).not.toContain(`${tag} dropped`)
      expect(ctx.experiments.find((e) => e.title === `${tag} weekend page`)).toMatchObject({
        status: 'running',
        startedOn: '2099-03-01',
        checkOn: '2099-03-29',
      })
      expect(ctx.intake.listingRequests).toBeGreaterThanOrEqual(1)
      expect(JSON.stringify(ctx)).not.toContain(PII_EMAIL)
    })
  })
})
