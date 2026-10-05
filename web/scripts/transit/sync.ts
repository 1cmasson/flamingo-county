/**
 * Rebuilds src/data/transit/hialeah.json from Miami-Dade Transit's GTFS feed.
 *
 *   pnpm transit:sync           # download the current feed and rewrite the JSON
 *   pnpm transit:sync --zip f   # use a zip already on disk
 *
 * Hialeah's two free circulators (Flamingo, Marlin) ship inside the county's
 * feed as routes HIAFLA and HIAMAR. The feed is 8 MB zipped and its
 * stop_times.txt is ~47 MB, so the site never reads it: this script reduces it
 * to the ~40 KB the pages actually need and the result is committed.
 *
 * Run it whenever the county republishes (every few months — the JSON records
 * the feed's last service date, and the pages stop quoting frequencies once it
 * has passed). Routes are matched by `route_short_name`, never by numeric
 * route_id, because the ids are reissued between feed versions.
 *
 * What is deliberately NOT extracted: per-stop departure times. The feed's
 * Hialeah block disagrees with the city's published hours (trips on Sundays,
 * service past 7:30 PM), so the pages quote the city's hours and only a
 * typical frequency from here. See src/lib/transit.ts.
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
/** How far one of our poles can be from ETA's pin for the same stop. */
const ETA_MATCH_METERS = 60

const ROUTES = [
  { shortName: 'HIAFLA', slug: 'flamingo', name: 'Flamingo' },
  { shortName: 'HIAMAR', slug: 'marlin', name: 'Marlin' },
] as const

/** Stops facing each other across a street are one station on the diagram. */
const PAIR_METERS = 60
/**
 * A return-direction stop further than this from every station is on a
 * stretch the outbound trip never drives (a one-way loop). Folding it into the
 * nearest station would pin a business to the wrong place on the strip — the
 * nearest one can be kilometres away — so it is left out instead.
 */
