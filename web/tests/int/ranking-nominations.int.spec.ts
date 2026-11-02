// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import {
  cleanPlaceText,
  foldPlace,
  nominate,
  nominationCount,
  nominationsOpen,
  nominationTally,
  resetNominationLimits,
} from '@/lib/rankingNominations'

/**
 * Nominations on a ranking's own page (lib/rankingNominations.ts): taken only
 * while it is nominating, just a place's name (no links or phone numbers), a
 * few per address per day, staff tests left out, and the same place typed
 * different ways counted together.
 */

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const browser = (extra: Record<string, string> = {}) =>
  new Headers({ 'user-agent': IPHONE, 'sec-fetch-site': 'same-origin', host: 'flamingocounty.com', ...extra })
const T = (iso: string) => new Date(iso).getTime()
const NOW = T('2026-11-05T15:00:00Z')

describe('what counts as a place', () => {
  it('takes a name, not a link or a phone number', () => {
    expect(cleanPlaceText('  Molina’s   Ranch ', { required: true })).toBe('Molina’s Ranch')
    expect(cleanPlaceText('', { required: true })).toBe(false)
    expect(cleanPlaceText('', { required: false })).toBeNull()
    expect(cleanPlaceText('x', { required: true })).toBe(false)
    expect(cleanPlaceText('www.example.com', { required: true })).toBe(false)
    expect(cleanPlaceText('bit.ly/xyz https://spam', { required: true })).toBe(false)
    expect(cleanPlaceText('Llama al (305) 555-1234', { required: true })).toBe(false)
    expect(cleanPlaceText('4410 W 16th Ave', { required: false })).toBe('4410 W 16th Ave')
    expect(cleanPlaceText('a'.repeat(81), { required: true })).toBe(false)
  })

  it('folds one place typed different ways', () => {
    expect(foldPlace("Molina's Ranch")).toBe(foldPlace('MOLINA’S  RANCH'))
    expect(foldPlace('La Ventanita')).toBe(foldPlace('ventanita'))
    expect(foldPlace('Panadería Tíos')).toBe(foldPlace('panaderia tios'))
  })

  it('is open only while nominating, before any places and through the closing day', () => {
    expect(nominationsOpen({ entrants: [], rounds: [] }, NOW)).toBe(true)
    expect(nominationsOpen({ entrants: [{ key: 'a', name: 'A' }], rounds: [] }, NOW)).toBe(false)
    expect(nominationsOpen({ entrants: [], rounds: [], nominationsCloseOn: '2026-11-08T12:00:00.000Z' }, T('2026-11-09T03:00:00Z'))).toBe(true)
    expect(nominationsOpen({ entrants: [], rounds: [], nominationsCloseOn: '2026-11-08T12:00:00.000Z' }, T('2026-11-09T06:00:00Z'))).toBe(false)
  })
})

