import { describe, expect, it } from 'vitest'
import { POPULAR_TRIPS, popularPlan, popularTripsOn, tripAnswer } from '../../src/lib/popularTrips'

describe('popular trips', () => {
  it('each still has a bus on the schedule (re-check after a schedule edition)', () => {
    for (const t of POPULAR_TRIPS) expect(popularPlan(t).trips.length, t.slug).toBeGreaterThan(0)
  })

  it('has one slug per trip', () => {
    expect(new Set(POPULAR_TRIPS.map((t) => t.slug)).size).toBe(POPULAR_TRIPS.length)
  })

  it('answers in a sentence naming the route and the stop', () => {
    const t = POPULAR_TRIPS.find((x) => x.slug === 'hialeah-park-to-palmetto-general-hospital')!
    const answer = tripAnswer('en', popularPlan(t).trips[0], t)
    expect(answer).toMatch(/^Take Route \d+ toward .+ at the .+ stop\. It’s about \d+ min/)
  })

  it('lists on a route the trips that ride it', () => {
    expect(popularTripsOn('54').length).toBeGreaterThan(0)
    expect(popularTripsOn('no-such-route')).toEqual([])
  })
})
