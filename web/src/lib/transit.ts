import type { Lang } from '../i18n'
import { SITE_TZ, todayISO } from './dates'
import data from '../data/transit/hialeah.json'

/**
 * Hialeah's free circulators, Flamingo and Marlin.
 *
 * Two sources, and which one answers which question is the whole design:
 *
 * - **Where the line goes** — stops, their order, minutes between them, the
 *   Metrorail transfer — comes from Miami-Dade Transit's GTFS feed, reduced by
 *   `pnpm transit:sync` into `src/data/transit/hialeah.json`.
 *
 * - **When it runs** comes from the City of Hialeah (hialeahfl.gov/269/Transit
 *   and its 2023 brochure), NOT the feed. The feed's Hialeah block runs Marlin
 *   on Sundays and keeps both lines going until 8:45 PM; the city says no
 *   Sunday service and 7:30 PM. Same rule as listing hours on the business
 *   page: a schedule we know is contested doesn't get printed. So the pages
 *   quote the city's hours and a typical frequency, never a departure time.
 */

export type LatLng = [number, number]

export type Station = {
  id: string
  name: string
  /** Ride minutes from the first stop of the line. */
  min: number
  /** Every physical stop this station stands for — both sides of the street. */
  points: LatLng[]
  /** The pole name of each of those points, in the same order. */
  names: string[]
  /** ETA's stop number for each point, where one is within 60 m — the key into the live feed. */
  eta: (number | null)[]
  transfers: string[]
  landmark?: string
}

export type TransitRoute = {
  slug: 'flamingo' | 'marlin'
  name: string
  gtfsShortName: string
  headwayMin: { weekday: number | null; saturday: number | null }
  rideMinutes: number
  stations: Station[]
}

export const TRANSIT = data as {
  source: { name: string; url: string; fetchedAt: string; serviceEnds: string }
  routes: TransitRoute[]
  /** Metrorail's track near the two lines, for the map. */
  rail: LatLng[]
}

export const ROUTE_SLUGS = TRANSIT.routes.map((r) => r.slug)

export function getRoute(slug: string): TransitRoute | null {
  return TRANSIT.routes.find((r) => r.slug === slug) ?? null
}

/** Brochure colors: Flamingo is the pink line, Marlin the blue one. */
export const ROUTE_STYLE: Record<TransitRoute['slug'], { color: string; grad: string; ink: string }> = {
  flamingo: { color: 'var(--pink)', grad: 'var(--grad-pink)', ink: 'var(--cream)' },
  marlin: { color: 'var(--cyan)', grad: 'var(--grad-cyan)', ink: 'var(--ink)' },
}

export const LINKS = {
  cityTransit: 'https://www.hialeahfl.gov/269/Transit',
  etaSpotIos: 'https://apps.apple.com/us/app/eta-spot/id1021211544',
  etaSpotAndroid: 'https://play.google.com/store/apps/details?id=com.etatransit.spot',
  freebeeIos: 'https://apps.apple.com/us/app/ride-freebee/id1014088236',
  freebeeAndroid: 'https://play.google.com/store/apps/details?id=com.ravn.freebee',
  miamiTrolley: 'https://www.miami.gov/Transportation-Roadways/Trolley-Information/Get-Trolley-Information-Schedules-and-Maps',
  miamiTrolleyLive:
    'https://publictransportation.tsomobile.com/webtracker/webtracker.htm?labels=false&tkn=81E39EC9-D773-447E-BE29-D7F30AB177BC&lan=en',
  metromover: 'https://www.miamidade.gov/global/transportation/metromover.page',
  lakesTransit: 'https://www.miamilakes-fl.gov/departments/transportation/',
} as const

/** Hialeah Transit's phone, from the city's transit page. */
export const CITY_TRANSIT_PHONE = '305-681-5757'
/** Freebee's booking line, as the Town of Miami Lakes publishes it. */
export const FREEBEE_PHONE = '(855) 918-3733'

/**
 * The city's posted hours, as minutes after midnight in Miami. Holidays run the
 * Saturday schedule, but a holiday can't be detected from a date alone, so the
 * pages print that line rather than guessing.
 */
export const CITY_HOURS = {
  weekday: { opens: 6 * 60, closes: 19 * 60 + 30 },
  saturday: { opens: 9 * 60, closes: 15 * 60 + 30 },
} as const

/** Day of week (0 = Sunday) and minutes past midnight, on Miami's clock. */
export function miamiClock(now: Date = new Date()): { dow: number; min: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SITE_TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  // `hour` can come back as 24 at midnight under hour12:false.
  return { dow, min: (Number(get('hour')) % 24) * 60 + Number(get('minute')) }
}

const hoursFor = (dow: number) => (dow === 0 ? null : dow === 6 ? CITY_HOURS.saturday : CITY_HOURS.weekday)

export type ServiceStatus =
  | { state: 'running'; closes: number }
  | { state: 'later'; opens: number; day: 'today' | 'tomorrow' | 'monday' }

/** Is the bus out right now, and if not, when does it come back? */
export function serviceStatus(now: Date = new Date()): ServiceStatus {
  const { dow, min } = miamiClock(now)
  const today = hoursFor(dow)
  if (today && min >= today.opens && min < today.closes) return { state: 'running', closes: today.closes }
  if (today && min < today.opens) return { state: 'later', opens: today.opens, day: 'today' }
  // After closing, or Sunday: the next service day. Saturday night and all of
  // Sunday wait for Monday, which a visitor reads more easily than "tomorrow"
  // on a Saturday.
  const next = (dow + 1) % 7
  if (next === 0 || dow === 0) return { state: 'later', opens: CITY_HOURS.weekday.opens, day: dow === 0 ? 'tomorrow' : 'monday' }
  return { state: 'later', opens: hoursFor(next)!.opens, day: 'tomorrow' }
}

