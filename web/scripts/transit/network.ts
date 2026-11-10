/**
 * Rebuilds src/data/transit/network.json: every route in Miami-Dade Transit's
 * feed, reduced to what the trip planner needs, so «¿Qué guagua cojo?» can
 * plan with all of them together: Metrobus, Metrorail, Metromover and the
 * cities' trolleys.
 *
 *   pnpm transit:network            # download the county feed and rewrite the JSON
 *   pnpm transit:network --zip f    # the feed from disk
 *
 * Re-run it whenever `pnpm transit:county` is re-run (each new edition of the
 * county's schedule, every few months): stop ids and route ids change.
 *
 * Kept small because every visitor's phone downloads it:
 * - one table of stops, shared by every route (a corner is listed once);
 * - per direction, each stop pattern that carries a real share of the trips
 *   (Metrorail's Green and Orange lines share a trunk and split; route 8 has
 *   branches), as stop indexes and ride minutes, nothing else;
 * - per route, when it runs (first and last trip of each kind of day) and how
 *   often, so the planner offers only what's running and knows the wait.
 * No street paths: a ride is drawn through its stops.
 *
 * Hialeah's free Flamingo and Marlin are left out on purpose: the site uses
 * the City of Hialeah's own data for them (src/data/transit/hialeah.json), and
 * lib/network.ts adds them from there.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type DayKind,
  type Row,
  cleanHeadsign,
  cleanStopName,
  eachStopTime,
  feedHash,
  headwayIn,
  iso,
  meters,
  minutes,
  nextDow,
  readCsv,
  servicesOn,
  tidy,
} from './gtfs'

const FEED_URL = 'https://www.miamidade.gov/transit/googletransit/current/google_transit.zip'
const OUT = join(import.meta.dirname, '../../src/data/transit/network.json')
/** A few bytes the browser bundle can carry: which edition the network is, for its cache. */
const VERSION_OUT = join(import.meta.dirname, '../../src/data/transit/network-version.json')


/** Built from the City of Hialeah's data instead (see above). */
const SKIP = new Set(['HIAFLA', 'HIAMAR'])

/** Slugs the site already uses for a route (lib/county.ts, the route pages); the rest are the short name. */
const SLUGS: Record<string, string> = {
  MIAHAVA: 'little-havana-trolley',
  '2600': 'metrorail',
  MMI: 'metromover-inner',
  MMO: 'metromover-outer',
  MIA: 'mia-mover',
}

/**
 * Free to ride, each from its operator:
 * - Metromover and the MIA Mover: fare-free (miamidade.gov/global/transportation/metromover.page; the airport's own train).
 * - The City of Miami's trolleys: free (miami.gov, Trolley Information).
 * Metrobus and Metrorail charge a fare. Every other city's trolley is left
 * unmarked until its own page has been checked: a «GRATIS» that turns out
 * wrong costs a rider money.
 */
function fareOf(short: string, routeType: string): 'free' | 'paid' | null {
  if (short === 'MMI' || short === 'MMO' || short === 'MIA') return 'free'
  if (/^MIA[A-Z]+$/.test(short) && short !== 'MIASPG') return 'free'
  if (/^\d+$/.test(short) || routeType === '1' || routeType === '2') return 'paid'
  return null
}

function kindOf(short: string, routeType: string): 'bus' | 'trolley' | 'rail' | 'mover' {
  if (routeType === '1' || routeType === '2') return 'rail'
  if (routeType === '0') return 'mover'
  return /^\d+$/.test(short) ? 'bus' : 'trolley'
}

