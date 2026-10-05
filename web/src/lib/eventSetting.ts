import type { Category, City, Event } from '../payload-types'
import { eventVenue } from './eventVenue'

/**
 * The drawn scene behind an event's social card: a generic kind of place
 * (a library, a restaurant), never a likeness of a real business. The art is
 * in `src/assets/og/settings/<setting>.jpg`, made once and locked in the brand
 * kit (content-marketing-system, brand/flamingo-county/sets/poster/). An
 * event's own photo, when it has one, wins over any scene.
 *
 * Three are real public places, each drawn from a written description with
 * every sign left blank and no artwork in it: Miami Lakes' Main Street plaza,
 * the Hialeah city gateway (without the flamingo statue) and a Calle Ocho
 * street (without the murals). They are also their cities' defaults.
 */
export const EVENT_SETTINGS = [
  'main-street-lakes',
  'hialeah-gateway',
  'calle-ocho',
  'library',
  'restaurant',
  'street-festival',
  'arts-center',
  'banquet-hall',
  'park',
  'church',
  'city-hall',
  'bar',
] as const
export type EventSetting = (typeof EVENT_SETTINGS)[number]

/** The admin's names for each scene, for the event's override. */
export const EVENT_SETTING_LABELS: Record<EventSetting, string> = {
  'main-street-lakes': 'Main Street plaza (Miami Lakes)',
  'hialeah-gateway': 'Hialeah city gateway',
  'calle-ocho': 'Calle Ocho street (Little Havana)',
  library: 'Library',
  restaurant: 'Restaurant',
  'street-festival': 'Street festival',
  'arts-center': 'Arts center / gallery',
  'banquet-hall': 'Banquet hall',
  park: 'Park',
  church: 'Church',
  'city-hall': 'City hall',
  bar: 'Bar / lounge',
}

/** The override's value for "no scene, the flat city-colour poster". */
export const FLAT_SETTING = 'flat'

/**
 * Words in the venue's name, matched whole and without accents, in order: the
 * first match wins. The event's kind is deliberately not used: the `church`
 * kind is labelled COMMUNITY and covers library classes and galas alike.
 *
 * - Hialeah Park is the racetrack and casino, not a park, so it is left to
 *   the city default.
 * - "Hall" alone could be a city hall or a banquet hall, so only the full
 *   names count for either.
 * - "Arts" (plural) and named art places only: "Art Deco Diner" is a diner.
 */
const PLACE_WORDS: [RegExp, EventSetting][] = [
  [/\b(biblioteca|library)\b/, 'library'],
  [/\b(city hall|town hall|ayuntamiento|alcaldia)\b/, 'city-hall'],
  [/\b(museo|museum|galeria|gallery|teatro|theat(er|re)|arts|art center|centro de arte|centro cultural|cultural center)\b/, 'arts-center'],
  [/\b(iglesia|church|parroquia|parish|catedral|cathedral|capilla|chapel)\b/, 'church'],
  [/\b(banquet|ballroom|salon de (fiestas|eventos|recepciones)|event hall|reception hall)\b/, 'banquet-hall'],
  [/\b(bar|lounge|pub|taproom|tavern|cerveceria|brewery)\b/, 'bar'],
  [/\b(restaurante?|cafeteria|cafe|diner|grill|bistro)\b/, 'restaurant'],
  [/\b(parque|park)\b/, 'park'],
  [/\b(calle|street|avenida|avenue|plaza)\b/, 'street-festival'],
]

/** A name that looks like a park but is the racetrack and casino. */
const NOT_A_PARK = /\bhialeah park\b/

/** A listing's directory category, by slug. */
const CATEGORY: Record<string, EventSetting> = { food: 'restaurant', night: 'bar' }

/** Where a city's events go when nothing more specific matches. */
const CITY_DEFAULT: Record<string, EventSetting> = {
  lakes: 'main-street-lakes',
  hialeah: 'hialeah-gateway',
  havana: 'calle-ocho',
}

function rel<T>(v: T | number | string | null | undefined): T | null {
  return v && typeof v === 'object' ? v : null
}

function plain(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function isSetting(v: unknown): v is EventSetting {
  return typeof v === 'string' && (EVENT_SETTINGS as readonly string[]).includes(v)
}

/**
 * The scene for an event read at depth ≥ 2, or null for the flat card.
 *
 * The event's own `setting`, when the owner picked one, wins (`flat` for no
 * scene). Then Main Street in Miami Lakes, which is its own place before it
 * is a street; then the venue's name; then a listing's category; then the
 * city's default.
 */
export function eventSetting(ev: Event): EventSetting | null {
  const chosen = ev.setting
  if (chosen === FLAT_SETTING) return null
  if (isSetting(chosen)) return chosen

  const { listing, city, name } = eventVenue(ev)
  const citySlug = rel<City>(city)?.slug ?? ''
  const place = plain(name)

  if (citySlug === 'lakes' && /\bmain (street|st)\b/.test(place)) return 'main-street-lakes'
  for (const [re, setting] of PLACE_WORDS) {
    if (setting === 'park' && NOT_A_PARK.test(place)) continue
    if (re.test(place)) return setting
  }

  const category = listing ? rel<Category>(listing.category)?.slug : undefined
  if (category && CATEGORY[category]) return CATEGORY[category]

  return CITY_DEFAULT[citySlug] ?? null
}
