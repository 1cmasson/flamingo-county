import mayors from '../data/civic/mayors.json'

/**
 * Which of Meta's audience city labels are in Miami-Dade, for the "Miami-Dade
 * share" of @flamingo.county's followers (lib/graphTelemetry.ts). Meta labels
 * a city as "<City>, <State>": "Miami, Florida", "Hialeah, Florida".
 *
 * Two lists make up the county:
 * - The 34 municipalities, read from src/data/civic/mayors.json (the file
 *   behind lib/mayors.ts, read directly to keep the civic sync code out of the
 *   jobs; the county's own names: "OPA-LOCKA", "INDIAN CREEK VILLAGE"), so
 *   this file never keeps a second copy that could drift.
 * - The unincorporated places: the 2020 Census designated places in
 *   Miami-Dade, as listed at
 *   https://en.wikipedia.org/wiki/List_of_communities_in_Miami-Dade_County,_Florida
 *   (checked 2026-10-20), plus older CDP names that maps and Meta still use
 *   (Cutler, Perrine, Carol City, Lakes by the Bay, Scott Lake, Norland,
 *   Andover, Bunche Park, Lake Lucerne, Biscayne Gardens, Uleta, Kendall Lakes,
 *   Fontainebleau as it is usually spelled, University Park, Redland, West
 *   Kendall, Little Gables, Coopertown).
 *
 * A label matches only on its whole city name, compared without case or
 * punctuation ("Opa-locka" = "Opa Locka"), and only when the state is Florida.
 * Generic or ambiguous unincorporated names (West End, Islandia, Peters) are
 * left out: a follower in another state's West End must not count.
 */

const squash = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const UNINCORPORATED_PLACES = [
  // 2020 Census designated places
  'Ives Estates',
  'Ojus',
  'Golden Glades',
  'Country Club',
  'Palm Springs North',
  'Pinewood',
  'Westview',
  'West Little River',
  'Gladeview',
  'Brownsville',
  'Fountainebleau',
  'Tamiami',
  'Westchester',
  'Coral Terrace',
  'Fisher Island',
  'Glenvar Heights',
  'Olympia Heights',
  'Westwood Lakes',
  'Sunset',
  'Kendall',
  'Kendale Lakes',
  'Kendall West',
  'The Hammocks',
  'The Crossings',
  'Palmetto Estates',
  'Richmond Heights',
  'Three Lakes',
  'Country Walk',
  'Richmond West',
  'West Perrine',
  'South Miami Heights',
  'Goulds',
  'Princeton',
  'Naranja',
  'Leisure City',
  'Homestead Base',
  // Older or everyday names for the same places
  'Fontainebleau',
  'University Park',
  'Redland',
  'West Kendall',
  'Little Gables',
  'Coopertown',
  'Cutler',
  'Cutler Ridge',
  'Perrine',
  'Carol City',
  'Lakes by the Bay',
  'Scott Lake',
  'Norland',
  'Andover',
  'Bunche Park',
  'Lake Lucerne',
  'Biscayne Gardens',
  'Uleta',
  'Kendall Lakes',
]

/** The county's names for two municipalities differ from what Meta prints. */
const MUNICIPAL_ALIASES: Record<string, string[]> = {
  'INDIAN CREEK VILLAGE': ['Indian Creek'],
}

export const MIAMI_DADE_PLACES: string[] = [
  ...mayors.municipalities.flatMap((m) => [m.munic, ...(MUNICIPAL_ALIASES[m.munic] ?? [])]),
  ...UNINCORPORATED_PLACES,
]

const PLACE_KEYS = new Set(MIAMI_DADE_PLACES.map(squash))

/** "Hialeah, Florida" → true; "Miami, Oklahoma" and "Broward County" → false. */
export function isMiamiDadeCity(label: string): boolean {
  const parts = label.split(',').map((p) => p.trim())
  if (parts.length < 2) return false
  const state = squash(parts[parts.length - 1])
  if (state !== 'florida' && state !== 'fl') return false
  return PLACE_KEYS.has(squash(parts.slice(0, -1).join(',')))
}

export type MiamiDadeShare = {
  /** Followers in the listed Miami-Dade cities. */
  followers: number
  /** Of every follower (`followers_count`): a floor, since Meta lists only its top 45 cities. */
  share: number | null
  /** Of the followers in the cities Meta listed. */
  shareOfListed: number | null
  /** Followers in all the cities Meta listed. */
  listed: number
  cities: Record<string, number>
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000

/**
 * Miami-Dade's part of a city breakdown. `share` is the headline: it is over
 * every follower, so it can only understate (cities past Meta's top 45 are
 * missing from the numerator, never from the denominator). `shareOfListed`
 * is over the listed cities only, and can only overstate. The truth is
 * between the two.
 */
export function miamiDadeShare(byCity: Record<string, number>, totalFollowers: number | null | undefined): MiamiDadeShare {
  let followers = 0
  let listed = 0
  const cities: Record<string, number> = {}
  for (const [label, n] of Object.entries(byCity)) {
    if (typeof n !== 'number') continue
    listed += n
    if (isMiamiDadeCity(label)) {
      followers += n
      cities[label] = n
    }
  }
  return {
    followers,
    share: totalFollowers ? round4(followers / totalFollowers) : null,
    shareOfListed: listed ? round4(followers / listed) : null,
    listed,
    cities,
  }
}
