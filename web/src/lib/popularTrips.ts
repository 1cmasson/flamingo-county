import type { Lang } from '../i18n'
import { serverNetwork } from './busNetwork'
import { busCopy } from './busCopy'
import type { LatLng } from './transitMath'
import type { TripLink } from './tripLink'
import { planTrips, type Plan, type Trip } from './tripPlan'

/**
 * Trips people ask for by name ("how do I get from Hialeah to Jackson by
 * bus?"), each with its own page, `/[lang]/bus/trip/[slug]`, written to be
 * found: the question in the title, the answer in a sentence, the steps.
 * The same planner plans them as any trip link, on the county's schedule.
 *
 * Picked from places across the four areas the bus pages cover (Nov 4,
 * 2026). Since Nov 2026 the planner plans with every route in the county,
 * Metrorail included, so the answers can be a train and a bus. The points
 * are where each place is (OpenStreetMap, via the planner's own search).
 */

type End = { name: Record<Lang, string>; at: LatLng }
export type PopularTrip = { slug: string; from: End; to: End }

const same = (name: string) => ({ en: name, es: name })

const PLACES = {
  hialeahPark: { name: same('Hialeah Park'), at: [25.84539, -80.27908] },
  jackson: { name: same('Jackson Memorial Hospital'), at: [25.79167, -80.2126] },
  palmetto: { name: same('Palmetto General Hospital'), at: [25.8869, -80.32608] },
  westland: { name: same('Westland Mall'), at: [25.8685, -80.31732] },
  hialeahHospital: { name: same('Hialeah Hospital'), at: [25.84554, -80.26862] },
  mdcNorth: {
    name: { en: 'Miami Dade College North Campus', es: 'Miami Dade College, North Campus' },
    at: [25.87809, -80.24706],
  },
  versailles: { name: same('Versailles Restaurant'), at: [25.76499, -80.25277] },
  dominoPark: {
    name: { en: 'Domino Park (Máximo Gómez Park)', es: 'Parque del Dominó (Máximo Gómez)' },
    at: [25.76549, -80.21937],
  },
  govCenter: { name: same('Government Center'), at: [25.77572, -80.19655] },
  miamiLakes: {
    name: { en: 'Miami Lakes Community Center', es: 'Miami Lakes Community Center' },
    at: [25.91, -80.31917],
  },
  hardRock: { name: same('Hard Rock Stadium'), at: [25.9579, -80.23885] },
} satisfies Record<string, End>

export const POPULAR_TRIPS: PopularTrip[] = [
  {
    slug: 'hialeah-park-to-palmetto-general-hospital',
    from: PLACES.hialeahPark,
    to: PLACES.palmetto,
  },
  { slug: 'hialeah-park-to-westland-mall', from: PLACES.hialeahPark, to: PLACES.westland },
  {
    slug: 'hialeah-park-to-miami-dade-college-north',
    from: PLACES.hialeahPark,
    to: PLACES.mdcNorth,
  },
  { slug: 'westland-mall-to-hialeah-hospital', from: PLACES.westland, to: PLACES.hialeahHospital },
  { slug: 'versailles-to-jackson-memorial-hospital', from: PLACES.versailles, to: PLACES.jackson },
  { slug: 'versailles-to-hialeah-park', from: PLACES.versailles, to: PLACES.hialeahPark },
  { slug: 'domino-park-to-government-center', from: PLACES.dominoPark, to: PLACES.govCenter },
  {
    slug: 'miami-lakes-to-palmetto-general-hospital',
    from: PLACES.miamiLakes,
    to: PLACES.palmetto,
  },
  { slug: 'miami-lakes-to-westland-mall', from: PLACES.miamiLakes, to: PLACES.westland },
  {
    slug: 'hard-rock-stadium-to-miami-dade-college-north',
    from: PLACES.hardRock,
    to: PLACES.mdcNorth,
  },
]

export const getPopularTrip = (slug: string) => POPULAR_TRIPS.find((t) => t.slug === slug) ?? null

/**
 * The moment these pages plan for: a weekday at midday, whatever the clock
 * says when the server first builds them. They answer "which bus?", not
 * "which bus right now?", so a page built at 3 AM or on a Sunday mustn't
 * leave out the routes that don't run then.
 */
function planDate(): Date {
  // Wednesday, Nov 4 2026, 12:00 in Miami (17:00 UTC). Only its weekday and hour matter.
  return new Date(Date.UTC(2026, 10, 4, 17, 0))
}

/** A plan only changes with the schedule, which comes with a new build: each is made once per server. */
const plans = new Map<string, Plan>()
export function popularPlan(t: PopularTrip): Plan {
  let p = plans.get(t.slug)
  if (!p) {
    p = planTrips(serverNetwork(), t.from.at, t.to.at, 3, planDate())
    plans.set(t.slug, p)
  }
  return p
}

/** The trip as a trip link (for the share button and the map). */
export function popularLink(t: PopularTrip, lang: Lang): TripLink {
  return {
    from: { name: t.from.name[lang], at: t.from.at },
    to: { name: t.to.name[lang], at: t.to.at },
    buses: [],
  }
}

/** The popular trips that ride a route, for its page. */
export const popularTripsOn = (route: string) =>
  POPULAR_TRIPS.filter((t) =>
    popularPlan(t).trips.some((x) => x.legs.some((l) => l.slug === route)),
  )

/** The answer in a sentence: which bus, toward where, from which stop, and how long. */
export function tripAnswer(lang: Lang, trip: Trip | undefined, t: PopularTrip): string {
  const c = busCopy(lang)
  if (!trip) return c.popularNoBus(t.from.name[lang], t.to.name[lang])
  const [one, ...rest] = trip.legs
  const first = c.popularFirst(c.tripRouteInline(one), one.toward, one.board.name)
  const then = rest.map((l) => c.popularThen(c.tripRouteInline(l), l.toward, l.board.name)).join('')
  return `${first}${then} ${c.popularTotal(trip.total)}`
}
