import type { Lang } from '../i18n'
import type { Category, City, Event, Listing, Media, Story, Video } from '../payload-types'
import { eventEndDay } from './dates'
import { eventDirections } from './eventVenue'
import { routes } from './routes'
import { absUrl, SITE_NAME, SITE_URL } from './site'

/**
 * schema.org builders.
 *
 * The rule: emit a field only when the record actually holds a sourced value
 * for it. Nothing here guesses, defaults or infers — a missing phone is an
 * absent `telephone`, never a placeholder. Answer engines repeat what
 * structured data says, so a wrong fact is worse than a missing one. That is
 * also why some fields are gated or absent:
 *   - hours go out only from `detail.openingHours` and only at
 *     `hoursConfidence === 'high'`, the same bar the page uses to print them;
 *   - `rating`/`reviews` are authored design values, not collected reviews;
 *   - there is no price field: the site makes no cost claims.
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
 * The parts of an address in the importer's shape, or null for anything else.
 * Greedy street: "4410 West 16th Ave., Suite 40, Hialeah, FL, 33012" keeps the
 * suite in the street, and the city is the last part before the state.
 */
export function splitAddress(address: string | null | undefined) {
  const m = address?.trim().match(/^(.+),\s*([^,]+),\s*([A-Z]{2}),?\s*(\d{5})(?:-\d{4})?$/)
  if (!m) return null
  return { streetAddress: m[1], addressLocality: m[2], addressRegion: m[3], postalCode: m[4] }
}

/**
 * "6743 Main St, Miami Lakes, FL, 33014" (how the importer joins it) becomes a
 * PostalAddress. Anything that doesn't match that shape stays whole in
 * `streetAddress` — still true, just less granular.
 */
