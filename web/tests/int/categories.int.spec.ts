import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EDITORIAL_CATEGORIES, isSelfServeCategory } from '../../src/lib/categories'

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
    expect(seed).toMatch(/gems: \{ en: 'LOCAL GEMS', es: 'JOYAS LOCALES' \}/)
    expect(seed).toMatch(/\{ key: 'gems', label: 'LOCAL GEMS' \}/)
  })
  it('maps from the research taxonomy', () => {
    expect(research).toMatch(/gems: 'gems'/)
  })
})
