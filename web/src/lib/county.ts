import type { Lang } from '../i18n'
import { todayISO } from './dates'
import { routes } from './routes'
import { formatClock, meters, type LatLng } from './transitMath'
import type { DayKind, RouteTimes, Run } from './busTime'
import data from '../data/transit/county.json'

/**
 * Miami-Dade Transit routes with a page of their own (/[lang]/bus/[route]):
 * a pilot of ten through the cities the directory covers.
 *
 * Unlike Hialeah's free lines (lib/transit.ts), every fact here is the
 * county's own schedule, reduced by `pnpm transit:county` into
 * `src/data/transit/county.json`: the stops in order, ride minutes, the
 * first and last bus and how often buses come. The operator publishing its
 * own times is the source a rider would check, so the pages quote them, and
 * stop quoting them once the schedule's end date (`serviceEnds`) passes.
 */

export type CountyStation = {
  id: string
  name: string
  at: LatLng
  /** Ride minutes from the direction's first stop, on a midday bus. */
  min: number
  /** A stop the county times its buses to: the ones worth reading on a long list. */
  timepoint: boolean
  /** Other routes stopping at this corner, by the feed's short name. */
  transfers: string[]
}

export type DaySchedule = {
  trips: number
  /** Minutes after midnight the first and last bus leave; past 1440 is after midnight. */
  first: number
  last: number
  headway: { morning: number | null; midday: number | null; evening: number | null }
}

export type { DayKind }

export type CountyDirection = {
  id: string
  /** Where these buses are headed, as their head sign says it. */
  toward: string
  /** Other head signs on a tenth of the trips or more: buses that end short. */
  alsoEnds: string[]
  rideMinutes: number
  stations: CountyStation[]
  path: LatLng[]
  schedule: Record<DayKind, DaySchedule | null>
  /** The stations the county times its buses to, by index, and every trip's times there (lib/busTime). */
  timed: number[]
  runs: Record<DayKind, Run[]>
}

export type CountyRoute = {
  slug: string
  short: string
  /** The feed's route id, which the live data (lib/countyLive.ts) carries; it changes with each feed edition. */
  routeId?: string
  kind: 'bus' | 'trolley'
  /** "54" for a Metrobus route; null for a city trolley. */
  number: string | null
  countyName: string
  /** The street a rider knows the route by. */
  via: string
  /** The directory's city slugs the route runs through. */
  cities: string[]
  color: string
  serviceEnds: string | null
  /** Dates that don't run their weekday's usual buses (a holiday on Sunday hours); null is none at all. */
  dayKinds: Record<string, DayKind | null>
  directions: CountyDirection[]
}

export type CountyLine = { kind: 'bus' | 'trolley' | 'rail' | 'mover'; name: string; ours: boolean }

export const COUNTY = data as unknown as {
  source: { name: string; url: string; fetchedAt: string; serviceEnds: string | null }
  routes: CountyRoute[]
  lines: Record<string, CountyLine>
}

export const COUNTY_SLUGS = COUNTY.routes.map((r) => r.slug)

export function getCountyRoute(slug: string): CountyRoute | null {
  return COUNTY.routes.find((r) => r.slug === slug) ?? null
}

/** The routes through one of the directory's cities. */
export function countyRoutesIn(city: string): CountyRoute[] {
  return COUNTY.routes.filter((r) => r.cities.includes(city))
}

/** Is the county's schedule still the one in force? Past its end date, no times are quoted. */
export function scheduleCurrent(route: CountyRoute, now: Date = new Date()): boolean {
  return !route.serviceEnds || todayISO(now) <= route.serviceEnds
}

/**
 * Whether riding it costs anything. Of the routes here, the numbered ones are
 * Metrobus (a fare) and the one trolley is the City of Miami's, which is free.
 */
export function isFree(route: CountyRoute): boolean {
  return !route.number
}

/** "Route 54" / "Ruta 54"; a trolley by its name. */
export function routeName(route: CountyRoute, lang: Lang): string {
  if (route.number) return lang === 'es' ? `Ruta ${route.number}` : `Route ${route.number}`
  return lang === 'es' ? 'Trolley de la Pequeña Habana' : 'Little Havana Trolley'
}

/** The street a rider knows the route by. Street names stay as the signs print them; a neighborhood is translated. */
export function routeVia(route: CountyRoute, lang: Lang): string {
  return lang === 'es'
    ? route.via.replace('Little Havana', 'la Pequeña Habana').replace(/ and /g, ' y ')
    : route.via
}

/** The name inside a sentence: Spanish gives it its article («la Ruta 54», «el Trolley…»). */
export function routeNameInline(route: CountyRoute, lang: Lang): string {
  const name = routeName(route, lang)
  if (lang === 'en') return name
  return route.number ? `la ${name}` : `el ${name}`
}