export function postalAddress(address: string | null | undefined, cityName?: string | null) {
  const text = address?.trim()
  if (!text) return undefined
  const parts = splitAddress(text)
  if (parts) {
    return clean({ '@type': 'PostalAddress', ...parts, addressCountry: 'US' })
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

/**
 * The page itself, as distinct from the business or event it is about.
 *
 * `dateModified` lives here because it is a property of the page (a
 * CreativeWork), not of a Restaurant or an Event, so it cannot go on the
 * entity node. It comes from `lastVerifiedAt`, the day the facts were checked
 * against their sources, and is absent when nobody has checked: Payload's own
 * `updatedAt` moves on every re-seed and would claim a freshness nobody earned.
 */
export function webPageJsonLd(
  lang: Lang,
  path: string,
  page: { name: string; mainEntityId?: string; dateModified?: string | null },
): Obj {
  return clean({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${absUrl(path)}#webpage`,
    url: absUrl(path),
    name: page.name,
    inLanguage: lang,
    isPartOf: { '@id': `${SITE_URL}/#website` },
    mainEntity: page.mainEntityId ? { '@id': page.mainEntityId } : undefined,
    dateModified: page.dateModified ? page.dateModified.slice(0, 10) : undefined,
  })
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

/**
 * `openingHoursSpecification`, or nothing. Below `high` the sources disagree or
 * are not the business's own, and a wrong schedule in an answer is worse than
 * none, so the whole block is withheld rather than trimmed.
 */
export function openingHoursSpec(detail: Listing['detail']) {
  if (detail?.hoursConfidence !== 'high') return undefined
  const rows = (detail.openingHours ?? []).filter((r) => r.days?.length && r.opens && r.closes)
  if (!rows.length) return undefined
  return rows.map((r) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: r.days,
    opens: r.opens,
    closes: r.closes,
  }))
}

export function listingJsonLd(lang: Lang, listing: Listing, citySlug: string): Obj {
  const city = rel<City>(listing.city)
  const category = rel<Category>(listing.category)
  const d = listing.detail ?? {}
  const research = listing.research ?? {}
  const gallery = (Array.isArray(listing.gallery) ? listing.gallery : []).map(mediaUrl)
  // `site` is stored as a bare host ("molinasranch.com"); give it a scheme.
  const site = d.site && !/^https?:\/\//.test(d.site) ? `https://${d.site}` : d.site
  const sameAs = [site, d.instagram].filter((u): u is string => Boolean(u && /^https?:\/\//.test(u)))
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
    openingHoursSpecification: openingHoursSpec(d),
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

const EVENT_STATUS: Record<string, string> = {
  scheduled: 'https://schema.org/EventScheduled',
  postponed: 'https://schema.org/EventPostponed',
  rescheduled: 'https://schema.org/EventRescheduled',
  cancelled: 'https://schema.org/EventCancelled',
}

/** A listing as an organizer: its type, its page on this site, its own channels. */
function listingOrganizer(lang: Lang, listing: Listing): Obj | undefined {
  const city = rel<City>(listing.city)
  if (!city) return undefined
  return clean({
    '@type': listingType(rel<Category>(listing.category)),
    name: listing.name,
    url: absUrl(routes.business(lang, city.slug, listing.slug)),
  })
}

export function eventJsonLd(
  lang: Lang,
  ev: Event,
  venue: { listing: Listing | null; city: City | null; name: string },
): Obj {
  const date = ev.date.slice(0, 10)
  const endDay = eventEndDay(ev)
  const cityName = titleCase(venue.city?.name)
  const place = venue.name
    ? clean({
        '@type': 'Place',
        name: venue.name,
        address: venue.listing
          ? postalAddress(venue.listing.detail?.address, cityName)
          : (postalAddress(ev.placeAddress, cityName) ??
            (venue.city
              ? clean({
                  '@type': 'PostalAddress',
                  addressLocality: cityName,
                  addressRegion: 'FL',
                  addressCountry: 'US',
                })
              : undefined)),
        // The same directions link the page shows.
        hasMap: eventDirections(ev)?.google,
      })
    : undefined
  // Who puts it on: the organizer the event names, else the venue's own
  // listing (a business's own night). A rented hall is never the organizer.
  const organizerListing = rel<Listing>(ev.organizer)
  const organizer = organizerListing
    ? listingOrganizer(lang, organizerListing)
    : ev.organizerName
      ? clean({
          '@type': 'Organization',
          name: ev.organizerName,
          url: ev.organizerUrl && /^https?:\/\//.test(ev.organizerUrl) ? ev.organizerUrl : undefined,
        })
      : venue.listing
        ? listingOrganizer(lang, venue.listing)
        : undefined
  return clean({
    '@context': 'https://schema.org',
    '@type': 'Event',
    '@id': `${absUrl(routes.event(lang, ev.slug))}#event`,
    name: ev.title,
    url: absUrl(routes.event(lang, ev.slug)),
    description: ev.note,
    startDate: eventStart(ev),
    // A finish needs a start to be read against; a date-only multi-day event
    // ends on its last day.
    endDate:
      ev.endTime && ev.startTime
        ? `${endDay}T${ev.endTime}:00${miamiOffset(endDay)}`
        : endDay !== date
          ? endDay
          : undefined,
    eventStatus: EVENT_STATUS[ev.eventStatus ?? 'scheduled'],
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: place,
    image: mediaUrl(ev.image),
    inLanguage: lang,
    organizer,
  })
}

/**
 * A page that lists events (a seasonal guide): an ItemList whose entries are
 * the full Event objects `eventJsonLd` builds, each without its own
 * `@context` since it is nested under this one.
 */
export function eventListJsonLd(name: string, path: string, events: Obj[]): Obj {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    url: absUrl(path),
    numberOfItems: events.length,
    itemListElement: events.map((ev, i) => {
      const { '@context': _context, ...item } = ev
      return { '@type': 'ListItem', position: i + 1, item }
    }),
  }
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

/**
 * A story's reel. Google requires name, thumbnailUrl and uploadDate; the
 * thumbnail is the cover card, and the upload date is the day the reel came
 * onto the site (its own record), not a guess at when it was filmed.
 */
export function videoJsonLd(lang: Lang, video: Video, description?: string | null): Obj | null {
  const thumb = mediaUrl(video.poster)
  if (!video.url || !thumb) return null
  return clean({
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: video.title,
    description: description || video.title,
    thumbnailUrl: [thumb],
    uploadDate: video.createdAt,
    contentUrl: absUrl(video.url),
    duration: video.durationSeconds ? `PT${Math.floor(video.durationSeconds / 60)}M${video.durationSeconds % 60}S` : undefined,
    inLanguage: lang,
    publisher: { '@id': `${SITE_URL}/#organization` },
  })
}

/**
 * The story as an Article. `datePublished` is when the story record was
 * made; `dateModified` is left out because `updatedAt` moves on every save,
 * including a re-seed, and would claim an edit nobody made.
 */
export function storyJsonLd(lang: Lang, story: Story, opts: { image?: string; video?: Obj | null }): Obj {
  const url = absUrl(routes.story(lang, story.slug))
  return clean({
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: story.title,
    description: story.dek,
    url,
    mainEntityOfPage: url,
    image: opts.image ? [opts.image] : undefined,
    datePublished: story.createdAt,
    inLanguage: lang,
    author: { '@id': `${SITE_URL}/#organization` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    video: opts.video ? (({ '@context': _c, ...v }) => v)(opts.video) : undefined,
  })
}
