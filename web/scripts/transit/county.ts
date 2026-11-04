/**
 * Rebuilds src/data/transit/county.json: the Miami-Dade Transit routes that
 * get a page of their own at /[lang]/bus/[route].
 *
 *   pnpm transit:county             # download the county feed and rewrite the JSON
 *   pnpm transit:county --zip f     # the feed from disk
 *
 * The feed is the county's own schedule, so it is quoted: each direction's
 * stops in order, the minutes between them, the first and last bus, and how
 * often buses come at the busy and quiet hours of each kind of day. It runs
 * to a printed end date (`serviceEnds`); the pages stop quoting times once
 * it passes, so this has to be re-run when the county publishes the next
 * one (it does, every few months, around a service change).
 *
 * A pilot of ten routes through the cities the directory covers (Hialeah,
 * Miami Lakes, Little Havana, Miami Gardens). More are a line each in ROUTES.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type Row,
  cleanStopName,
  eachStopTime,
  meters,
  minutes,
  median,
  readCsv,
  simplify,
} from './gtfs'

const FEED_URL = 'https://www.miamidade.gov/transit/googletransit/current/google_transit.zip'
const OUT = join(import.meta.dirname, '../../src/data/transit/county.json')

/**
 * The routes, by the feed's short name. `via` is the street a rider knows the
 * route by, written by hand: the county's long names are abbreviated to fit a
 * head sign ("HIALEAH-MIAMI LAKES-BISCA VIA 54 ST").
 */
const ROUTES = [
  {
    short: '54',
    slug: '54',
    kind: 'bus',
    via: 'NW 54 St and W 21 St',
    cities: ['hialeah', 'lakes'],
  },
  {
    short: '37',
    slug: '37',
    kind: 'bus',
    via: 'Palm Ave and NW 37 Ave',
    cities: ['hialeah', 'lakes'],
  },
  { short: '42', slug: '42', kind: 'bus', via: 'NW 42 Ave (Le Jeune Rd)', cities: ['hialeah'] },
  {
    short: '183',
    slug: '183',
    kind: 'bus',
    via: 'NW 183 St (Miami Gardens Dr) and NW 67 Ave',
    cities: ['hialeah', 'lakes', 'gardens'],
  },
  {
    short: '32',
    slug: '32',
    kind: 'bus',
    via: 'NW 32 Ave and NW 20 St',
    cities: ['hialeah', 'gardens'],
  },
  { short: '27', slug: '27', kind: 'bus', via: 'NW 27 Ave', cities: ['gardens', 'havana'] },
  { short: '17', slug: '17', kind: 'bus', via: 'NW 17 Ave', cities: ['gardens', 'havana'] },
  { short: '8', slug: '8', kind: 'bus', via: 'SW 8 St (Calle Ocho)', cities: ['havana'] },
  { short: '11', slug: '11', kind: 'bus', via: 'Flagler St', cities: ['havana'] },
  {
    short: 'MIAHAVA',
    slug: 'little-havana-trolley',
    kind: 'trolley',
    via: 'Little Havana',
    cities: ['havana'],
  },
] as const

/** Ends a head sign shortens past reading: "M. GARDENS NW 207 ST" → "Miami Gardens NW 207 St". */
const PLACE_WORDS: [RegExp, string][] = [
  [/\bM\. ?GARDENS\b/g, 'MIAMI GARDENS'],
  [/\bH\. ?GARDENS\b/g, 'HIALEAH GARDENS'],
  [/\bMIA GARDENS\b/g, 'MIAMI GARDENS'],
]

/** The county's abbreviations that read as words once title-cased: "Fiu" is FIU. */
function tidy(name: string): string {
  return name
    .replace(/\bFiu\b/g, 'FIU')
    .replace(/\bMdc\b/g, 'MDC')
    .replace(/\b(\d+)st\b/g, '$1 St')
    .replace(/\bTe\b/g, 'Ter')
}

/** "54A - H. GARDENS NW 87 CT/114 ST" → "Hialeah Gardens NW 87 Ct/114 St". */
function cleanHeadsign(raw: string): string {
  let s = raw.toUpperCase().replace(/^\s*[0-9A-Z]+\s*-\s*/, '')
  for (const [re, to] of PLACE_WORDS) s = s.replace(re, to)
  return tidy(cleanStopName(s)).replace(/ Via /g, ' via ')
}

