import { describe, it, expect, beforeAll } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { prepare, rankMatches, fold, squash, type Suggestion } from '@/lib/search'
import { applySearch, getListings } from '@/lib/data'

/**
 * Fixtures mirroring the real rows the matcher has to cope with: an accented
 * name, an ampersand, an apostrophe, a leading numeral, and dish/cuisine terms
 * that live in `research` rather than in the name or the tag.
 */
const FIXTURES: Suggestion[] = [
  {
    id: '1',
    href: '/en/lakes/dr-limon-ceviche-bar',
    name: 'Dr. Limón Ceviche Bar — Miami Lakes',
    meta: 'RESTAURANTS · Cypress Village',
    terms: ['RESTAURANTS', 'Cypress Village', 'Peruvian', 'Ceviche'],
    tag: 'Peruvian ceviche and pisco sours.',
  },
  {
    id: '2',
    href: '/en/lakes/1910-restaurant-bar',
    name: '1910 Restaurant & Bar',
    meta: 'RESTAURANTS · Main Street Miami Lakes',
    terms: ['RESTAURANTS', 'Main Street Miami Lakes', 'Latin fusion', 'Iberico Pork Secret'],
    tag: 'Latin fusion plates and a long cuban-leaning wine list.',
  },
  {
    id: '3',
    href: '/en/hialeah/s-and-n-vegetables',
    name: 'S&N Vegetables',
    meta: 'RESTAURANTS · at W 3rd Ct',
    terms: ['RESTAURANTS', 'at W 3rd Ct', 'Juice & smoothies'],
    tag: 'Cash-only Hialeah ventanita pouring batidos since 1982.',
  },
  {
    id: '4',
    href: '/en/hialeah/molinas-ranch',
    name: "Molina's Ranch Restaurant",
    // No hood — 7 of the 11 real rows are like this.
    meta: 'RESTAURANTS',
    terms: ['RESTAURANTS', 'Cuban'],
    tag: 'Cuban steakhouse with a cafe counter up front.',
  },
  {
    id: '5',
    href: '/en/lakes/cancun-grill',
    name: 'Cancun Grill',
    meta: 'RESTAURANTS',
    terms: ['RESTAURANTS', 'Mexican', 'Molcajete de mariscos'],
    tag: 'Michoacán-style seafood.',
  },
]

const P = prepare(FIXTURES)
const names = (q: string, limit?: number) => rankMatches(P, q, limit).map((s) => s.name)

describe('fold / squash', () => {
  it('folds case and diacritics together', () => {
    expect(fold('LIMÓN')).toBe('limon')
    expect(fold('Michoacán')).toBe('michoacan')
  })

  it('drops punctuation and spacing when squashing', () => {
    expect(squash('S&N Vegetables')).toBe('snvegetables')
    expect(squash("Molina's")).toBe('molinas')
    expect(squash('dr limon')).toBe('drlimon')
  })
})

describe('rankMatches', () => {
  // Bug 1: SQLite's LIKE case-folds ASCII only, so none of the unaccented or
  // upper-case spellings reached this listing through the query.
  it.each(['limon', 'Limón', 'LIMÓN', 'limón'])('finds an accented name via %s', (q) => {
    expect(names(q)).toEqual(['Dr. Limón Ceviche Bar — Miami Lakes'])
  })

  it('folds an accent typed in the query against unaccented data', () => {
    expect(names('ibérico')).toEqual(['1910 Restaurant & Bar'])
  })

  // Bug 2: the adapter ANDs multi-word queries within a single column, so a
  // query spanning two fields could never match.
  it('matches a multi-word query across separate fields', () => {
    expect(names('molinas cuban')).toEqual(["Molina's Ranch Restaurant"])
  })

  it('matches a multi-word query that spans the punctuation in a name', () => {
    expect(names('dr limon')).toEqual(['Dr. Limón Ceviche Bar — Miami Lakes'])
  })

  // Bug 3: research.cuisine and research.signatureItems were never searched,
  // though the placeholder promises "or a dish".
  it('searches signature dishes', () => {
    expect(names('molcajete')).toEqual(['Cancun Grill'])
  })

  it('searches cuisine', () => {
    expect(names('peruvian')).toEqual(['Dr. Limón Ceviche Bar — Miami Lakes'])
  })

  it('keeps punctuated names reachable without their punctuation', () => {
    expect(names('sn')).toEqual(['S&N Vegetables'])
    expect(names('molinas')).toEqual(["Molina's Ranch Restaurant"])
  })

  it('does not explode a punctuated query into matches on every row', () => {
    // "s&n" folds to the words ["s","n"], both of which appear nearly
    // everywhere. Squashing is what keeps this to one hit.
    expect(names('s&n')).toEqual(['S&N Vegetables'])
  })

  it('ranks a name match above a facet match', () => {
    // "cuban" is in Molina's name-adjacent cuisine AND in 1910's tag prose.
    const r = names('cuban')
    expect(r[0]).toBe("Molina's Ranch Restaurant")
    expect(r).toContain('1910 Restaurant & Bar')
  })

  it('ranks a name-word match above a tag match', () => {
    expect(names('cafe')[0]).toBe("Molina's Ranch Restaurant")
  })

  it('matches a leading numeral', () => {
    expect(names('1910')).toEqual(['1910 Restaurant & Bar'])
  })

  it('holds the top hit steady while the query is being typed', () => {
    // The highlighted row must not move out from under someone about to press
    // Enter. Every prefix of "limon" keeps the same listing first.
    for (const q of ['li', 'lim', 'limo', 'limon']) {
      expect(names(q)[0]).toBe('Dr. Limón Ceviche Bar — Miami Lakes')
    }
  })

  it.each(['', '   ', '&', '  -- '])('returns nothing for %j', (q) => {
    expect(rankMatches(P, q)).toEqual([])
  })

  it('honours the limit', () => {
    expect(rankMatches(P, 'restaurants', 2)).toHaveLength(2)
  })
})

describe('applySearch against the real database', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    expect(payload).toBeDefined()
  })

  it('omits the trailing separator when a listing has no hood', () => {
    // 7 of 11 rows have a NULL hood.
    for (const s of FIXTURES) expect(s.meta.endsWith(' · ')).toBe(false)
  })

  // Bug 4: `tag` is localized, listings_locales holds only `en` rows, and the
  // adapter joins on `_locale` with no fallback — so a tag query on /es, the
  // site's default language, matched nothing at all. Filtering after the read
  // means `fallback: true` has already resolved the English tag.
  it('searches the tag on /es, where the locale has no rows of its own', async () => {
    const all = await getListings('es', {})
    const { list } = applySearch(all, 'es', 'batidos')
    expect(list.map((l) => l.slug)).toEqual(['s-and-n-vegetables'])
  })

  it('finds an accented listing from an unaccented query on /es', async () => {
    const all = await getListings('es', {})
    const { list } = applySearch(all, 'es', 'limon')
    expect(list.map((l) => l.slug)).toEqual(['dr-limon-ceviche-bar'])
  })

  it('returns every listing and a full suggestion set for a blank query', async () => {
    const all = await getListings('es', {})
    const { list, suggestions } = applySearch(all, 'es', '')
    expect(list).toHaveLength(all.length)
    expect(suggestions).toHaveLength(all.length)
    expect(suggestions.every((s) => s.href.startsWith('/es/'))).toBe(true)
  })

  it('localises the category on the suggestion meta line', async () => {
    const all = await getListings('es', {})
    const { suggestions } = applySearch(all, 'es', '')
    expect(suggestions.some((s) => s.meta.includes('RESTAURANTES'))).toBe(true)
  })
})
