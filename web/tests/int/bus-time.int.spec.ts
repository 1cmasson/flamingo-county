import { describe, it, expect } from 'vitest'
import {
  kindOn,
  nearestStation,
  nextDepartures,
  runTimeAt,
  type DirectionTimes,
  type RouteTimes,
} from '@/lib/busTime'
import { getCountyRoute, routeTimes } from '@/lib/county'

/** A three-stop line, 10 minutes apart, the middle stop untimed. */
const dir = (runs: Partial<DirectionTimes['runs']>): DirectionTimes => ({
  id: '0',
  toward: 'Downtown',
  stations: [
    { name: 'A', at: [25.8, -80.3], min: 0 },
    { name: 'B', at: [25.81, -80.3], min: 10 },
    { name: 'C', at: [25.82, -80.3], min: 20 },
  ],
  timed: [0, 2],
  runs: { weekday: [], saturday: [], sunday: [], ...runs },
})
const route = (d: DirectionTimes, extra: Partial<RouteTimes> = {}): RouteTimes => ({
  serviceEnds: '2026-11-22',
  dayKinds: {},
  directions: [d],
  ...extra,
})
/** A Miami wall-clock time in November (EST, UTC−5). */
const miami = (iso: string, hhmm: string) => new Date(`${iso}T${hhmm}:00-05:00`)

describe('next bus at a stop', () => {
  it('interpolates an untimed stop between the timed ones', () => {
    const d = dir({})
    expect(runTimeAt([0, 2, 600, 624, null, null], 1, d)).toBe(612)
  })

  it('after midnight, finds the late buses on yesterday’s schedule', () => {
    // Saturday's last trip leaves at 25:00 — 1:00 AM Sunday.
    const d = dir({ saturday: [[0, 2, 1500, 1520, null, null]] })
    const next = nextDepartures(route(d), d, 1, miami('2026-11-08', '00:45'))
    expect(next).toEqual([{ at: 70, wait: 25 }])
  })

  it('never offers a short run past where it ends, or at its last stop', () => {
    const d = dir({ weekday: [[0, 1, 600, 610, null, null]] })
    const r = route(d)
    const at = miami('2026-11-04', '09:00')
    expect(nextDepartures(r, d, 0, at)).toHaveLength(1)
    expect(nextDepartures(r, d, 1, at)).toEqual([])
    expect(nextDepartures(r, d, 2, at)).toEqual([])
  })

  it('runs a holiday on the day the county says, not its weekday', () => {
    const d = dir({
      weekday: [[0, 2, 600, 620, null, null]],
      sunday: [[0, 2, 720, 740, null, null]],
    })
    expect(kindOn('2026-11-11', { '2026-11-11': 'sunday' })).toBe('sunday')
    expect(kindOn('2026-11-12', { '2026-11-11': 'sunday' })).toBe('weekday')
    const r = route(d, { dayKinds: { '2026-11-11': 'sunday' } })
    expect(nextDepartures(r, d, 0, miami('2026-11-11', '08:00'))[0].at).toBe(720)
    // And a day with no buses at all offers the next day's first.
    const none = route(d, { dayKinds: { '2026-11-11': null } })
    expect(nextDepartures(none, d, 0, miami('2026-11-11', '20:00'))[0].at).toBe(1440 + 600)
  })

  it('offers nothing once the schedule has ended', () => {
    const d = dir({ weekday: [[0, 2, 600, 620, null, null]] })
    expect(nextDepartures(route(d), d, 0, miami('2026-11-23', '08:00'))).toEqual([])
  })

  it('picks the stop nearest a point', () => {
    expect(nearestStation(dir({}), [25.811, -80.3]).index).toBe(1)
  })
})

describe('next bus on the real routes', () => {
  it('starts Route 54’s weekday at its first bus', () => {
    const r = routeTimes(getCountyRoute('54')!)
    const d = r.directions[0]
    const first = getCountyRoute('54')!.directions[0].schedule.weekday!.first
    expect(nextDepartures(r, d, 0, miami('2026-11-04', '03:00'))[0].at).toBe(first)
  })

  it('has every trip’s times running forward along the line', () => {
    for (const slug of ['54', '37', '8', '11', 'little-havana-trolley']) {
      const r = routeTimes(getCountyRoute(slug)!)
      for (const d of r.directions) {
        for (const run of Object.values(d.runs).flat()) {
          let prev = -Infinity
          for (let i = run[0]!; i <= run[1]!; i++) {
            const t = runTimeAt(run, i, d)!
            expect(t).toBeGreaterThanOrEqual(prev)
            prev = t
          }
        }
      }
    }
  })
})
