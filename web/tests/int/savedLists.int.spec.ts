import { describe, expect, it } from 'vitest'
import { cleanList, keepKnown, MAX_SLUGS, union } from '@/lib/savedLists'

describe('cleanList', () => {
  it('keeps unique non-empty strings in order', () => {
    expect(cleanList(['a', 'b', 'a', '', 3, null, 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('turns anything that is not an array into an empty list', () => {
    expect(cleanList('a')).toEqual([])
    expect(cleanList({ 0: 'a' })).toEqual([])
    expect(cleanList(undefined)).toEqual([])
  })

  it('caps the length', () => {
    const many = Array.from({ length: MAX_SLUGS + 50 }, (_, i) => `e${i}`)
    expect(cleanList(many)).toHaveLength(MAX_SLUGS)
  })

  it('drops absurdly long values', () => {
    expect(cleanList(['x'.repeat(201), 'ok'])).toEqual(['ok'])
  })
})

describe('keepKnown', () => {
  it('drops slugs that no longer name an event', () => {
    expect(keepKnown(['old-name', 'gala'], new Set(['gala']))).toEqual(['gala'])
  })
})

describe('union', () => {
  it('keeps the first list first and removes duplicates', () => {
    expect(union(['b', 'a'], ['a', 'c'])).toEqual(['b', 'a', 'c'])
  })
})
