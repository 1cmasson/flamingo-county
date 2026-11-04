import type { Lang } from '../i18n'
import { directoryPoints } from './busPlaces'
import { suggestPoints } from './civic'
import { fold, KINDS, searchPlaces } from './placeSearch'
import { meters, type LatLng } from './transitMath'
import type { TripEnd } from './tripLink'

/**
 * One place from its name, for a trip link written by hand ("Hialeah Park",
 * "2001 W 68 St, Hialeah", "Publix", "farmacia"): the search the planner's
 * box runs (api/transit/where), in the same order (directory, county
 * addresses, OpenStreetMap), but answering with the single place meant.
 *
 * A name that fits many places (a chain, a kind of place) is taken as the
 * one nearest `near`, the trip's other end, when it's known.
 */

export type Resolved =
  | { kind: 'found'; end: TripEnd; sub: string }
  /** Nothing by that name in Miami-Dade. */
  | { kind: 'none' }
  /** The search didn't answer: not "nothing there", just "try again". */
  | { kind: 'down' }

/** Words that don't tell places apart ("the", "de", "miami"…). */
const FILLER = new Set([
  'the',
  'el',
  'la',
  'los',
  'las',
  'de',
  'del',
  'of',
  'and',
  'y',
  'fl',
  'miami',
  'florida',
])
const words = (s: string) =>
  fold(s)
    .split(' ')
    .filter((w) => w.length > 1 && !FILLER.has(w))

/**
 * How far a name is from what was asked: every word asked for must be in it
 * ("palmetto hospital" fits "Palmetto General Hospital"), and then the fewer
 * words besides, the closer ("Miami International Airport" over the airport
 * hotels named after it). Null when it doesn't fit.
 */
const extra = (asked: string, name: string): number | null => {
  const have = fold(name).split(' ')
  const want = words(asked)
  if (!want.length || !want.every((w) => have.includes(w))) return null
  return have.filter((w) => !want.includes(w) && !FILLER.has(w)).length
}

const nearest = <T extends { at: LatLng }>(xs: T[], near: LatLng | undefined): T | undefined =>
  near ? [...xs].sort((a, b) => meters(a.at, near) - meters(b.at, near))[0] : xs[0]

export async function resolvePlace(name: string, lang: Lang, near?: LatLng): Promise<Resolved> {
  const asked = fold(name)
  if (asked.length < 3) return { kind: 'none' }

  // The directory's own spots, by their whole name.
  const listed = (await directoryPoints(lang)).filter(
    (p) => fold(p.name) === asked || (fold(p.name).startsWith(asked) && asked.length >= 6),
  )
  const spot = nearest(listed, near)
  if (spot) return { kind: 'found', end: { name: spot.name, at: spot.at }, sub: spot.city ?? '' }

  // A street address: the county's own address records first.
  if (/^\d/.test(asked)) {
    const street = name.split(',')[0]
    const [addr] = await suggestPoints(street, 1)
    if (addr) return { kind: 'found', end: { name: addr.label, at: addr.at }, sub: addr.city }
  }

  const found = await searchPlaces(name, 8, near)
  if (found === null) return { kind: 'down' }
  if (!found.length) return { kind: 'none' }
  // A kind of place ("farmacia", "pharmacy") takes any of them, the nearest. A name
  // takes the places it fits best (a chain's are all "Publix"), the nearest of those;
  // one it doesn't fit at all isn't taken as it: better "not found" than the wrong place.
  const first = asked.split(' ')[0]
  const isKind = first in KINDS || Object.values(KINDS).some((k) => k.word === first)
  let fitting = found
  if (!isKind) {
    const scored = found
      .map((p) => ({ p, x: extra(name, p.name) }))
      .filter((s): s is { p: (typeof found)[number]; x: number } => s.x !== null)
    const best = Math.min(...scored.map((s) => s.x))
    fitting = scored.filter((s) => s.x === best).map((s) => s.p)
  }
  const pick = nearest(fitting, near)
  if (!pick) return { kind: 'none' }
  return { kind: 'found', end: { name: pick.name, at: pick.at }, sub: pick.sub }
}