/** The trolleys' own names, by short name, for a transfer that mentions one. */
const TROLLEY_NAMES: Record<string, { en: string; es: string }> = {
  HIAFLA: { en: 'Flamingo (free)', es: 'Flamingo (gratis)' },
  HIAMAR: { en: 'Marlin (free)', es: 'Marlin (gratis)' },
  MIAHAVA: { en: 'Little Havana Trolley', es: 'Trolley de la Pequeña Habana' },
}

/** What a transfer chip says: "54", "Metrorail", "Marlin (free)", "Doral Trolley (Rt. 2)". */
export function lineLabel(short: string, lang: Lang): string {
  const line = COUNTY.lines[short]
  if (TROLLEY_NAMES[short]) return TROLLEY_NAMES[short][lang]
  if (!line) return short
  if (line.kind === 'rail') return 'Metrorail'
  if (line.kind === 'mover') return /AIRPORT/i.test(line.name) ? 'MIA Mover' : 'Metromover'
  if (line.kind === 'bus') return short
  return line.name.replace(/\s+Free-Bee$/i, ' Freebee').replace(/^Miami - /, '')
}

/**
 * Where a transfer chip leads, when the site has a page for that line: one of
 * these routes, or Hialeah's free Flamingo and Marlin.
 */
export function lineHref(short: string, lang: Lang): string | null {
  if (short === 'HIAFLA') return routes.freeRoute(lang, 'flamingo')
  if (short === 'HIAMAR') return routes.freeRoute(lang, 'marlin')
  const ours = COUNTY.routes.find((r) => r.short === short)
  return ours ? routes.busRoute(lang, ours.slug) : null
}

/**
 * Rail first, then the site's own routes, then the rest; at most `max`, so a
 * downtown terminal's twenty routes don't bury the stop's name.
 */
export function rankTransfers(transfers: string[], max = 6): { shown: string[]; more: number } {
  const rank = (s: string) => {
    const line = COUNTY.lines[s]
    if (line?.kind === 'rail') return 0
    if (TROLLEY_NAMES[s] || line?.ours) return 1
    if (line?.kind === 'mover') return 2
    return 3
  }
  const sorted = [...transfers].sort((a, b) => rank(a) - rank(b))
  // Metrorail's two lines and its platforms are one transfer to a rider.
  const unique = sorted.filter(
    (s, i) => sorted.findIndex((t) => lineLabel(t, 'en') === lineLabel(s, 'en')) === i,
  )
  return { shown: unique.slice(0, max), more: Math.max(0, unique.length - max) }
}

/** A schedule time, which can run past midnight (25:10 is 1:10 AM). */
export function formatBusTime(min: number, lang: Lang): string {
  return formatClock(((Math.round(min) % 1440) + 1440) % 1440, lang)
}

/** Buses all night: the last one leaves within an hour of the next morning's first. */
export function allNight(day: DaySchedule): boolean {
  return day.last - 1440 >= day.first - 60
}

/** The day's typical wait: the midday gap, or the busiest-hours one when midday has too few buses. */
export function typicalHeadway(day: DaySchedule): number | null {
  return day.headway.midday ?? day.headway.morning ?? day.headway.evening
}

/** What the browser needs to say when the next bus comes: one route's trips, nothing else. */
export function routeTimes(route: CountyRoute): RouteTimes {
  return {
    serviceEnds: route.serviceEnds,
    dayKinds: route.dayKinds,
    directions: route.directions.map((d) => ({
      id: d.id,
      toward: d.toward,
      stations: d.stations.map(({ id, name, at, min }) => ({ id, name, at, min })),
      timed: d.timed,
      runs: d.runs,
    })),
  }
}

/** Each direction's head sign, in the order the feed numbers them: the route's two ends. */
export function routeEnds(route: CountyRoute): [string, string] {
  const [a, b] = route.directions
  return [b?.toward ?? a.toward, a.toward]
}

/** How far a stop can be from a business and still count as "a short walk". */
export const NEAR_STOP_METERS = 500

/** The nearest stop of the route to a point, any direction, within `max` metres. */
export function nearestCountyStop(
  route: CountyRoute,
  at: LatLng,
  max: number = NEAR_STOP_METERS,
): { station: CountyStation; meters: number } | null {
  let best: { station: CountyStation; meters: number } | null = null
  for (const d of route.directions) {
    for (const station of d.stations) {
      const m = meters(at, station.at)
      if (m <= max && (!best || m < best.meters)) best = { station, meters: m }
    }
  }
  return best
}
