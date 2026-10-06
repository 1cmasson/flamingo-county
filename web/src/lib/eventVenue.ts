import type { Lang } from '../i18n'
import type { City, Event, Listing } from '../payload-types'
import { routes } from './routes'

/** A populated relationship, or null. The same as `rel` in data.ts, which this must not import (it loads the Payload config). */
function rel<T>(v: T | number | string | null | undefined): T | null {
  return v && typeof v === 'object' ? v : null
}

/**
 * Where an event happens: a listed business, or a named place.
 *
 * `hood` is left empty when it only repeats the venue's name. A place-venue
 * event is often entered with the street as both (Sabor Fest: place "Main
 * Street", hood "Main Street"), and every line that prints "name · hood" then
 * said "Main Street · Main Street".
 *
 * Lives here rather than in EventCard so that code outside React (the event
 * card image, the social auto-draft) can use it without importing a component.
 */
export function eventVenue(ev: Event) {
  const listing = ev.venueType === 'listing' ? rel<Listing>(ev.listing) : null
  const city = listing ? rel<City>(listing.city) : rel<City>(ev.city)
  const name = listing?.name ?? ev.place ?? ''
  const hood = listing?.hood ?? ev.hood ?? ''
  return {
    listing,
    city,
    name,
    hood: sameWords(hood, name) ? '' : hood,
  }
}

/**
 * The venue's street address, as written: the listing's for a listed
 * business, `placeAddress` for a named place. Null when neither has one.
 *
 * A listed venue's address is the listing's own `detail.address`, so the
 * directions are only as sound as that listing's sourcing.
 */
export function eventAddress(ev: Event): string | null {
  const { listing } = eventVenue(ev)
  const address = (listing ? listing.detail?.address : ev.placeAddress)?.trim()
  return address || null
}

/**
 * Directions to an event, as map links that work on any phone or computer.
 *
 * The destination is the venue's name with its address, so the map lands on
 * the library or the park itself rather than a guess at the street number;
 * with no address on file, the name and city ("Milander Park, HIALEAH, FL"),
 * which the map search still resolves. Null only when there is no venue name.
 *
 * Both links are built here; the page shows one button that opens the
 * phone's own map (`DirectionsLink`). Google's is the one in the HTML and the
 * structured data: it opens the Google Maps app where it is installed and the
 * web map where it is not.
 */
export function eventDirections(ev: Event): { address: string | null; google: string; apple: string } | null {
  const { name, city } = eventVenue(ev)
  if (!name.trim()) return null
  const address = eventAddress(ev)
  const destination = address
    ? `${name}, ${address}`
    : [name, city?.name, 'FL'].filter(Boolean).join(', ')
  const q = encodeURIComponent(destination)
  return {
    address,
    google: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    apple: `https://maps.apple.com/?daddr=${q}`,
  }
}

/**
 * Where to read more about an event: who puts it on, as the event names them.
 *
 * - an organizer that is a listing: its page on this site;
 * - otherwise `organizerUrl`, when it is a plain http(s) address, labelled
 *   with `organizerName` or, failing that, the site's host name;
 * - otherwise just `organizerName`, with no link.
 *
 * Null when the event names no organizer at all.
 */
export function eventSource(
  ev: Pick<Event, 'organizer' | 'organizerName' | 'organizerUrl'>,
  lang: Lang,
): { name: string; href: string | null; external: boolean } | null {
  const listing = rel<Listing>(ev.organizer)
  const listingCity = listing ? rel<City>(listing.city) : null
  if (listing && listingCity) {
    return { name: listing.name, href: routes.business(lang, listingCity.slug, listing.slug), external: false }
  }
  const name = (ev.organizerName ?? '').trim()
  const url = safeHttpUrl(ev.organizerUrl)
  if (url) return { name: name || url.hostname.replace(/^www\./, ''), href: url.href, external: true }
  return name ? { name, href: null, external: false } : null
}

/** The URL if it is an absolute http(s) address, else null: no `javascript:`, no relative paths. */
export function safeHttpUrl(value: string | null | undefined): URL | null {
  const raw = (value ?? '').trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

function sameWords(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  return norm(a) === norm(b)
}