/** Two stops this close, on different routes, are a transfer: the corner, or across the street. */
const TRANSFER_METERS = 120
/** The path drawn on the map keeps within this of the street. */
const PATH_TOLERANCE_METERS = 15

type DayKind = 'weekday' | 'saturday' | 'sunday'

const iso = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')

/** YYYYMMDD of the next date on or after `from` with this day of the week. */
function nextDow(from: Date, dow: number): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  while (d.getUTCDay() !== dow) d.setUTCDate(d.getUTCDate() + 1)
  return ymd(d)
}

const DOW_FIELD = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** The service ids running on a date: the weekly calendar, then that date's exceptions. */
function servicesOn(date: string, calendar: Row[], exceptions: Row[]): Set<string> {
  const y = Number(date.slice(0, 4))
  const dow = new Date(
    Date.UTC(y, Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8))),
  ).getUTCDay()
  const on = new Set(
    calendar
      .filter((c) => c[DOW_FIELD[dow]] === '1' && c.start_date <= date && date <= c.end_date)
      .map((c) => c.service_id),
  )
  for (const x of exceptions) {
    if (x.date !== date) continue
    if (x.exception_type === '1') on.add(x.service_id)
    else on.delete(x.service_id)
  }
  return on
}

/**
 * Buses closer together than this are one wait to a rider: two branches of a
 * route meeting on the trunk (route 8's buses reach Calle Ocho in pairs four
 * minutes apart, every half hour). Counted apart, the median gap came out at
 * "every 5 min".
 */
const BUNCH_MINUTES = 7

/** Typical minutes between buses in a window of the day, or null when fewer than three buses pass. */
function headwayIn(times: number[], from: number, to: number): number | null {
  const inside: number[] = []
  for (const t of times) {
    if (t < from || t >= to) continue
    if (inside.length && t - inside[inside.length - 1] < BUNCH_MINUTES) continue
    inside.push(t)
  }
  if (inside.length < 3) return null
  const gaps = inside.slice(1).map((t, i) => t - inside[i])
  const m = median(gaps)
  return m === null ? null : Math.round(m)
}

/** Main-line stops a trip may skip and still count as running the stretch (a stop it passes by). */
const MAX_SKIP = 3

/**
 * One trip as the pages read it: the stretch of the main line it serves and
 * its times there. `[from, to, at from, at to, ...at each timed stop]`, the
 * timed stops outside the stretch null. The stops between are interpolated by
 * ride minutes, as the county's own feed does between its timepoints; every
 * stop's time for every trip would be a megabyte for no better answer.
 */
type Run = (number | null)[]

function runOf(trip: Row[], ids: string[], mins: number[], timed: number[]): Run | null {
  const hit: (number | undefined)[] = []
  let j = 0
  for (const st of trip) {
    const k = ids.indexOf(st.stop_id, j)
    if (k === -1) continue
    hit[k] = minutes(st.departure_time || st.arrival_time)
    j = k + 1
  }
  // The longest stretch the trip runs along the main line: a bus that leaves
  // it for a branch isn't offered at the stops it skips.
  const served = hit.flatMap((t, k) => (t === undefined ? [] : [k]))
  let best: number[] = []
  let cur: number[] = []
  for (const k of served) {
    if (cur.length && k - cur[cur.length - 1] > MAX_SKIP + 1) cur = []
    cur.push(k)
    if (cur.length > best.length) best = cur
  }
  if (best.length < 2) return null
  const from = best[0]
  const to = best[best.length - 1]
  const inBest = new Set(best)
  /** A stop's time from the served stops either side of it. */
  const timeAt = (i: number) => {
    if (inBest.has(i)) return Math.round(hit[i]!)
    const lo = best.filter((k) => k < i).pop()!
    const hi = best.find((k) => k > i)!
    const span = mins[hi] - mins[lo]
    const f = span > 0 ? (mins[i] - mins[lo]) / span : 0
    return Math.round(hit[lo]! + f * (hit[hi]! - hit[lo]!))
  }
  return [
    from,
    to,
    timeAt(from),
    timeAt(to),
    ...timed.map((i) => (i > from && i < to ? timeAt(i) : null)),
  ]
}

