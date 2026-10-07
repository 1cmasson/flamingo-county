import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { EDITORIAL_CATEGORIES, isGem, isSelfServeCategory } from '../../src/lib/categories'
import { GemBadge, GemDiamond } from '../../src/components/GemBadge'
import { BusinessCard } from '../../src/components/BusinessCard'

describe('self-serve categories', () => {
  it('keeps gems off the List Your Spot form', () => {
    expect(EDITORIAL_CATEGORIES).toContain('gems')
    expect(isSelfServeCategory('gems')).toBe(false)
  })
  it('offers the trades and nonprofits', () => {
    for (const slug of ['food', 'night', 'nonprofit']) expect(isSelfServeCategory(slug)).toBe(true)
  })
  it('treats a missing slug as no category', () => {
    expect(isSelfServeCategory('')).toBe(false)
    expect(isSelfServeCategory(null)).toBe(false)
    expect(isSelfServeCategory(undefined)).toBe(false)
  })
})

describe('the gems category is wired in all three seed places', () => {
  // CMS.md: a category missing from CAT_KEEP is deleted on the run that makes
  // it, and one missing from research-listings' CATEGORY imports nothing, silently.
  const seed = readFileSync(join(__dirname, '../../src/seed/index.ts'), 'utf8')
  const research = readFileSync(join(__dirname, '../../src/seed/research-listings.ts'), 'utf8')
  it('is kept, relabelled and authored', () => {
    expect(seed).toMatch(/const CAT_KEEP = \[[^\]]*'gems'/)
    expect(seed).toMatch(/gems: \{ en: 'FLAMINGO COUNTY GEM', es: 'JOYA DE FLAMINGO COUNTY' \}/)
    expect(seed).toMatch(/\{ key: 'gems', label: 'FLAMINGO COUNTY GEM' \}/)
  })
  it('maps from the research taxonomy', () => {
    expect(research).toMatch(/gems: 'gems'/)
  })
})

describe('the gem badge', () => {
  it('is only for the gems category', () => {
    expect(isGem('gems')).toBe(true)
    for (const slug of ['food', 'night', 'nonprofit', '', null, undefined]) expect(isGem(slug)).toBe(false)
  })
  it('draws the diamond beside the label, the diamond hidden from screen readers', () => {
    const html = renderToStaticMarkup(createElement(GemBadge, { label: 'JOYA DE FLAMINGO COUNTY' }))
    expect(html).toContain('JOYA DE FLAMINGO COUNTY')
    expect(html).toContain('data-testid="gem-badge"')
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/)
  })
  it('hangs a 44px sticker off the corner without changing the chip height', () => {
    const html = renderToStaticMarkup(createElement(GemBadge, { label: 'FLAMINGO COUNTY GEM' }))
    expect(html).toMatch(/<svg[^>]*width="44"/)
    expect(html).toMatch(/height:34px/)
    expect(html).toMatch(/position:absolute;left:-14px;top:-17px/)
  })
  it('sizes the diamond as asked', () => {
    const html = renderToStaticMarkup(createElement(GemDiamond, { size: 15 }))
    expect(html).toMatch(/width="15"/)
    expect(html).toMatch(/height="15"/)
  })
})

describe('a business card', () => {
  const t = ((k: string) => k) as never
  const card = (slug: string, label: string) =>
    renderToStaticMarkup(
      createElement(BusinessCard, {
        lang: 'es',
        t,
        listing: {
          id: 1,
          slug: 'x',
          name: 'X',
          tag: 'tag',
          hood: 'E 32nd St',
          city: { id: 1, slug: 'hialeah', name: 'Hialeah' },
          category: { id: 4, slug, label },
          gallery: [],
        } as never,
      }),
    )
  it('wears the card-sized gem badge on its photo, and keeps only the address in the meta line', () => {
    const html = card('gems', 'JOYA DE FLAMINGO COUNTY')
    expect(html).toContain('data-testid="gem-badge"')
    expect(html).toMatch(/<svg[^>]*width="34"/)
    expect(html).toMatch(/height:27px/)
    // the label appears once, on the badge; the meta line is the address alone
    expect(html.match(/JOYA DE FLAMINGO COUNTY/g)).toHaveLength(1)
    expect(html).toMatch(/>E 32ND ST<|>E 32nd St</)
  })
  it('leaves every other card as it was', () => {
    const html = card('food', 'RESTAURANTES')
    expect(html).not.toContain('<svg')
    expect(html).toContain('RESTAURANTES')
  })
})