describe('nominating', () => {
  let payload: Payload
  let cityId: number
  const ids: number[] = []
  const slug = `nominate-test-${Date.now()}`

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const city = await payload.create({ collection: 'cities', data: { slug: `${slug}-city`, name: 'Test City' } as never, overrideAccess: true })
    cityId = city.id
    const open = await payload.create({
      collection: 'rankings',
      data: { slug, city: cityId, title: 'Test', question: 'Where?', _status: 'published' },
      overrideAccess: true,
    })
    const seeded = await payload.create({
      collection: 'rankings',
      data: { slug: `${slug}-seeded`, city: cityId, title: 'Seeded', question: 'Where?', entrants: [{ key: 'a', name: 'A' }], _status: 'published' },
      overrideAccess: true,
    })
    const draft = await payload.create({
      collection: 'rankings',
      data: { slug: `${slug}-draft`, city: cityId, title: 'Draft', question: 'Where?' },
      draft: true,
      overrideAccess: true,
    })
    ids.push(open.id, seeded.id, draft.id)
  })

  beforeEach(() => resetNominationLimits())

  afterAll(async () => {
    if (!payload) return
    for (const id of ids) {
      await payload.delete({ collection: 'ranking-nominations', where: { ranking: { equals: id } }, overrideAccess: true })
      await payload.delete({ collection: 'rankings', id, overrideAccess: true }).catch(() => undefined)
    }
    await payload.delete({ collection: 'cities', id: cityId, overrideAccess: true }).catch(() => undefined)
  })

  it('takes a nomination and answers with the new count', async () => {
    const out = await nominate(payload, { slug, name: " Molina's  Ranch ", area: 'W 49th St', utm: 'ig' }, browser({ 'cf-connecting-ip': '203.0.113.1' }), NOW)
    expect(out).toEqual({ ok: true, count: 1 })
    const { docs } = await payload.find({ collection: 'ranking-nominations', where: { ranking: { equals: ids[0] } }, overrideAccess: true })
    expect(docs[0]).toMatchObject({ name: "Molina's Ranch", area: 'W 49th St', source: 'instagram', test: false })
  })

  it('refuses bots, other sites, links and phone numbers, and a ranking that already has its places', async () => {
    const from = browser({ 'cf-connecting-ip': '203.0.113.2' })
    expect(await nominate(payload, { slug, name: 'A' }, browser({ 'user-agent': 'facebookexternalhit/1.1' }), NOW)).toMatchObject({ reason: 'refused' })
    expect(await nominate(payload, { slug, name: 'A place' }, browser({ 'sec-fetch-site': 'cross-site' }), NOW)).toMatchObject({ reason: 'refused' })
    expect(await nominate(payload, { slug, name: 'Visit www.spam.com' }, from, NOW)).toMatchObject({ reason: 'invalid' })
    expect(await nominate(payload, { slug, name: 'Good place', area: '305-555-1234' }, from, NOW)).toMatchObject({ reason: 'invalid' })
    expect(await nominate(payload, { slug: `${slug}-seeded`, name: 'Good place' }, from, NOW)).toMatchObject({ reason: 'closed' })
    expect(await nominate(payload, { slug: 'nope', name: 'Good place' }, from, NOW)).toMatchObject({ reason: 'not-found' })
  })

  it('caps one address at 3 a day', async () => {
    const from = browser({ 'cf-connecting-ip': '203.0.113.3' })
    const out = []
    for (const name of ['Uno', 'Dos', 'Tres', 'Cuatro']) out.push(await nominate(payload, { slug, name }, from, NOW))
    expect(out.filter((r) => r.ok)).toHaveLength(3)
    expect(out.at(-1)).toMatchObject({ ok: false, reason: 'busy' })
  })

  it('leaves staff tests out, and counts one place however it was typed', async () => {
    await nominate(payload, { slug, name: 'MOLINA’S RANCH' }, browser({ 'cf-connecting-ip': '203.0.113.4' }), NOW)
    const before = await nominationCount(payload, ids[0])
    const staff = await nominate(payload, { slug, name: 'Staff pick' }, browser({ cookie: 'fc-self=1' }), NOW)
    expect(staff).toMatchObject({ ok: true, count: before + 1 })
    expect(await nominationCount(payload, ids[0])).toBe(before)
    const tally = await nominationTally(payload, ids[0])
    expect(tally[0]).toMatchObject({ name: "Molina's Ranch", count: 2, areas: ['W 49th St'] })
    expect(tally.some((p) => p.name === 'Staff pick')).toBe(false)
  })

  it('lets an admin preview nominate on an unpublished draft, as a test, and nobody else', async () => {
    const from = browser({ 'cf-connecting-ip': '203.0.113.5' })
    expect(await nominate(payload, { slug: `${slug}-draft`, name: 'Draft place' }, from, NOW)).toMatchObject({ reason: 'not-found' })
    expect(await nominate(payload, { slug: `${slug}-draft`, name: 'Draft place' }, from, NOW, { preview: true })).toMatchObject({ ok: true })
    expect(await nominationCount(payload, ids[2])).toBe(0)
  })
})