async function main() {
  const zipArg = process.argv.indexOf('--zip')
  const dir = mkdtempSync(join(tmpdir(), 'mdt-county-'))
  let zip = zipArg > -1 ? process.argv[zipArg + 1] : join(dir, 'feed.zip')
  if (zipArg === -1) {
    console.log(`Downloading ${FEED_URL}`)
    const res = await fetch(FEED_URL)
    if (!res.ok) throw new Error(`Feed download failed: ${res.status} ${res.statusText}`)
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()))
  }
  zip = zip.startsWith('/') ? zip : join(process.cwd(), zip)
  execFileSync('unzip', ['-o', '-q', zip, '-d', dir])

  const routes = readCsv(dir, 'routes.txt')
  const trips = readCsv(dir, 'trips.txt')
  const stops = new Map(readCsv(dir, 'stops.txt').map((s) => [s.stop_id, s]))
  const calendar = readCsv(dir, 'calendar.txt')
  const exceptions = readCsv(dir, 'calendar_dates.txt')
  const at = (id: string): [number, number] => {
    const s = stops.get(id)!
    return [Number(s.stop_lat), Number(s.stop_lon)]
  }

  // One date of each kind, from today: the services that run on it are that
  // kind of day's schedule.
  const today = new Date()
  const days: Record<DayKind, Set<string>> = {
    weekday: servicesOn(nextDow(today, 3), calendar, exceptions),
    saturday: servicesOn(nextDow(today, 6), calendar, exceptions),
    sunday: servicesOn(nextDow(today, 0), calendar, exceptions),
  }
  /**
   * The dates, until a route's schedule ends, that don't run their weekday's
   * usual buses: a holiday on Sunday hours, or no buses at all (null).
   */
  const dayKindsUntil = (from: Date, until: string, mine: Set<string>) => {
    const only = (set: Set<string>) =>
      [...set]
        .filter((id) => mine.has(id))
        .sort()
        .join(' ')
    const usual = Object.fromEntries(
      (Object.keys(days) as DayKind[]).map((k) => [k, only(days[k])]),
    ) as Record<DayKind, string>
    const out: Record<string, DayKind | null> = {}
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
    for (let date = ymd(d); date <= until; d.setUTCDate(d.getUTCDate() + 1), date = ymd(d)) {
      const dow = d.getUTCDay()
      const own: DayKind = dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : 'weekday'
      const runs = only(servicesOn(date, calendar, exceptions))
      if (runs === usual[own]) continue
      if (!runs) out[iso(date)] = null
      else {
        const kind = (Object.keys(usual) as DayKind[]).find((k) => usual[k] === runs)
        if (kind) out[iso(date)] = kind
      }
    }
    return out
  }
  const routeOf = new Map(routes.map((r) => [r.route_id, r]))
  const picked = ROUTES.map((r) => {
    const row = routes.find((x) => x.route_short_name === r.short)
    if (!row) throw new Error(`Route ${r.short} is not in this feed — did the county renumber it?`)
    return { ...r, row }
  })
  const pickedIds = new Set(picked.map((p) => p.row.route_id))

  // One pass over every trip's stops: which routes stop where (for the
  // transfers), and our routes' trips whole.
  console.log('Reading stop_times…')
  const shortOfTrip = new Map(
    trips.map((t) => [t.trip_id, routeOf.get(t.route_id)?.route_short_name ?? '']),
  )
  const ourTrips = new Set(trips.filter((t) => pickedIds.has(t.route_id)).map((t) => t.trip_id))
  const byTrip = new Map<string, Row[]>()
  const routesAtStop = new Map<string, Set<string>>()
  await eachStopTime(dir, (st) => {
    const short = shortOfTrip.get(st.trip_id)
    if (short) {
      const set = routesAtStop.get(st.stop_id) ?? new Set()
      set.add(short)
      routesAtStop.set(st.stop_id, set)
    }
    if (!ourTrips.has(st.trip_id)) return
    const list = byTrip.get(st.trip_id) ?? []
    list.push(st)
    byTrip.set(st.trip_id, list)
  })
  for (const list of byTrip.values())
    list.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence))

  const servedStops = [...routesAtStop.keys()].map((id) => ({ id, at: at(id) }))
  /** Every other route stopping within TRANSFER_METERS of a stop. */
  const transfersAt = (id: string, self: string): string[] => {
    const here = at(id)
    const out = new Set<string>()
    for (const s of servedStops) {
      // A cheap box before the real distance: a degree of latitude is 111 km.
      if (Math.abs(s.at[0] - here[0]) > 0.0015 || Math.abs(s.at[1] - here[1]) > 0.0017) continue
      if (meters(s.at, here) > TRANSFER_METERS) continue
      for (const r of routesAtStop.get(s.id)!) if (r !== self) out.add(r)
    }
    return [...out].sort((a, b) => (Number(a) || 1e9) - (Number(b) || 1e9) || a.localeCompare(b))
  }

  const shapes = new Map<string, [number, number, number][]>()
  for (const row of readCsv(dir, 'shapes.txt')) {
    const list = shapes.get(row.shape_id) ?? []
    list.push([Number(row.shape_pt_lat), Number(row.shape_pt_lon), Number(row.shape_pt_sequence)])
    shapes.set(row.shape_id, list)
  }

  const out = picked.map((p) => {
    const mine = trips.filter((t) => t.route_id === p.row.route_id)
    const directions = ['0', '1']
      .map((dirId) => {
        const dirTrips = mine.filter(
          (t) => t.direction_id === dirId && byTrip.get(t.trip_id)?.length,
        )
        if (!dirTrips.length) return null
        const weekday = dirTrips.filter((t) => days.weekday.has(t.service_id))
        const pool = weekday.length ? weekday : dirTrips

        // The trips' stop patterns. The line drawn is the longest pattern that
        // carries at least a quarter of the trips, so a route whose buses
        // mostly turn short still shows where it goes; the shorter runs are
        // named as "some buses end at …".
        const patterns = new Map<string, Row[]>()
        for (const t of pool) {
          const key = byTrip
            .get(t.trip_id)!
            .map((s) => s.stop_id)
            .join(' ')
          patterns.set(key, [...(patterns.get(key) ?? []), t])
        }
        const ranked = [...patterns.entries()].sort((a, b) => b[1].length - a[1].length)
        const enough = ranked.filter(([, ts]) => ts.length >= pool.length / 4)
        const [, mainTrips] =
          enough.sort((a, b) => b[0].split(' ').length - a[0].split(' ').length)[0] ?? ranked[0]

        // The trip nearest midday stands for the pattern's ride minutes.
        const start = (t: Row) => minutes(byTrip.get(t.trip_id)![0].departure_time)
        const rep = [...mainTrips].sort(
          (a, b) => Math.abs(start(a) - 720) - Math.abs(start(b) - 720),
        )[0]
        const repStops = byTrip.get(rep.trip_id)!
        const t0 = minutes(repStops[0].departure_time)
        const stationList = repStops.map((st) => ({
          id: st.stop_id,
          name: tidy(cleanStopName(stops.get(st.stop_id)!.stop_name)),
          at: at(st.stop_id),
          min: Math.round(minutes(st.arrival_time || st.departure_time) - t0),
          timepoint: st.timepoint === '1',
          transfers: transfersAt(st.stop_id, p.short),
        }))

        // Every trip's times along the main line, per kind of day: what "the
        // next bus at your stop" is read from.
        const ids = repStops.map((st) => st.stop_id)
        const mins = stationList.map((st) => st.min)
        const timed = stationList
          .map((st, i) => (st.timepoint || i === 0 || i === stationList.length - 1 ? i : -1))
          .filter((i) => i > -1)
        const runs = Object.fromEntries(
          (Object.keys(days) as DayKind[]).map((kind) => [
            kind,
            dirTrips
              .filter((t) => days[kind].has(t.service_id))
              .map((t) => runOf(byTrip.get(t.trip_id)!, ids, mins, timed))
              .filter((r): r is Run => r !== null)
              .sort((a, b) => a[2]! - b[2]!),
          ]),
        )

        // The schedule, per kind of day: the first and last bus out, and the
        // gaps between buses at the day's busiest stop — every pattern passes
        // there, short runs included.
        const schedule = Object.fromEntries(
          (Object.keys(days) as DayKind[]).map((kind) => {
            const ts = dirTrips.filter((t) => days[kind].has(t.service_id))
            if (!ts.length) return [kind, null]
            const count = new Map<string, number>()
            for (const t of ts)
              for (const st of byTrip.get(t.trip_id)!)
                count.set(st.stop_id, (count.get(st.stop_id) ?? 0) + 1)
            const busiest = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0]
            const passes = ts
              .map((t) => byTrip.get(t.trip_id)!.find((st) => st.stop_id === busiest))
              .filter((st): st is Row => !!st)
              .map((st) => minutes(st.departure_time))
              .sort((a, b) => a - b)
            // When the day's buses leave their first stop. Not one stop's
            // times: on a weekend a route's buses can start somewhere else.
            const leaves = ts.map((t) => Math.round(start(t))).sort((a, b) => a - b)
            return [
              kind,
              {
                trips: ts.length,
                first: leaves[0],
                last: leaves[leaves.length - 1],
                headway: {
                  morning: headwayIn(passes, 6 * 60 + 30, 9 * 60),
                  midday: headwayIn(passes, 10 * 60, 14 * 60),
                  evening: headwayIn(passes, 19 * 60, 22 * 60),
                },
              },
            ]
          }),
        )

        const headsigns = new Map<string, number>()
        for (const t of pool) {
          const h = cleanHeadsign(t.trip_headsign)
          headsigns.set(h, (headsigns.get(h) ?? 0) + 1)
        }
        const mainSign = cleanHeadsign(rep.trip_headsign)
        const shape = (shapes.get(rep.shape_id) ?? [])
          .sort((a, b) => a[2] - b[2])
          .map(([la, lo]) => [la, lo] as [number, number])
        return {
          id: dirId,
          // A trolley's head sign is its own name ("Little Havana Route"); its last stop says where it's going.
          toward: /\broute$/i.test(mainSign) ? stationList[stationList.length - 1].name : mainSign,
          alsoEnds: [...headsigns.entries()]
            .filter(([h, n]) => h !== mainSign && n >= pool.length / 10)
            .map(([h]) => h),
          rideMinutes: stationList[stationList.length - 1].min,
          stations: stationList,
          path: simplify(shape, PATH_TOLERANCE_METERS).map(([la, lo]) => [
            Number(la.toFixed(5)),
            Number(lo.toFixed(5)),
          ]),
          schedule,
          timed,
          runs,
        }
      })
      .filter((d) => d !== null)

    const used = new Set(
      mine.filter((t) => days.weekday.has(t.service_id)).map((t) => t.service_id),
    )
    const routeEnds = calendar
      .filter((c) => used.has(c.service_id))
      .map((c) => c.end_date)
      .sort()
    const end = routeEnds[0] ?? null
    return {
      slug: p.slug,
      short: p.short,
      // The feed's own id, which the live predictions (lib/countyLive.ts) carry.
      // It belongs to this edition of the feed: re-run after a service change.
      routeId: p.row.route_id,
      kind: p.kind,
      number: /^\d+$/.test(p.short) ? p.short : null,
      countyName: p.row.route_long_name,
      via: p.via,
      cities: p.cities,
      color: `#${p.row.route_color || '0c0f14'}`,
      // Past this day the county's schedule for the route may have changed.
      serviceEnds: end ? iso(end) : null,
      dayKinds: end ? dayKindsUntil(today, end, new Set(mine.map((t) => t.service_id))) : {},
      directions,
    }
  })

  // Names for every route a transfer can mention, ours or not.
  const lines = Object.fromEntries(
    routes.map((r) => [
      r.route_short_name,
      {
        kind:
          r.route_type === '1' || r.route_type === '2'
            ? 'rail'
            : r.route_type === '0'
              ? 'mover'
              : /^\d+$/.test(r.route_short_name)
                ? 'bus'
                : 'trolley',
        name: r.route_long_name.replace(/^City of\s+/i, ''),
        ours: pickedIds.has(r.route_id),
      },
    ]),
  )

  const ends = out
    .map((r) => r.serviceEnds)
    .filter((d) => d !== null)
    .sort()
  const data = {
    source: {
      name: 'Miami-Dade Transit (GTFS)',
      url: FEED_URL,
      fetchedAt: new Date().toISOString(),
      // The soonest route's schedule end: re-run this before it.
      serviceEnds: ends[0] ?? null,
    },
    routes: out,
    lines,
  }
  writeFileSync(OUT, JSON.stringify(data) + '\n')
  const stopsCount = out.reduce(
    (n, r) => n + r.directions.reduce((m, d) => m + d.stations.length, 0),
    0,
  )
  console.log(
    `Wrote ${OUT}: ${out.length} routes, ${stopsCount} stops; schedule ends ${data.source.serviceEnds}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