/** Typical minutes between buses today, or null when there's no honest answer. */
export function headwayToday(route: TransitRoute, now: Date = new Date()): number | null {
  // Once the feed's last service date passes, its frequencies are history.
  if (todayISO(now) > TRANSIT.source.serviceEnds) return null
  const { dow } = miamiClock(now)
  return dow === 0 ? null : dow === 6 ? route.headwayMin.saturday : route.headwayMin.weekday
}

/** "7:30 PM" / "7:30 p. m." — the way each language writes a clock time. */
export function formatClock(min: number, lang: Lang): string {
  const h24 = Math.floor(min / 60)
  const m = min % 60
  const h = h24 % 12 || 12
  const mm = m ? `:${String(m).padStart(2, '0')}` : ''
  if (lang === 'es') return `${h}${mm} ${h24 < 12 ? 'a. m.' : 'p. m.'}`
  return `${h}${mm} ${h24 < 12 ? 'AM' : 'PM'}`
}

/** Frequencies over an hour read better as hours: "every 2 hours". */
export function formatHeadway(min: number, lang: Lang): string {
  if (min >= 90) {
    const hrs = Math.round(min / 30) / 2
    const n = Number.isInteger(hrs) ? String(hrs) : hrs.toFixed(1)
    return lang === 'es' ? `cada ~${n} horas` : `every ~${n} hours`
  }
  return lang === 'es' ? `cada ~${min} min` : `every ~${min} min`
}

export function meters(a: LatLng, b: LatLng): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Straight-line distance understates a walk on a street grid by roughly a
 * third; 80 m a minute is an unhurried pace. Rounded up, never below one.
 */
export function walkMinutes(m: number): number {
  return Math.max(1, Math.ceil((m * 1.3) / 80))
}

/** About a ten-minute walk. Further than that, the bus isn't the answer. */
export const MAX_WALK_METERS = 600

/** The station's ETA stop numbers, both sides of the street, deduplicated. */
export function etaIdsFor(station: Station): number[] {
  return [...new Set((station.eta ?? []).filter((x): x is number => x !== null))]
}

export type NearestStop = {
  route: TransitRoute
  /** Where on the strip: the station this stop is drawn as. */
  index: number
  station: Station
  /** The physical stop actually nearest — what the walk time is measured to. */
  stopName: string
  /** Every ETA stop this station stands for, for asking the live feed when the next bus comes. */
  etaIds: number[]
  meters: number
}

/** Closest station on each line within walking distance, nearest line first. */
export function nearestStops(at: LatLng, maxMeters: number = MAX_WALK_METERS): NearestStop[] {
  const out: NearestStop[] = []
  for (const route of TRANSIT.routes) {
    let best: NearestStop | null = null
    route.stations.forEach((station, index) => {
      station.points.forEach((p, k) => {
        const d = meters(at, p)
        if (d <= maxMeters && (!best || d < best.meters)) {
          best = { route, index, station, stopName: station.names[k] ?? station.name, etaIds: etaIdsFor(station), meters: d }
        }
      })
    })
    if (best) out.push(best)
  }
  return out.sort((a, b) => a.meters - b.meters)
}

export type DiagramItem =
  | { kind: 'stop'; index: number; station: Station; major: boolean }
  | { kind: 'gap'; stations: { index: number; station: Station }[]; minutes: number }

/**
 * The line drawn as a subway strip: the stops worth reading stay visible, and
 * the runs of plain corners between them fold into "+9 stops · 8 min".
 *
 * Worth reading: both ends, the transfer, the stops the county named after a
 * place, and any stop the caller pins (the ones next to a listing). A fold
 * longer than ~15 minutes gets a corner pinned in the middle of it, so the
 * strip never loses the reader across a long blank stretch.
 */
export function diagram(route: TransitRoute, pinned: Set<number> = new Set()): DiagramItem[] {
  const n = route.stations.length
  const major = new Set<number>([0, n - 1, ...pinned])
  route.stations.forEach((s, i) => {
    if (s.transfers.length || s.landmark) major.add(i)
  })
  const keys = new Set(major)
  const sorted = () => [...keys].sort((a, b) => a - b)
  let changed = true
  while (changed) {
    changed = false
    const ks = sorted()
    for (let k = 0; k < ks.length - 1; k++) {
      const a = ks[k]
      const b = ks[k + 1]
      if (b - a > 3 && route.stations[b].min - route.stations[a].min > 15) {
        const target = (route.stations[a].min + route.stations[b].min) / 2
        let mid = a + 1
        for (let i = a + 1; i < b; i++) {
          if (Math.abs(route.stations[i].min - target) < Math.abs(route.stations[mid].min - target)) mid = i
        }
        keys.add(mid)
        changed = true
      }
    }
  }

  const items: DiagramItem[] = []
  const ks = sorted()
  ks.forEach((index, k) => {
    items.push({ kind: 'stop', index, station: route.stations[index], major: major.has(index) })
    const next = ks[k + 1]
    if (next !== undefined && next - index > 1) {
      const between = route.stations.slice(index + 1, next).map((station, j) => ({ index: index + 1 + j, station }))
      items.push({ kind: 'gap', stations: between, minutes: route.stations[next].min - route.stations[index].min })
    }
  })
  return items
}
