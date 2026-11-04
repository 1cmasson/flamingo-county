import { addDays, todayISO, weekday } from './dates'
import { meters, miamiClock, type LatLng } from './transitMath'

/**
 * "When's the next bus at my stop?" from the county's schedule, with no data
 * behind it: the route page hands its own route's times to the browser
 * (components/NextBus.tsx), and this reads them. Importing lib/county here
 * would put every route's JSON in the page's bundle.
 *
 * Each trip is a `Run` (`pnpm transit:county`): the stretch of the main line
 * it serves and its times at the county's timed stops; the stops between are
 * interpolated by ride minutes, as the county's own feed does. These are
 * schedule times — a bus can run a few minutes either way, and the pages say
 * so.
 */

export type DayKind = 'weekday' | 'saturday' | 'sunday'

/** `[from, to, at from, at to, ...at each timed stop]`, minutes after midnight (past 1440 is after midnight). */
export type Run = (number | null)[]

export type DirectionTimes = {
  id: string
  toward: string
  stations: { id: string; name: string; at: LatLng; min: number }[]
  /** The stations the county times its buses to, by index. */
  timed: number[]
  runs: Record<DayKind, Run[]>
}

export type RouteTimes = {
  serviceEnds: string | null
  /** Dates that don't run their weekday's usual buses; null is no buses at all. */
  dayKinds: Record<string, DayKind | null>
  directions: DirectionTimes[]
}

/** Which day's buses run on a date: its weekday's, unless the county says otherwise. */
export function kindOn(iso: string, dayKinds: RouteTimes['dayKinds']): DayKind | null {
  if (iso in dayKinds) return dayKinds[iso]
  const dow = weekday(iso)
  return dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : 'weekday'
}

/** When a trip passes station `i`, or null when it doesn't run that far. */
export function runTimeAt(
  run: Run,
  i: number,
  d: Pick<DirectionTimes, 'timed' | 'stations'>,
): number | null {
  const [from, to, atFrom, atTo] = run as number[]
  if (i < from || i > to) return null
  const anchors: [number, number][] = [[from, atFrom]]
  d.timed.forEach((k, j) => {
    const t = run[4 + j]
    if (k > from && k < to && t !== null) anchors.push([k, t])
  })
  anchors.push([to, atTo])
  const lo = anchors.filter(([k]) => k <= i).pop()!
  const hi = anchors.find(([k]) => k >= i)!
  if (lo[0] === hi[0]) return lo[1]
  const span = d.stations[hi[0]].min - d.stations[lo[0]].min
  const f =
    span > 0 ? (d.stations[i].min - d.stations[lo[0]].min) / span : (i - lo[0]) / (hi[0] - lo[0])
  return Math.round(lo[1] + f * (hi[1] - lo[1]))
}

export type Departure = {
  /** Minutes after today's midnight in Miami; past 1440 is tomorrow. */
  at: number
  wait: number
}

/** Don't offer a bus further out than a day. */
const HORIZON_MIN = 24 * 60

/**
 * The next buses that stop at station `i` to pick people up, on Miami's clock.
 * Yesterday's schedule counts too: after midnight, a 25:10 trip on Saturday's
 * is the 1:10 AM bus on Sunday. A bus whose run ends at the stop isn't one to
 * board, so it isn't offered.
 */
export function nextDepartures(
  route: Pick<RouteTimes, 'serviceEnds' | 'dayKinds'>,
  d: DirectionTimes,
  i: number,
  now: Date = new Date(),
  count = 3,
): Departure[] {
  const today = todayISO(now)
  const { min } = miamiClock(now)
  const out: number[] = []
  for (const offset of [-1, 0, 1]) {
    const date = addDays(today, offset)
    if (route.serviceEnds && date > route.serviceEnds) continue
    const kind = kindOn(date, route.dayKinds)
    if (!kind) continue
    for (const run of d.runs[kind]) {
      if (i === run[1]) continue
      const t = runTimeAt(run, i, d)
      if (t === null) continue
      const at = t + offset * 1440
      if (at >= min && at - min <= HORIZON_MIN) out.push(at)
    }
  }
  return [...new Set(out)]
    .sort((a, b) => a - b)
    .slice(0, count)
    .map((at) => ({ at, wait: at - min }))
}

/** The direction's station nearest a point, and how far it is. */
export function nearestStation(d: DirectionTimes, at: LatLng): { index: number; meters: number } {
  let best = { index: 0, meters: Infinity }
  d.stations.forEach((st, index) => {
    const m = meters(at, st.at)
    if (m < best.meters) best = { index, meters: m }
  })
  return best
}

/** Walking directions to a stop in Google Maps; the stop there shows the county's live arrivals. */
export function stopMapsHref(at: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${at[0]},${at[1]}&travelmode=walking`
}

/** A bus the card lists: when, how long to wait, and whether the time is live or the schedule's. */
export type Upcoming = Departure & { live: boolean }

/**
 * Live predictions first, then the schedule after them. The schedule's trips
 * carry no ids to match against the live ones, so a scheduled time at or
 * before the last live bus is taken to be that bus (running late or early)
 * and dropped; only the ones beyond it are added. With no live buses the
 * schedule stands alone.
 */
export function mergeDepartures(
  liveAt: number[],
  scheduled: Departure[],
  now: Date = new Date(),
  count = 3,
): Upcoming[] {
  const { min } = miamiClock(now)
  const nowS = now.getTime() / 1000
  const live: Upcoming[] = liveAt
    .map((at) => Math.max(0, Math.round((at - nowS) / 60)))
    .map((wait) => ({ at: min + wait, wait, live: true }))
  const after = live.length ? live[live.length - 1].at : -Infinity
  const rest = scheduled.filter((d) => d.at > after + 1).map((d) => ({ ...d, live: false }))
  return [...live, ...rest].slice(0, count)
}
