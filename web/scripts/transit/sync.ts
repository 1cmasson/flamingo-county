/**
 * Rebuilds src/data/transit/hialeah.json and hialeah-eta.json.
 *
 *   pnpm transit:sync                 # download both feeds and rewrite the JSON
 *   pnpm transit:sync --zip f         # county feed from disk
 *   pnpm transit:sync --eta-zip f     # city (ETA) feed from disk
 *
 * Two feeds, each for what it's right about:
 *
 * - **The lines themselves** — their stops, the order, the ride minutes and
 *   the street path the bus drives — come from the City of Hialeah's own
 *   schedule, published by ETA Transit Systems beside the live feeds the
 *   tracker uses. Those are the routes the buses actually drive (the county's
 *   copy misses the Flamingo's run up NW 97th Ave to Aquabella and the
 *   Marlin's Red Rd leg), and the live buses speak in its stop numbers.
 *
 * - **How often buses come, and Metrorail** still come from Miami-Dade
 *   Transit's GTFS (routes HIAFLA / HIAMAR, matched by short name). The
 *   city's calendar says its schedule ended on 2026-09-11 while the buses run
 *   on regardless; the county's dates are the ones kept current, and the
 *   pages stop quoting a frequency once `serviceEnds` passes.
 *
 * Hours are neither feed's: the pages quote the City of Hialeah's published
 * hours. See src/lib/transit.ts.
 */
import { execFileSync } from 'node:child_process'
import { createReadStream, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const FEED_URL = 'https://www.miamidade.gov/transit/googletransit/current/google_transit.zip'
const OUT = join(import.meta.dirname, '../../src/data/transit/hialeah.json')
const ETA_OUT = join(import.meta.dirname, '../../src/data/transit/hialeah-eta.json')

/**
 * Hialeah's own schedule, from ETA Transit Systems — the vendor behind the
 * city's ETA SPOT tracker. Its live feeds (position_updates.pb,
 * trip_updates.pb) speak in this file's trip and stop numbers, so the live
 * layer (src/lib/live.ts) needs it to turn "trip 106 is 11 min late" into
 * "the next Marlin at your stop is in 7 min". Linked from nowhere public:
 * it sits beside the live feeds in ETA's bucket.
 */
const ETA_BASE = 'https://s3.amazonaws.com/etatransit.gtfs/hialeahtransit.etaspot.net'

const ROUTES = [
  { shortName: 'HIAFLA', slug: 'flamingo', name: 'Flamingo' },
  { shortName: 'HIAMAR', slug: 'marlin', name: 'Marlin' },
] as const

/**
 * Two poles this close, one each way, are one station on the strip: the stop
 * and its partner across (or around the corner of) the street. Further apart,
 * each direction's stop is its own station, served one way only.
 */
const PAIR_METERS = 150
/** How many stations ahead a partner may be found — keeps pairing in order. */
const PAIR_WINDOW = 12
/** A simplified street path keeps within this of the real one. */
const PATH_TOLERANCE_METERS = 12
/** How far a rail station can be from a stop and still count as a transfer. */
const TRANSFER_METERS = 400

type Row = Record<string, string>

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

function readCsv(dir: string, file: string): Row[] {
  const lines = readFileSync(join(dir, file), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
  const head = parseCsvLine(lines[0]).map((h) => h.trim())
  return lines.slice(1).map((l) => {
    const cells = parseCsvLine(l)
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()]))
  })
}

/** stop_times.txt is too big to hold whole; stream it and keep only our trips. */
async function readStopTimes(dir: string, tripIds: Set<string>): Promise<Row[]> {
  const rl = createInterface({ input: createReadStream(join(dir, 'stop_times.txt')) })
  let head: string[] | null = null
  const out: Row[] = []
  for await (const line of rl) {
    if (!line) continue
    if (!head) {
      head = parseCsvLine(line.replace(/^﻿/, '')).map((h) => h.trim())
      continue
    }
    const cells = parseCsvLine(line)
    if (!tripIds.has(cells[head.indexOf('trip_id')]?.trim())) continue
    out.push(Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()])))
  }
  return out
}

function meters(a: [number, number], b: [number, number]): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const minutes = (hms: string) => {
  const [h, m, s] = hms.split(':').map(Number)
  return h * 60 + m + (s || 0) / 60
}

