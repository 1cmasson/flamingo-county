import { describe, expect, it } from 'vitest'
import { describeNewRequests, isRequestKind } from '../../src/lib/requestKinds'

describe('request kinds', () => {
  it('names a single kind the way the brief always has', () => {
    expect(describeNewRequests(['listing'])).toBe('1 new listing request')
    expect(describeNewRequests(['listing', null])).toBe('2 new listing requests')
    expect(describeNewRequests(['story', 'story'])).toBe('2 new story pitches')
  })

  it('breaks a mix down by kind', () => {
    expect(describeNewRequests(['listing', 'event', 'listing'])).toBe('3 new requests (2 listing, 1 event)')
  })

  it('treats anything unknown as a listing', () => {
    expect(isRequestKind('event')).toBe(true)
    expect(isRequestKind('banquet')).toBe(false)
    expect(describeNewRequests(['banquet'])).toBe('1 new listing request')
  })
})
