import type { Category, City, Event } from '../payload-types'
import { eventVenue } from './eventVenue'

/**
 * The drawn scene behind an event's social card: a generic kind of place
 * (a library, a restaurant), never a likeness of a real business. The art is
 * in `src/assets/og/settings/<setting>.jpg`, made once and locked in the brand
 * kit (content-marketing-system, brand/flamingo-county/sets/poster/).
 *
 * `main-street-lakes` is the one real place: Miami Lakes' Main Street plaza,
 * drawn from a written description of the public square (the oak, the tiled
 * fountains, the awnings), with every shop sign left blank.
 */
export const EVENT_SETTINGS = ['main-street-lakes', 'library', 'restaurant', 'street-festival'] as const
export type EventSetting = (typeof EVENT_SETTINGS)[number]

/**
 * Words in the venue's name, matched whole and without accents. The event's
 * kind is deliberately not used: the `church` kind is labelled COMMUNITY and
 * covers library classes and galas alike.
 */
const PLACE_WORDS: [RegExp, EventSetting][] = [
  [/\b(biblioteca|library)\b/, 'library'],
  [/\b(restaurante?|cafeteria|cafe|diner|grill|bistro)\b/, 'restaurant'],
  [/\b(calle|street|avenida|avenue|plaza)\b/, 'street-festival'],
]

/** A listing's directory category, by slug. */
const CATEGORY: Record<string, EventSetting> = { food: 'restaurant' }

/** Where a city's events go when nothing more specific matches. */
const CITY_DEFAULT: Record<string, EventSetting> = { lakes: 'main-street-lakes' }

function rel<T>(v: T | number | string | null | undefined): T | null {
  return v && typeof v === 'object' ? v : null
}

function plain(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * The scene for an event read at depth ≥ 2, or null for the flat card. Main
 * Street in Miami Lakes is its own place before it is a street.
 */
export function eventSetting(ev: Event): EventSetting | null {
  const { listing, city, name } = eventVenue(ev)
  const citySlug = rel<City>(city)?.slug ?? ''
  const place = plain(name)

  if (citySlug === 'lakes' && /\bmain (street|st)\b/.test(place)) return 'main-street-lakes'
  for (const [re, setting] of PLACE_WORDS) if (re.test(place)) return setting

  const category = listing ? rel<Category>(listing.category)?.slug : undefined
  if (category && CATEGORY[category]) return CATEGORY[category]

  return CITY_DEFAULT[citySlug] ?? null
}