const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * "W 29 ST@W 4 AV" → "W 29 St & W 4 Ave". Readability only — stop names stay
 * in the county's English in both languages, since they are what is printed on
 * the pole.
 */
function cleanStopName(raw: string): string {
  const KEEP = new Set(['NW', 'NE', 'SW', 'SE', 'N', 'S', 'E', 'W'])
  const WORDS: Record<string, string> = { OPP: 'opp.', ST: 'St', AV: 'Ave', AVE: 'Ave', DR: 'Dr', RD: 'Rd', BLVD: 'Blvd', CT: 'Ct', PL: 'Pl', TER: 'Ter', TERR: 'Ter', HWY: 'Hwy', PKWY: 'Pkwy' }
  const word = (w: string): string => {
    if (KEEP.has(w)) return w
    if (WORDS[w]) return WORDS[w]
    // "8TH" → "8th", but "37AV" → "37 Ave".
    const num = w.match(/^(\d+)([A-Z]+)$/)
    if (num) return /^(ST|ND|RD|TH)$/.test(num[2]) ? num[1] + num[2].toLowerCase() : `${num[1]} ${word(num[2])}`
    return w.charAt(0) + w.slice(1).toLowerCase()
  }
  return raw
    .toUpperCase()
    // "OP#" and its typo "0 P #" mean "opposite": the stop across from that address.
    .replace(/\b(?:OP|0 ?P)\s*#\s*(\d+)/g, 'OPP #$1')
    .replace(/\s*@\s*#\s*(\d+)/g, ' (#$1)')
    .replace(/\s*@\s*/g, ' & ')
    .replace(/\(/g, ' (')
    .replace(/\s+/g, ' ')
    .trim()
    // Word by word, so punctuation like "(CONNECTOR" or "42/37AV" keeps its shape.
    .replace(/[A-Z0-9]+/g, word)
    .replace(/'S\b/g, "'s")
    .replace(/ And /g, ' and ')
}

/**
 * The city's stop names, tidied for print: "W 29th St & W 9th Ave (EB) -
 * Walker Park" → "W 29th St & W 9th Ave - Walker Park". The direction tag goes
 * (the strip and the arrows say which way); the place it's by stays, because
 * that's how people find a stop. A stop named only for a place ("Walgreens",
 * "Palmetto General Hospital") is a landmark on the strip.
 */
function cityStopName(raw: string): { name: string; landmark?: string } {
  let n = raw
    .replace(/\s+/g, ' ')
    .replace(/\((?:NB|SB|EB|WB)\s*-\s*([^)]+)\)/g, '- $1')
    .replace(/\s*\((?:NB|SB|EB|WB|S\/F)\)/g, '')
    .replace(/\bAv\b/g, 'Ave')
    .replace(/\bST\b/g, 'St')
    .replace(/\bLN\b/g, 'Ln')
    .replace(/\s+-\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()
  n = n.replace(/\s*-\s*$/, '')
  const street = /\b(St|Ave|Rd|Dr|Pl|Ct|Ln|Blvd|Ter|Hwy|Connector)\b|&/
  if (!street.test(n)) return { name: n, landmark: n }
  // "ABC - E 65th St & …", "Fire Station 1 - E 5th St & …": the place first.
  const [head, ...rest] = n.split(' - ')
  if (rest.length && !street.test(head)) return { name: rest.join(' - '), landmark: head }
  return { name: n }
}

/** Douglas–Peucker on lat/lng, metres. Keeps the path's shape, sheds its points. */
function simplify(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 3) return pts
  const k = Math.cos((pts[0][0] * Math.PI) / 180)
  const xy = pts.map(([la, lo]) => [lo * k * 111320, la * 110540])
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = xy[a]
    const [bx, by] = xy[b]
    const len = Math.hypot(bx - ax, by - ay) || 1
    let far = -1
    let farD = tol
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - xy[i][1]) - (ax - xy[i][0]) * (by - ay)) / len
      if (d > farD) {
        farD = d
        far = i
      }
    }
    if (far > -1) {
      keep[far] = 1
      stack.push([a, far], [far, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

type CityStation = {
  id: string
  name: string
  min: number
  points: [number, number][]
  names: string[]
  eta: (number | null)[]
  transfers: string[]
  landmark?: string
  /** Which way(s) buses stop here, as strip directions. */
  ways: Set<'start' | 'end'>
}

/**
 * One line, from the city's schedule. Its main pattern is a loop: out from
 * downtown to the far end and back. The far end is where the loop turns; the
 * leg back from it becomes the strip, in travel order (so strip order is the
 * "toward the end" direction), and the leg out is threaded into it in reverse:
 * a stop with a partner pole nearby joins that station, one without becomes a
 * station of its own, served one way only, in the place it falls along the
 * line. Ride minutes are the leg back's, interpolated for the one-way stops.
 */
function cityLine(
  slug: string,
  etaTrips: Row[],
  etaTimes: Map<string, { seq: number; stop: string; secs: number }[]>,
  etaStops: Map<string, Row>,
  routeId: string,
) {
  const at = (id: string): [number, number] => {
    const x = etaStops.get(id)!
    return [Number(x.stop_lat), Number(x.stop_lon)]
  }
  const trips = etaTrips.filter((t) => t.route_id === routeId)
  const loops = new Map<string, { ids: string[]; secs: number[]; trips: Row[] }>()
  for (const t of trips) {
    const times = (etaTimes.get(t.trip_id) ?? []).slice().sort((a, b) => a.seq - b.seq)
    if (times.length < 10 || times[0].stop !== times.at(-1)!.stop) continue
    const key = times.map((x) => x.stop).join('>')
    const p = loops.get(key) ?? { ids: times.map((x) => x.stop), secs: times.map((x) => x.secs), trips: [] }
    p.trips.push(t)
    loops.set(key, p)
  }
  const master = [...loops.values()].sort((a, b) => b.trips.length - a.trips.length)[0]
  if (!master) throw new Error(`${slug}: no loop trips in the city's schedule`)

  const home = at(master.ids[0])
  let turn = 0
  master.ids.forEach((id, i) => {
    if (meters(home, at(id)) > meters(home, at(master.ids[turn]))) turn = i
  })
  const back = master.ids.slice(turn).map((id, i) => ({ id, secs: master.secs[turn + i] }))
  const out = master.ids.slice(0, turn + 1).reverse()

  const stations: CityStation[] = back.map(({ id, secs }) => {
    const { name, landmark } = cityStopName(etaStops.get(id)!.stop_name)
    return {
      id,
      name,
      min: (secs - back[0].secs) / 60,
      points: [at(id)],
      names: [name],
      eta: [Number(id)],
      transfers: [],
      ...(landmark ? { landmark } : {}),
      ways: new Set(['end']),
    }
  })
  // The far end and downtown are both ends of both directions.
  stations[0].ways.add('start')
  stations.at(-1)!.ways.add('start')

  const inserts = new Map<number, CityStation[]>()
  let j = 0
  let paired = 0
  for (const id of out) {
    const here = stations.findIndex((s) => s.eta.includes(Number(id)))
    if (here > -1) {
      stations[here].ways.add('start')
      j = Math.max(j, here)
      continue
    }
    let best = -1
    let bestD = PAIR_METERS
    for (let k = j; k < Math.min(stations.length, j + PAIR_WINDOW); k++) {
      const d = meters(at(id), stations[k].points[0])
      if (d <= bestD) {
        bestD = d
        best = k
      }
    }
    const { name, landmark } = cityStopName(etaStops.get(id)!.stop_name)
    if (best > -1) {
      const st = stations[best]
      st.points.push(at(id))
      st.names.push(name)
      st.eta.push(Number(id))
      st.ways.add('start')
      if (!st.landmark && landmark) st.landmark = landmark
      j = best
      paired++
      continue
    }
    const list = inserts.get(j) ?? []
    list.push({ id, name, min: 0, points: [at(id)], names: [name], eta: [Number(id)], transfers: [], ...(landmark ? { landmark } : {}), ways: new Set(['start']) })
    inserts.set(j, list)
  }

  const line: CityStation[] = []
  stations.forEach((st, i) => {
    line.push(st)
    const extra = inserts.get(i) ?? []
    const next = stations[i + 1]?.min ?? st.min
    extra.forEach((x, k) => {
      x.min = st.min + ((k + 1) / (extra.length + 1)) * (next - st.min)
      line.push(x)
    })
  })

  // Stops only the other patterns use (first trip of the day, the last one):
  // beside a station, they join it; anywhere else they're logged and left out.
  const placed = new Set(line.flatMap((s) => s.eta))
  const extra = new Set(trips.flatMap((t) => (etaTimes.get(t.trip_id) ?? []).map((x) => x.stop)).filter((id) => !placed.has(Number(id))))
  let joined = 0
  const left: string[] = []
  for (const id of extra) {
    let best: CityStation | null = null
    let bestD = PAIR_METERS
    for (const st of line) {
      const d = Math.min(...st.points.map((p) => meters(p, at(id))))
      if (d <= bestD) {
        bestD = d
        best = st
      }
    }
    if (!best) {
      left.push(etaStops.get(id)!.stop_name)
      continue
    }
    best.points.push(at(id))
    best.names.push(cityStopName(etaStops.get(id)!.stop_name).name)
    best.eta.push(Number(id))
    joined++
  }

  const oneWay = line.filter((s) => s.ways.size === 1).length
  console.log(
    `${slug}: ${line.length} stations from the city's ${master.trips.length}-trip loop (turns at ${etaStops.get(master.ids[turn])!.stop_name}); ` +
      `${paired} paired across the street, ${oneWay} one-way; ${joined} stops from other patterns joined, ${left.length} left out${left.length ? `: ${left.join('; ')}` : ''}`,
  )
  const shapeId = master.trips[0].shape_id
  return { stations: line, rideMinutes: Math.round(line.at(-1)!.min), shapeId }
}

async function main() {
  const zipArg = process.argv.indexOf('--zip')
  const dir = mkdtempSync(join(tmpdir(), 'mdt-gtfs-'))
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

  const weekdaySvc = new Set(calendar.filter((c) => c.monday === '1' && c.friday === '1').map((c) => c.service_id))
  const saturdaySvc = new Set(
    calendar.filter((c) => c.saturday === '1' && c.monday === '0').map((c) => c.service_id),
  )

  const picked = ROUTES.map((r) => {
    const row = routes.find((x) => x.route_short_name === r.shortName)
    if (!row) throw new Error(`Route ${r.shortName} is not in this feed — did the county rename it?`)
    return { ...r, routeId: row.route_id }
  })

  // Metrorail stations, for transfer callouts. Found by route_type 1/2 rather
  // than by name so a renamed station still turns up.
  const railRouteIds = new Set(routes.filter((r) => r.route_type === '1' || r.route_type === '2').map((r) => r.route_id))
  const railTripIds = new Set(trips.filter((t) => railRouteIds.has(t.route_id)).map((t) => t.trip_id))

  const ourTrips = trips.filter((t) => picked.some((p) => p.routeId === t.route_id))
  const wanted = new Set([...ourTrips.map((t) => t.trip_id), ...railTripIds])
  console.log(`Reading stop_times for ${ourTrips.length} circulator trips…`)
  const stopTimes = await readStopTimes(dir, wanted)
  const byTrip = new Map<string, Row[]>()
  for (const st of stopTimes) {
    const list = byTrip.get(st.trip_id) ?? []
    list.push(st)
    byTrip.set(st.trip_id, list)
  }
  for (const list of byTrip.values()) list.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence))

  const railStations = new Map<string, { name: string; at: [number, number] }>()
  for (const tid of railTripIds) {
    for (const st of byTrip.get(tid) ?? []) {
      const s = stops.get(st.stop_id)
      if (!s) continue
      // "HIALEAH STATION RAIL SOUTHBOUND" → "Hialeah"
      const name = cleanStopName(s.stop_name.replace(/\s*STATION.*$/i, '').replace(/\s*METRORAIL.*$/i, ''))
      railStations.set(name, { name, at: [Number(s.stop_lat), Number(s.stop_lon)] })
    }
  }
  // Tri-Rail is not in the county feed, but its stations are, as bus stops.
  const triRail = [...stops.values()]
    .filter((s) => /TRI-?RAIL STATION/i.test(s.stop_name))
    .map((s) => ({
      name: cleanStopName(s.stop_name.replace(/\s*TRI-?RAIL STATION.*$/i, '')),
      at: [Number(s.stop_lat), Number(s.stop_lon)] as [number, number],
    }))

  // --- The county: how often each line comes, and its service dates -------
  let lastService = ''
  const county = new Map(
    picked.map((r) => {
      const rTrips = ourTrips.filter((t) => t.route_id === r.routeId)
      for (const t of rTrips) {
        const c = calendar.find((x) => x.service_id === t.service_id)
        if (c && c.end_date > lastService) lastService = c.end_date
      }
      const departures = (svc: Set<string>) =>
        rTrips
          .filter((t) => t.direction_id === '0' && svc.has(t.service_id))
          .map((t) => minutes(byTrip.get(t.trip_id)![0].departure_time))
          .sort((x, y) => x - y)
      const headway = (deps: number[]) => {
        const gaps = deps.slice(1).map((d, i) => d - deps[i])
        const m = median(gaps)
        return m === null ? null : Math.round(m / 5) * 5
      }
      return [r.slug, { weekday: headway(departures(weekdaySvc)), saturday: headway(departures(saturdaySvc)) }]
    }),
  )

  // --- The city: the lines as the buses drive them ------------------------
  const etaDir = mkdtempSync(join(tmpdir(), 'eta-gtfs-'))
  const etaZip = join(etaDir, 'eta.zip')
  const etaArg = process.argv.indexOf('--eta-zip')
  if (etaArg > -1) execFileSync('cp', [process.argv[etaArg + 1], etaZip])
  else {
    console.log(`Downloading ${ETA_BASE}/gtfs.zip`)
    const res = await fetch(`${ETA_BASE}/gtfs.zip`)
    if (!res.ok) throw new Error(`ETA schedule download failed: ${res.status}`)
    writeFileSync(etaZip, Buffer.from(await res.arrayBuffer()))
  }
  execFileSync('unzip', ['-o', '-q', etaZip, '-d', etaDir])
  const etaRoutes = readCsv(etaDir, 'routes.txt')
  const etaTrips = readCsv(etaDir, 'trips.txt')
  const etaStops = new Map(readCsv(etaDir, 'stops.txt').map((x) => [x.stop_id, x]))
  const etaCal = readCsv(etaDir, 'calendar.txt')
  const etaRouteId = new Map(
    ROUTES.map((r) => [r.slug, etaRoutes.find((x) => x.route_long_name.trim().toLowerCase() === r.name.toLowerCase())?.route_id]),
  )
  for (const r of ROUTES) if (!etaRouteId.get(r.slug)) throw new Error(`ETA's schedule has no ${r.name} route — renamed?`)
  const etaSlug = new Map([...etaRouteId].map(([slug, id]) => [id!, slug]))
  const etaTimes = new Map<string, { seq: number; stop: string; secs: number }[]>()
  for (const row of readCsv(etaDir, 'stop_times.txt')) {
    const [h, m, sec] = row.arrival_time.split(':').map(Number)
    const list = etaTimes.get(row.trip_id) ?? []
    list.push({ seq: Number(row.stop_sequence), stop: row.stop_id, secs: h * 3600 + m * 60 + (sec || 0) })
    etaTimes.set(row.trip_id, list)
  }
  const shapes = new Map<string, { seq: number; at: [number, number] }[]>()
  for (const row of readCsv(etaDir, 'shapes.txt')) {
    const list = shapes.get(row.shape_id) ?? []
    list.push({ seq: Number(row.shape_pt_sequence), at: [Number(row.shape_pt_lat), Number(row.shape_pt_lon)] })
    shapes.set(row.shape_id, list)
  }

  const out = ROUTES.map((r) => {
    const { stations, rideMinutes, shapeId } = cityLine(r.slug, etaTrips, etaTimes, etaStops, etaRouteId.get(r.slug)!)
    const shape = (shapes.get(shapeId) ?? []).sort((x, y) => x.seq - y.seq).map((p) => p.at)
    if (shape.length < 2) throw new Error(`${r.name}: the city's schedule has no path for shape ${shapeId}`)
    const path = simplify(shape, PATH_TOLERANCE_METERS)

    // Each rail station is called out once, at the station on the line that
    // gets closest to it — not at the first one that happens to be in range.
    const rail = [
      ...[...railStations.values()].map((x) => ({ ...x, label: `Metrorail · ${x.name}` })),
      ...triRail.map((x) => ({ ...x, label: `Tri-Rail · ${x.name}` })),
    ]
    for (const x of rail) {
      let best: CityStation | null = null
      let bestD = TRANSFER_METERS
      for (const st of stations) {
        const d = Math.min(...st.points.map((p) => meters(p, x.at)))
        if (d <= bestD) {
          bestD = d
          best = st
        }
      }
      if (best && !best.transfers.includes(x.label)) best.transfers.push(x.label)
    }

    const round = ([la, lo]: [number, number]) => [Number(la.toFixed(6)), Number(lo.toFixed(6))]
    console.log(`${r.name}: path ${shape.length} → ${path.length} points, ${stations.reduce((n, s) => n + s.transfers.length, 0)} transfers`)
    return {
      slug: r.slug,
      name: r.name,
      gtfsShortName: r.shortName,
      headwayMin: county.get(r.slug)!,
      rideMinutes,
      path: path.map(([la, lo]) => [Number(la.toFixed(5)), Number(lo.toFixed(5))]),
      stations: stations.map(({ ways, min, points, ...st }) => ({
        ...st,
        min: Math.round(min),
        points: points.map(round),
        ...(ways.size === 1 ? { oneWay: [...ways][0] } : {}),
      })),
    }
  })

  // The Metrorail track through Hialeah, for the map: the longest rail shape,
  // cut to the stretch near the two lines. Context, not a route we describe.
  const railShapes = new Set(trips.filter((t) => railRouteIds.has(t.route_id)).map((t) => t.shape_id))
  const shapePts = new Map<string, { seq: number; at: [number, number] }[]>()
  for (const row of readCsv(dir, 'shapes.txt')) {
    if (!railShapes.has(row.shape_id)) continue
    const list = shapePts.get(row.shape_id) ?? []
    list.push({ seq: Number(row.shape_pt_sequence), at: [Number(row.shape_pt_lat), Number(row.shape_pt_lon)] })
    shapePts.set(row.shape_id, list)
  }
  const longest = [...shapePts.values()].sort((a, b) => b.length - a.length)[0] ?? []
  const allPts = out.flatMap((r) => r.path) as [number, number][]
  const near = (p: [number, number]) => allPts.some((q) => meters(p, q) < 3500)
  const rail = longest
    .sort((a, b) => a.seq - b.seq)
    .map((p) => p.at)
    .filter(near)
    .filter((_, i, arr) => i === 0 || i === arr.length - 1 || i % 3 === 0)
    .map(([la, lo]) => [Number(la.toFixed(5)), Number(lo.toFixed(5))])

  // --- The city's timetable, for the live layer (src/lib/live.ts) ---------
  const tripsOut: Record<string, { route: string; service: string; seq0: number; stops: number[]; secs: number[] }> = {}
  for (const t of etaTrips) {
    const slug = etaSlug.get(t.route_id)
    const times = (etaTimes.get(t.trip_id) ?? []).slice().sort((a, b) => a.seq - b.seq)
    if (!slug || !times.length) continue
    tripsOut[t.trip_id] = {
      route: slug,
      service: t.service_id,
      seq0: times[0].seq,
      stops: times.map((x) => Number(x.stop)),
      secs: times.map((x) => x.secs),
    }
  }
  console.log(`ETA: ${Object.keys(tripsOut).length} trips`)
  const days = (flag: (c: Record<string, string>) => boolean) => etaCal.filter(flag).map((c) => c.service_id)
  writeFileSync(
    ETA_OUT,
    JSON.stringify({
      source: { name: 'ETA Transit Systems (Hialeah Transit System)', url: ETA_BASE, fetchedAt: new Date().toISOString().slice(0, 10) },
      services: {
        weekday: days((c) => c.monday === '1' && c.friday === '1'),
        saturday: days((c) => c.saturday === '1' && c.monday === '0'),
      },
      stops: Object.fromEntries([...etaStops.values()].map((x) => [x.stop_id, x.stop_name])),
      trips: tripsOut,
    }) + '\n',
  )

  const data = {
    rail,
    source: {
      name: 'City of Hialeah (ETA SPOT) · Miami-Dade Transit GTFS',
      url: ETA_BASE,
      fetchedAt: new Date().toISOString().slice(0, 10),
      // The county's: the city's calendar has already "ended" while its buses run.
      serviceEnds: `${lastService.slice(0, 4)}-${lastService.slice(4, 6)}-${lastService.slice(6, 8)}`,
    },
    routes: out,
  }
  writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n')
  console.log(`Wrote ${OUT}`)
}

main().catch((e) => {
  console.error(String(e.message ?? e))
  process.exit(1)
})
