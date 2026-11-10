/**
 * What the county's feed calls each route, shared by `pnpm transit:county`
 * (the route pages) and `pnpm transit:network` (the trip planner) so the two
 * always agree on a route's slug, kind, name and fare.
 */

/** Hialeah's Flamingo and Marlin: built from the City of Hialeah's own data (lib/transit.ts). */
export const SKIP = new Set(['HIAFLA', 'HIAMAR'])

/** Slugs the site already uses for a route (lib/county.ts, the route pages); the rest are the short name. */
export const SLUGS: Record<string, string> = {
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
export function fareOf(short: string, routeType: string): 'free' | 'paid' | null {
  if (short === 'MMI' || short === 'MMO' || short === 'MIA') return 'free'
  if (/^MIA[A-Z]+$/.test(short) && short !== 'MIASPG') return 'free'
  if (/^\d+$/.test(short) || routeType === '1' || routeType === '2') return 'paid'
  return null
}

export function kindOf(short: string, routeType: string): 'bus' | 'trolley' | 'rail' | 'mover' {
  if (routeType === '1' || routeType === '2') return 'rail'
  if (routeType === '0') return 'mover'
  return /^\d+$/.test(short) ? 'bus' : 'trolley'
}

/** What a rider calls it. Numbered buses have none (the page says «Ruta 9»). */
export function nameOf(short: string, long: string, kind: string): string | null {
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

export const slugOf = (short: string) => SLUGS[short] ?? short.toLowerCase()

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

