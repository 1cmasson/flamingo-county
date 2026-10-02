import { describe, it, expect } from 'vitest'
import {
  eventDaysIn,
  eventEndDay,
  groupIntoBuckets,
  isStillOn,
  utcStamp,
  type EventDates,
} from '@/lib/dates'

/**
 * The calendar file writes a UTC instant, so every event's hour depends on
 * getting Miami's offset right on that particular date — and the offset is not
 * a constant. September is EDT (UTC-4) and January is EST (UTC-5), which is a
 * whole hour of wrong for anyone who saves a winter event.
 *
 * The two spring-forward cases are the ones that justify resolving the offset
 * twice rather than once: 8 March 2026 is a 23-hour day, and 01:30 and 09:00
 * on it sit either side of the change.
 */
describe('utcStamp', () => {
  it('writes an EDT morning as UTC-4', () => {
    expect(utcStamp('2026-09-06', '09:00')).toBe('20260906T130000Z')
  })

  it('writes an EST morning as UTC-5', () => {
    expect(utcStamp('2026-01-15', '09:00')).toBe('20260115T140000Z')
  })

  it('is already on daylight time later in the spring-forward day', () => {
    expect(utcStamp('2026-03-08', '09:00')).toBe('20260308T130000Z')
  })

  it('is still on standard time before the spring-forward hour', () => {
    expect(utcStamp('2026-03-08', '01:30')).toBe('20260308T063000Z')
  })

  it('is back on standard time after the autumn change', () => {
    expect(utcStamp('2026-11-01', '09:00')).toBe('20261101T140000Z')
  })

  it('adds minutes for the default one-hour end', () => {
    expect(utcStamp('2026-09-06', '09:00', 60)).toBe('20260906T140000Z')
  })
})

describe('eventEndDay', () => {
  it('is the same day for an evening event', () => {
    expect(eventEndDay({ date: '2026-10-06T12:00:00.000Z', startTime: '17:00', endTime: '22:00' })).toBe('2026-10-06')
  })
  it('is the next day when the clock runs past midnight', () => {
    expect(eventEndDay({ date: '2026-10-06T12:00:00.000Z', startTime: '21:00', endTime: '01:00' })).toBe('2026-10-07')
  })
  it('is the endDate for a multi-day event', () => {
    expect(eventEndDay({ date: '2026-10-06', endDate: '2026-10-08T12:00:00.000Z' })).toBe('2026-10-08')
  })
  it('ignores an endDate that is not after the start', () => {
    expect(eventEndDay({ date: '2026-10-06', endDate: '2026-10-05' })).toBe('2026-10-06')
  })
})

/**
 * The events board. Today is pinned to Thursday 1 October 2026, so the buckets
 * are THIS WEEKEND 1–4 Oct, NEXT WEEK 5–11 Oct and LATER ON from 12 Oct.
 * Event dates are stored at noon UTC, as the seed and the admin write them.
 */
describe('events board', () => {
  const today = '2026-10-01'
  type Ev = EventDates & { id: string }
  const ev = (id: string, date: string, more: Partial<EventDates> = {}): Ev => ({
    id,
    date: `${date}T12:00:00.000Z`,
    ...more,
  })
  /** Where each event lands: bucket key -> day -> ids. */
  const layout = (events: Ev[]) =>
    Object.fromEntries(
      groupIntoBuckets(events, today).map((b) => [
        b.key,
        Object.fromEntries(b.days.map((d) => [d.iso, d.items.map((e) => e.id)])),
      ]),
    )

  const exhibit = ev('exhibit', '2026-09-18', { endDate: '2026-10-19T12:00:00.000Z' })

  it('lists a running exhibit under today in this weekend, once', () => {
    const groups = groupIntoBuckets([exhibit], today)
    expect(groups.find((g) => g.key === 'weekend')).toEqual({
      key: 'weekend',
      count: 1,
      days: [{ iso: '2026-10-01', items: [exhibit] }],
    })
  })

  it('lists a long run once per bucket, at the start of each', () => {
    expect(layout([exhibit])).toEqual({
      weekend: { '2026-10-01': ['exhibit'] },
      next: { '2026-10-05': ['exhibit'] },
      later: { '2026-10-12': ['exhibit'] },
    })
  })

  it('drops a single-day event that is over', () => {
    const past = ev('past', '2026-09-30', { startTime: '17:00', endTime: '22:00' })
    expect(isStillOn(past, today)).toBe(false)
    expect(groupIntoBuckets([past], today)).toEqual([])
  })

  it('puts a single-day future event on its own day, as before', () => {
    expect(
      layout([
        ev('today', '2026-10-01'),
        ev('sat', '2026-10-03'),
        ev('wed', '2026-10-07'),
        ev('nov', '2026-11-20'),
      ]),
    ).toEqual({
      weekend: { '2026-10-01': ['today'], '2026-10-03': ['sat'] },
      next: { '2026-10-07': ['wed'] },
      later: { '2026-11-20': ['nov'] },
    })
  })

  it('still lists last night past midnight, under today', () => {
    const night = ev('night', '2026-09-30', { startTime: '21:00', endTime: '01:00' })
    expect(isStillOn(night, today)).toBe(true)
    expect(layout([night])).toEqual({ weekend: { '2026-10-01': ['night'] } })
  })

  it('keeps a Sunday night past midnight in its own week only', () => {
    const sunday = ev('sunday', '2026-10-04', { startTime: '21:00', endTime: '01:00' })
    expect(layout([sunday])).toEqual({ weekend: { '2026-10-04': ['sunday'] } })
  })

  it('lists an event spanning two buckets in both, once each', () => {
    const fair = ev('fair', '2026-10-03', { endDate: '2026-10-06T12:00:00.000Z' })
    expect(layout([fair])).toEqual({
      weekend: { '2026-10-03': ['fair'] },
      next: { '2026-10-05': ['fair'] },
    })
  })

  it('places every event that is still on in at least one bucket', () => {
    const all = [
      exhibit,
      ev('past', '2026-09-29'),
      ev('night', '2026-09-30', { startTime: '21:00', endTime: '01:00' }),
      ev('sunday', '2026-10-04', { startTime: '21:00', endTime: '01:00' }),
      ev('fair', '2026-10-03', { endDate: '2026-10-06T12:00:00.000Z' }),
      ev('wed', '2026-10-07'),
    ]
    const live = all.filter((e) => isStillOn(e, today)).map((e) => e.id)
    const placed = new Set(
      groupIntoBuckets(all, today).flatMap((b) => b.days.flatMap((d) => d.items.map((e) => e.id))),
    )
    expect([...placed].sort()).toEqual([...live].sort())
    expect(live).not.toContain('past')
  })
})

describe('eventDaysIn (calendar)', () => {
  it('covers every day of a run inside the month', () => {
    const days = eventDaysIn(
      { date: '2026-09-18T12:00:00.000Z', endDate: '2026-10-19T12:00:00.000Z' },
      '2026-10-01',
      '2026-10-31',
    )
    expect(days[0]).toBe('2026-10-01')
    expect(days.at(-1)).toBe('2026-10-19')
    expect(days).toHaveLength(19)
  })

  it('puts a single-day event on its own day only', () => {
    expect(eventDaysIn({ date: '2026-10-07T12:00:00.000Z' }, '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-07',
    ])
  })

  it('keeps a past-midnight night on the day it started', () => {
    expect(
      eventDaysIn(
        { date: '2026-10-31T12:00:00.000Z', startTime: '21:00', endTime: '01:00' },
        '2026-10-01',
        '2026-11-30',
      ),
    ).toEqual(['2026-10-31'])
  })
})
