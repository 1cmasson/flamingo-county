import { describe, expect, it } from 'vitest'
import { pendingFrom, withoutPending, withPending } from '@/lib/member'

/** The interrupted tap rides through Google in the callback URL. */
describe('pending tap in the URL', () => {
  it('round-trips, keeping the rest of the query', () => {
    const url = withPending('/es/events', '?city=hialeah', { kind: 'save', slug: 'gala' })
    expect(url).toBe('/es/events?city=hialeah&fc_do=save&fc_e=gala')
    expect(pendingFrom(url.slice(url.indexOf('?')))).toEqual({ kind: 'save', slug: 'gala' })
    expect(withoutPending('/es/events', '?city=hialeah&fc_do=save&fc_e=gala')).toBe('/es/events?city=hialeah')
  })

  it('drops the query mark when nothing else is left', () => {
    expect(withoutPending('/en/events/gala', '?fc_do=ics&fc_e=gala')).toBe('/en/events/gala')
  })

  it('ignores anything that is not a known action', () => {
    expect(pendingFrom('?fc_do=delete&fc_e=gala')).toBeNull()
    expect(pendingFrom('?fc_do=save')).toBeNull()
    expect(pendingFrom('')).toBeNull()
  })
})
