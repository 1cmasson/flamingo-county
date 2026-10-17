// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { browserOf, normalizeUse, recordUse, resetUseLimit, toolUseReport } from '@/lib/uses'

/**
 * The address tool's use counter (lib/uses.ts): only known actions, cards and
 * municipalities get in, nothing identifying is stored, and the growth review
 * gets a summary.
 */

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const INSTAGRAM = `${IPHONE.replace(' Safari/604.1', '')} Instagram 400.0.0.0.0 (iPhone15,2; iOS 18_0; en_US)`
const FACEBOOK = `${IPHONE.replace(' Safari/604.1', '')} [FBAN/FBIOS;FBAV/480.0.0]`

const browser = (extra: Record<string, string> = {}) =>
  new Headers({ 'user-agent': IPHONE, 'sec-fetch-site': 'same-origin', host: 'flamingocounty.com', ...extra })

describe('normalizeUse', () => {
  it('keeps known actions, cards and municipalities', () => {
    expect(normalizeUse({ action: 'lookup', area: 'HIALEAH', lang: 'es' })).toEqual({
      action: 'lookup',
      section: undefined,
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
    expect(u).toEqual({ action: 'lookup', section: undefined, area: undefined, lang: undefined })
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
    const r = await toolUseReport(payload, 28)
    expect(r.actions).toMatchObject({ lookup: 4, calendar: 1, copy_link: 1, link: 3 })
    expect(r.lookupsByBrowser).toEqual({ browser: 2, facebook: 2 })
    expect(r.lookupsByArea).toEqual({ HIALEAH: 3, 'MIAMI LAKES': 1 })
    expect(Object.keys(r.linksBySection)).toEqual(['flood', 'vote'])
    expect(r.calendarPerLookup).toBe(0.25)
  })
})
