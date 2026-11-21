import { describe, expect, it } from 'vitest'
import { editionFrom, nextDow, servicesOn, type Row } from '../../scripts/transit/gtfs'

/**
 * The daily bus schedule refresh reads each kind of day (weekday, Saturday,
 * Sunday) off one sample date. A new edition of the county's feed is published
 * a few days before it starts; the dates must come from the edition, not from
 * before it, or every route comes out with no buses on those days.
 */
const week = (id: string, days: 'wk' | 'sat' | 'sun', start: string, end: string): Row => ({
  service_id: id,
  monday: days === 'wk' ? '1' : '0',
  tuesday: days === 'wk' ? '1' : '0',
  wednesday: days === 'wk' ? '1' : '0',
  thursday: days === 'wk' ? '1' : '0',
  friday: days === 'wk' ? '1' : '0',
  saturday: days === 'sat' ? '1' : '0',
  sunday: days === 'sun' ? '1' : '0',
  start_date: start,
  end_date: end,
})

// The Nov 23, 2026 edition, as the feed carried it on Saturday Nov 21 (the old one gone).
const NEXT = [
  week('WK', 'wk', '20261123', '20270425'),
  week('SA', 'sat', '20261123', '20270425'),
  week('SU', 'sun', '20261123', '20270425'),
]
const SATURDAY_NOV_21 = new Date('2026-11-21T11:20:00Z')

const daysFrom = (from: Date, calendar: Row[]) => ({
  weekday: servicesOn(nextDow(from, 3), calendar, []),
  saturday: servicesOn(nextDow(from, 6), calendar, []),
  sunday: servicesOn(nextDow(from, 0), calendar, []),
})

describe('which dates the bus schedule refresh reads', () => {
  it('finds no Sunday or Saturday buses when it samples from before the edition starts', () => {
    // What the refresh did Nov 19 to 21: next Saturday and Sunday fall before Nov 23.
    const before = daysFrom(SATURDAY_NOV_21, NEXT)
    expect(before.sunday.size).toBe(0)
    expect(before.saturday.size).toBe(0)
  })

  it('samples from the day a new edition starts, so every kind of day has its buses', () => {
    const from = editionFrom(SATURDAY_NOV_21, NEXT)
    expect(nextDow(from, 0)).toBe('20261129')
    const days = daysFrom(from, NEXT)
    expect([...days.weekday]).toEqual(['WK'])
    expect([...days.saturday]).toEqual(['SA'])
    expect([...days.sunday]).toEqual(['SU'])
  })

  it('keeps today when the edition is already running', () => {
    const running = [week('WK', 'wk', '20260731', '20261122'), week('SU', 'sun', '20260731', '20261122')]
    expect(editionFrom(SATURDAY_NOV_21, running)).toBe(SATURDAY_NOV_21)
  })

  it('keeps today while the old edition is still in the feed beside the new one', () => {
    const both = [week('OLD', 'sun', '20260731', '20261122'), ...NEXT]
    expect(editionFrom(SATURDAY_NOV_21, both)).toBe(SATURDAY_NOV_21)
  })
})