/** What a rider calls it. Numbered buses have none (the page says «Ruta 9»). */
function nameOf(short: string, long: string, kind: string): string | null {
  if (kind === 'bus') return null
  if (kind === 'rail') return 'Metrorail'
  if (short === 'MIA') return 'MIA Mover'
  if (kind === 'mover') return 'Metromover'
  return long
    .replace(/^City of\s+/i, '')
    .replace(/^Village of\s+/i, '')
    .replace(/\s+-\s+/g, ' ')
    .replace(/\s+(Route|Rte)\b/g, /trolley/i.test(long) ? '' : ' Trolley')
    .replace(/\bExp\b/g, 'Express')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A pattern carrying less than this share of a direction's trips is a rare variant, not a way to plan. */
const MIN_SHARE = 0.1
/** Ends this close together: the route is a loop, and a ride can go round past its first stop. */
const LOOP_METERS = 200

/**
 * A rail or Metromover platform as the signs say it: "Government Ctr.Stat.Rail
 * Northbound" → "Government Center Station". The direction is the train's,
 * which the step already says («hacia Dadeland South»).
 */
export function stationName(raw: string): string {
  return raw
    .replace(/\s*(Rail\s*)?(North|South)bound$/i, '')
    .replace(/\s*Rail$/i, '')
    .replace(/Stat\.\s*/g, 'Station ')
    .replace(/\bCtr\./g, 'Center ')
    .replace(/\bHts\./g, 'Heights ')
    .replace(/\bM\.L\. King\b/, 'Dr. Martin Luther King Jr.')
    .replace(/\bUhealth\b/, 'UHealth')
    .replace(/\bPromanade\b/, 'Promenade')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Coordinates to 5 decimals (about a metre): plenty for a walk, half the bytes. */
const r5 = (x: number) => Number(x.toFixed(5))

async function main() {
  const zipArg = process.argv.indexOf('--zip')
  const dir = mkdtempSync(join(tmpdir(), 'mdt-network-'))
  let zip = zipArg > -1 ? process.argv[zipArg + 1] : join(dir, 'feed.zip')
  if (zipArg === -1) {
    console.log(`Downloading ${FEED_URL}`)
    const res = await fetch(FEED_URL)
    if (!res.ok) throw new Error(`Feed download failed: ${res.status} ${res.statusText}`)
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()))
  }
  zip = zip.startsWith('/') ? zip : join(process.cwd(), zip)
  execFileSync('unzip', ['-o', '-q', zip, '-d', dir])

  const routes = readCsv(dir, 'routes.txt').filter((r) => !SKIP.has(r.route_short_name))
  const routeIds = new Set(routes.map((r) => r.route_id))
  const trips = readCsv(dir, 'trips.txt').filter((t) => routeIds.has(t.route_id))
  const stops = new Map(readCsv(dir, 'stops.txt').map((s) => [s.stop_id, s]))
  const calendar = readCsv(dir, 'calendar.txt')
  const exceptions = readCsv(dir, 'calendar_dates.txt')

  const today = new Date()
  const days: Record<DayKind, Set<string>> = {
    weekday: servicesOn(nextDow(today, 3), calendar, exceptions),
    saturday: servicesOn(nextDow(today, 6), calendar, exceptions),
    sunday: servicesOn(nextDow(today, 0), calendar, exceptions),
  }
  const KINDS = Object.keys(days) as DayKind[]
  const runsAny = (t: Row) => KINDS.some((k) => days[k].has(t.service_id))

  console.log('Reading stop_times…')
  const wanted = new Set(trips.filter(runsAny).map((t) => t.trip_id))
  const byTrip = new Map<string, Row[]>()
  await eachStopTime(dir, (st) => {
    if (!wanted.has(st.trip_id)) return
    const list = byTrip.get(st.trip_id) ?? []
    list.push(st)
    byTrip.set(st.trip_id, list)
  })
  for (const list of byTrip.values())
    list.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence))

  // The shared stop table: only stops some pattern uses, in first-seen order.
  const stopIndex = new Map<string, number>()
  const stopTable: [number, number, string, string][] = []
  const indexOf = (id: string) => {
    let k = stopIndex.get(id)
    if (k === undefined) {
      const s = stops.get(id)!
      k = stopTable.length
      const name = tidy(cleanStopName(s.stop_name))
      stopTable.push([
        r5(Number(s.stop_lat)),
        r5(Number(s.stop_lon)),
        /Station|Stat\./.test(name) ? stationName(name) : name,
        // The feed's stop id: the key into the live predictions.
        id,
      ])
      stopIndex.set(id, k)
    }
    return k
  }
  const at = (id: string): [number, number] => {
    const s = stops.get(id)!
    return [Number(s.stop_lat), Number(s.stop_lon)]
  }
  const start = (t: Row) => minutes(byTrip.get(t.trip_id)![0].departure_time)

  const out = routes
    .map((route) => {
      const short = route.route_short_name
      const kind = kindOf(short, route.route_type)
      const mine = trips.filter((t) => t.route_id === route.route_id && byTrip.get(t.trip_id)?.length)
      if (!mine.length) return null

      const patterns = ['0', '1'].flatMap((dirId) => {
        const dirTrips = mine.filter((t) => (t.direction_id || '0') === dirId)
        if (!dirTrips.length) return []
        const groups = new Map<string, Row[]>()
        for (const t of dirTrips) {
          const key = byTrip
            .get(t.trip_id)!
            .map((s) => s.stop_id)
            .join(' ')
          groups.set(key, [...(groups.get(key) ?? []), t])
        }
        const ranked = [...groups.entries()]
          .filter(([, ts]) => ts.length >= Math.max(2, dirTrips.length * MIN_SHARE))
          .sort((a, b) => b[0].split(' ').length - a[0].split(' ').length)
        // A short turn (its stops a stretch of a longer pattern's) adds nothing to plan with.
        const kept: [string, Row[]][] = []
        for (const [key, ts] of ranked) {
          if (kept.some(([k]) => ` ${k} `.includes(` ${key} `))) continue
          kept.push([key, ts])
        }
        if (!kept.length) {
          const [top] = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
          kept.push(top)
        }
        return kept.slice(0, 4).map(([, ts]) => {
          const rep = [...ts].sort((a, b) => Math.abs(start(a) - 720) - Math.abs(start(b) - 720))[0]
          const list = byTrip.get(rep.trip_id)!
          const t0 = minutes(list[0].departure_time)
          const first = list[0].stop_id
          const last = list[list.length - 1].stop_id
          // "Green Line Dadeland South" → "Dadeland South (Green Line)": where it goes first.
          const toward = cleanHeadsign(rep.trip_headsign).replace(/^(Green|Orange) Line (.+)$/, '$2 ($1 Line)')
          return {
            dir: dirId,
            // A trolley's head sign is often just its own name; its last stop says where it's going.
            toward: !toward || /\broute$/i.test(toward) || /trolley|loop/i.test(toward)
              ? tidy(cleanStopName(stops.get(last)!.stop_name))
              : toward,
            loop: first === last || meters(at(first), at(last)) <= LOOP_METERS,
            s: list.map((st) => indexOf(st.stop_id)),
            m: list.map((st) => Math.round(minutes(st.arrival_time || st.departure_time) - t0)),
          }
        })
      })

      // When it runs, and how often, per kind of day.
      const hours = {} as Record<DayKind, [number, number] | null>
      const headway = {} as Record<DayKind, number | null>
      for (const k of KINDS) {
        const ts = mine.filter((t) => days[k].has(t.service_id))
        if (!ts.length) {
          hours[k] = null
          headway[k] = null
          continue
        }
        const leaves = ts.map((t) => Math.round(start(t))).sort((a, b) => a - b)
        // Both ends of the day: a bus that leaves its first stop at 11:50 PM still runs past midnight.
        const ends = ts.map((t) => {
          const list = byTrip.get(t.trip_id)!
          return Math.round(minutes(list[list.length - 1].arrival_time || list[list.length - 1].departure_time))
        })
        hours[k] = [leaves[0], Math.max(...ends)]
        // How often, at the stop most of the day's trips pass.
        const count = new Map<string, number>()
        for (const t of ts) for (const st of byTrip.get(t.trip_id)!) count.set(st.stop_id, (count.get(st.stop_id) ?? 0) + 1)
        const busiest = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0]
        const passes = ts
          .map((t) => byTrip.get(t.trip_id)!.find((st) => st.stop_id === busiest))
          .filter((st): st is Row => !!st)
          .map((st) => minutes(st.departure_time))
          .sort((a, b) => a - b)
        headway[k] =
          headwayIn(passes, 10 * 60, 14 * 60) ??
          headwayIn(passes, 6 * 60 + 30, 9 * 60) ??
          headwayIn(passes, 15 * 60, 19 * 60) ??
          headwayIn(passes, 0, 48 * 60)
      }

      const used = new Set(mine.map((t) => t.service_id))
      const end = calendar
        .filter((c) => used.has(c.service_id))
        .map((c) => c.end_date)
        .sort()[0]

      return {
        slug: SLUGS[short] ?? short.toLowerCase(),
        short,
        // The feed's own id, which the live predictions carry (lib/countyLive.ts).
        routeId: route.route_id,
        // Only a Metrobus route is «Ruta N»: Metrorail's feed number (2600) isn't a rider's.
        number: kind === 'bus' ? short : null,
        kind,
        fare: fareOf(short, route.route_type),
        name: nameOf(short, route.route_long_name, kind),
        color: `#${route.route_color || '0c0f14'}`,
        serviceEnds: end ? iso(end) : null,
        hours,
        headway,
        patterns,
      }
    })
    .filter((r) => r !== null)

  const ends = out
    .map((r) => r.serviceEnds)
    .filter((d) => d !== null)
    .sort()
  const hash = feedHash(dir)
  const data = {
    source: {
      name: 'Miami-Dade Transit (GTFS)',
      url: FEED_URL,
      fetchedAt: new Date().toISOString(),
      serviceEnds: ends[0] ?? null,
      feedHash: hash,
    },
    stops: stopTable,
    routes: out,
  }
  const json = JSON.stringify(data)
  writeFileSync(OUT, json + '\n')
  writeFileSync(VERSION_OUT, JSON.stringify({ v: hash }) + '\n')
  const patterns = out.reduce((n, r) => n + r.patterns.length, 0)
  console.log(
    `Wrote ${OUT}: ${out.length} routes, ${patterns} patterns, ${stopTable.length} stops, ${(json.length / 1024).toFixed(0)} KB; schedule ends ${data.source.serviceEnds}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
