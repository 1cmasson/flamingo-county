import type { Lang } from '../i18n'
import type { Category, City, Event, Listing, Media } from '../payload-types'
import { routes } from './routes'
import { absUrl, SITE_NAME, SITE_URL } from './site'

/**
 * schema.org builders.
 *
 * The rule: emit a field only when the record actually holds a sourced value
 * for it. Nothing here guesses, defaults or infers — a missing phone is an
 * absent `telephone`, never a placeholder. Answer engines repeat what
 * structured data says, so a wrong fact is worse than a missing one. That is
 * also why hours, ratings and price are not emitted yet:
 *   - `detail.hours` is free text, and often below `high` confidence;
 *   - `rating`/`reviews` are authored design values, not collected reviews;
 *   - there is no price field.
 * Phase B adds structured hours and a price range; until then they stay out.
 */

type Obj = Record<string, unknown>

/** Drops undefined, null and empty strings/arrays so they never reach the page. */
export function clean<T extends Obj>(o: T): Partial<T> {
  const out: Obj = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v) && v.length === 0) continue
    out[k] = v
  }
  return out as Partial<T>
}

function rel<T extends { id: number | string }>(v: T | number | string | null | undefined): T | null {
  return v && typeof v === 'object' ? v : null
}

export function mediaUrl(m: Media | number | string | null | undefined): string | undefined {
  const media = rel<Media>(m)
  return media?.url ? absUrl(media.url) : undefined
}

/**
 * "6743 Main St, Miami Lakes, FL, 33014" (how the importer joins it) becomes a
 * PostalAddress. Anything that doesn't match that shape stays whole in
 * `streetAddress` — still true, just less granular.
 */
export function postalAddress(address: string | null | undefined, cityName?: string | null) {
  const text = address?.trim()
  if (!text) return undefined
  const m = text.match(/^(.+?),\s*([^,]+),\s*([A-Z]{2}),?\s*(\d{5})(?:-\d{4})?$/)
  if (m) {
    return clean({
      '@type': 'PostalAddress',
      streetAddress: m[1],
      addressLocality: m[2],
      addressRegion: m[3],
      postalCode: m[4],
      addressCountry: 'US',
    })
  }
  return clean({
    '@type': 'PostalAddress',
    streetAddress: text,
    addressLocality: cityName ?? undefined,
    addressCountry: 'US',
  })
}

export function websiteJsonLd(lang: Lang, description: string): Obj {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: absUrl('/uploads/flamingo-city-favicon-512.png'),
        areaServed: { '@type': 'AdministrativeArea', name: 'Miami-Dade County, Florida' },
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description,
        inLanguage: lang,
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
    ],
  }
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]): Obj {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absUrl(it.path),
    })),
  }
}

/** City names are stored as display caps ("MIAMI LAKES"); structured data wants "Miami Lakes". */
export function titleCase(s: string | null | undefined): string | undefined {
  return s ? s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : undefined
}

/** Food and drink businesses get their specific types; anything else is a LocalBusiness. */
function listingType(category: Category | null): string {
  switch (category?.slug) {
    case 'food':
      return 'Restaurant'
    case 'night':
      return 'BarOrPub'
    case 'nonprofit':
      return 'NGO'
    default:
      return 'LocalBusiness'
  }
}

export function listingJsonLd(lang: Lang, listing: Listing, citySlug: string): Obj {
  const city = rel<City>(listing.city)
  const category = rel<Category>(listing.category)
  const d = listing.detail ?? {}
  const research = listing.research ?? {}
  const gallery = (Array.isArray(listing.gallery) ? listing.gallery : []).map(mediaUrl)
  const sameAs = [d.site, d.instagram].filter((u): u is string => Boolean(u && /^https?:\/\//.test(u)))
  return clean({
    '@context': 'https://schema.org',
    '@type': listingType(category),
    '@id': `${absUrl(routes.business(lang, citySlug, listing.slug))}#business`,
    name: listing.name,
    url: absUrl(routes.business(lang, citySlug, listing.slug)),
    description: listing.tag,
    image: [mediaUrl(listing.logo), ...gallery].filter(Boolean) as string[],
    address: postalAddress(d.address, titleCase(city?.name)),
    telephone: d.phone,
    sameAs,
    servesCuisine:
      listingType(category) === 'Restaurant' || listingType(category) === 'BarOrPub'
        ? research.cuisine
        : undefined,
    areaServed: titleCase(city?.name),
    inLanguage: lang,
  })
}

/**
 * Event date and time are Miami wall-clock. Offset comes from the date itself
 * (EDT/EST) so the instant is right across daylight-saving changes.
 */
export function miamiOffset(dateISO: string): string {
  const probe = new Date(`${dateISO}T12:00:00Z`)
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hour12: false,
    }).format(probe),
  )
  // noon UTC is 08:00 in EDT and 07:00 in EST.
  return hour === 8 ? '-04:00' : '-05:00'
}

export function eventStart(ev: Pick<Event, 'date' | 'startTime'>): string {
  const date = ev.date.slice(0, 10)
  if (!ev.startTime) return date // date-only is valid schema.org and claims no time
  return `${date}T${ev.startTime}:00${miamiOffset(date)}`
}

export function eventJsonLd(
  lang: Lang,
  ev: Event,
  venue: { listing: Listing | null; city: City | null; name: string },
): Obj {
  const date = ev.date.slice(0, 10)
  const citySlug = venue.city?.slug
  const place = venue.name
    ? clean({
        '@type': 'Place',
        name: venue.name,
        address: venue.listing
          ? postalAddress(venue.listing.detail?.address, titleCase(venue.city?.name))
          : venue.city
            ? clean({
                '@type': 'PostalAddress',
                addressLocality: titleCase(venue.city.name),
                addressRegion: 'FL',
                addressCountry: 'US',
              })
            : undefined,
      })
    : undefined
  return clean({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: ev.title,
    url: absUrl(routes.event(lang, ev.slug)),
    description: ev.note,
    startDate: eventStart(ev),
    endDate: ev.endTime && ev.startTime ? `${date}T${ev.endTime}:00${miamiOffset(date)}` : undefined,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: place,
    image: mediaUrl(ev.image),
    inLanguage: lang,
    organizer:
      venue.listing && citySlug
        ? {
            '@type': 'Organization',
            name: venue.listing.name,
            url: absUrl(routes.business(lang, citySlug, venue.listing.slug)),
          }
        : undefined,
  })
}

export function itemListJsonLd(name: string, items: { name: string; path: string }[]): Obj {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      url: absUrl(it.path),
    })),
  }
}
