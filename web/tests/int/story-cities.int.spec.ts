import { describe, expect, it } from 'vitest'
import { storyCitySlug } from '@/lib/storyCities'
import { directoryCityFor } from '@/lib/vote'
import type { Story } from '@/payload-types'

const story = (slug: string, listing: unknown = null) => ({ slug, listing }) as Pick<Story, 'slug' | 'listing'>

describe('which town a story belongs to', () => {
  it('takes the city of the business the story is about', () => {
    expect(storyCitySlug(story('anything', { slug: 'el-gallo', city: { slug: 'havana' } }))).toBe('havana')
  })

  it('falls back to the slug map for a story with no business', () => {
    expect(storyCitySlug(story('al-capone-in-hialeah'))).toBe('hialeah')
    expect(storyCitySlug(story('calle-ocho-salsa-mural'))).toBe('havana')
  })

  it('leaves a story about Miami at large unfiled rather than guessing', () => {
    expect(storyCitySlug(story('mike-bezos-pedro-pan'))).toBeNull()
    expect(storyCitySlug(story('alonzo-mourning'))).toBeNull()
  })

  it('ignores a listing that came back as a bare id', () => {
    expect(storyCitySlug(story('kc-park-hialeah', 14))).toBe('hialeah')
  })
})

describe('the vote pages that link to a town page', () => {
  it('maps the directory towns and nothing else', () => {
    expect(directoryCityFor('hialeah')).toBe('hialeah')
    expect(directoryCityFor('miami-lakes')).toBe('lakes')
    expect(directoryCityFor('miami')).toBe('havana')
    expect(directoryCityFor('doral')).toBeNull()
  })
})