const FOLD_METERS = 300
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

  let lastService = ''
  const out = picked.map((r) => {
    const rTrips = ourTrips.filter((t) => t.route_id === r.routeId)
    for (const t of rTrips) {
      const c = calendar.find((x) => x.service_id === t.service_id)
      if (c && c.end_date > lastService) lastService = c.end_date
    }

    // The backbone is the most common weekday stop pattern in direction 0.
    const patterns = new Map<string, { ids: string[]; trips: string[] }>()
    for (const t of rTrips.filter((x) => x.direction_id === '0' && weekdaySvc.has(x.service_id))) {
      const ids = (byTrip.get(t.trip_id) ?? []).map((s) => s.stop_id)
      const key = ids.join('>')
      const p = patterns.get(key) ?? { ids, trips: [] }
      p.trips.push(t.trip_id)
      patterns.set(key, p)
    }
    const backbone = [...patterns.values()].sort((a, b) => b.trips.length - a.trips.length)[0]
    if (!backbone) throw new Error(`${r.shortName} has no weekday trips in direction 0`)

    // Ride minutes from the first stop, the median over every backbone trip.
    const offsets = backbone.ids.map((_, i) =>
      median(
        backbone.trips.map((tid) => {
          const list = byTrip.get(tid)!
          return minutes(list[i].arrival_time) - minutes(list[0].departure_time)
        }),
      )!,
    )

    const stations = backbone.ids.map((id, i) => {
      const s = stops.get(id)!
      return {
        id,
        name: cleanStopName(s.stop_name),
        min: Math.round(offsets[i]),
        points: [[Number(s.stop_lat), Number(s.stop_lon)]] as [number, number][],
        /** Each point's own pole name: the stop across the street isn't always the same corner. */
        names: [cleanStopName(s.stop_name)],
        transfers: [] as string[],
      }
    })

    // Fold the return direction's stops in. A stop across the street joins its
    // partner; a stop on a one-way stretch joins whichever station is nearest,
    // so a business next to it still finds the line.
    const returnIds = new Set<string>()
    for (const t of rTrips.filter((x) => x.direction_id === '1')) {
      for (const s of byTrip.get(t.trip_id) ?? []) returnIds.add(s.stop_id)
    }
    const seen = new Set(backbone.ids)
    let paired = 0
    let dropped = 0
    for (const id of returnIds) {
      if (seen.has(id)) continue
      const s = stops.get(id)
      if (!s) continue
      const at: [number, number] = [Number(s.stop_lat), Number(s.stop_lon)]
      let best = stations[0]
      let bestD = Infinity
      for (const st of stations) {
        const d = meters(at, st.points[0])
        if (d < bestD) {
          bestD = d
          best = st
        }
      }
      if (bestD > FOLD_METERS) {
        dropped++
        continue
      }
      if (bestD <= PAIR_METERS) paired++
      best.points.push(at)
      best.names.push(cleanStopName(s.stop_name))
    }

    // Each rail station is called out once, at the station on the line that
    // gets closest to it — not at the first one that happens to be in range.
    const rail = [
      ...[...railStations.values()].map((x) => ({ ...x, label: `Metrorail · ${x.name}` })),
      ...triRail.map((x) => ({ ...x, label: `Tri-Rail · ${x.name}` })),
    ]
    for (const r of rail) {
      let best: (typeof stations)[number] | null = null
      let bestD = TRANSFER_METERS
      for (const st of stations) {
        const d = Math.min(...st.points.map((p) => meters(p, r.at)))
        if (d <= bestD) {
          bestD = d
          best = st
        }
      }
      if (best && !best.transfers.includes(r.label)) best.transfers.push(r.label)
    }

    // Stops the county named after a place rather than a corner — "Palmetto
    // General Hospital", "Palm Ave & W 5 St (City Hall)". They are the only
    // landmarks on the diagram, so nothing on it is ours to have invented.
    for (const st of stations) {
      const paren = st.name.match(/\(([A-Za-z][A-Za-z ]{3,})\)$/)?.[1]
      const named = !/[&#\d]/.test(st.name) ? st.name : null
      const landmark = paren ?? named
      if (landmark && !/^(Approx|Connector|Okech)/i.test(landmark)) (st as { landmark?: string }).landmark = landmark
    }

    const departures = (svc: Set<string>) =>
      rTrips
        .filter((t) => t.direction_id === '0' && svc.has(t.service_id))
        .map((t) => minutes(byTrip.get(t.trip_id)![0].departure_time))
        .sort((a, b) => a - b)
    const headway = (deps: number[]) => {
      const gaps = deps.slice(1).map((d, i) => d - deps[i])
      const m = median(gaps)
      return m === null ? null : Math.round(m / 5) * 5
    }

    console.log(
      `${r.name}: ${stations.length} stations, ${returnIds.size} return stops (${paired} paired across the street, ${dropped} off the outbound path and left out), ` +
        `${stations.reduce((n, s) => n + s.transfers.length, 0)} transfers`,
    )
    return {
      slug: r.slug,
      name: r.name,
      gtfsShortName: r.shortName,
      headwayMin: { weekday: headway(departures(weekdaySvc)), saturday: headway(departures(saturdaySvc)) },
      rideMinutes: stations.at(-1)!.min,
      stations: stations.map((s) => ({
        ...s,
        points: s.points.map(([la, lo]) => [Number(la.toFixed(6)), Number(lo.toFixed(6))]),
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
  const allPts = out.flatMap((r) => r.stations.flatMap((st) => st.points)) as [number, number][]
  const near = (p: [number, number]) => allPts.some((q) => meters(p, q) < 3500)
  const rail = longest
    .sort((a, b) => a.seq - b.seq)
    .map((p) => p.at)
    .filter(near)
    .filter((_, i, arr) => i === 0 || i === arr.length - 1 || i % 3 === 0)
    .map(([la, lo]) => [Number(la.toFixed(5)), Number(lo.toFixed(5))])

  // --- ETA's schedule: link each of our poles to ETA's stop number ---------
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
  const etaSlug = new Map(
    etaRoutes.map((r) => [r.route_id, ROUTES.find((x) => x.name.toLowerCase() === r.route_long_name.trim().toLowerCase())?.slug]),
  )
  for (const r of ROUTES) {
    if (![...etaSlug.values()].includes(r.slug)) throw new Error(`ETA's schedule has no ${r.name} route — renamed?`)
  }
  const etaTimes = new Map<string, { seq: number; stop: string; secs: number }[]>()
  for (const row of readCsv(etaDir, 'stop_times.txt')) {
    const [h, m, sec] = row.arrival_time.split(':').map(Number)
    const list = etaTimes.get(row.trip_id) ?? []
    list.push({ seq: Number(row.stop_sequence), stop: row.stop_id, secs: h * 3600 + m * 60 + (sec || 0) })
    etaTimes.set(row.trip_id, list)
  }
  const routeStops = new Map<string, Set<string>>()
  const tripsOut: Record<string, { route: string; service: string; seq0: number; stops: number[]; secs: number[] }> = {}
  for (const t of etaTrips) {
    const slug = etaSlug.get(t.route_id)
    const times = (etaTimes.get(t.trip_id) ?? []).sort((a, b) => a.seq - b.seq)
    if (!slug || !times.length) continue
    const set = routeStops.get(slug) ?? new Set()
    times.forEach((x) => set.add(x.stop))
    routeStops.set(slug, set)
    tripsOut[t.trip_id] = {
      route: slug,
      service: t.service_id,
      seq0: times[0].seq,
      stops: times.map((x) => Number(x.stop)),
      secs: times.map((x) => x.secs),
    }
  }
  let linked = 0
  let unlinked = 0
  for (const r of out) {
    const candidates = [...(routeStops.get(r.slug) ?? [])].map((id) => {
      const x = etaStops.get(id)!
      return { id, at: [Number(x.stop_lat), Number(x.stop_lon)] as [number, number] }
    })
    for (const st of r.stations as unknown as { points: [number, number][]; eta?: (number | null)[] }[]) {
      st.eta = st.points.map((p) => {
        let best: string | null = null
        let bestD = ETA_MATCH_METERS
        for (const c of candidates) {
          const d = meters(p, c.at)
          if (d <= bestD) {
            bestD = d
            best = c.id
          }
        }
        if (best) linked++
        else unlinked++
        return best ? Number(best) : null
      })
    }
  }
  console.log(`ETA: ${Object.keys(tripsOut).length} trips; ${linked} of our poles linked to ETA stops, ${unlinked} not`)
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
      name: 'Miami-Dade Transit GTFS',
      url: FEED_URL,
      fetchedAt: new Date().toISOString().slice(0, 10),
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
