import type { MetadataRoute } from 'next'
import { LOCALES, type Lang } from '../i18n'
import { routes } from '../lib/routes'
import { getCities, getEvents, getListings, getStories, rel } from '../lib/data'
import { absUrl } from '../lib/site'
import { todayISO } from '../lib/dates'
import { allSeasons, seasonEvents } from '../lib/seasons'
import { ROUTE_SLUGS } from '../lib/transit'
import type { City } from '../payload-types'
import { voteData } from '../lib/civic'

// Reads Payload at request time; a container build runs against an empty DB.
export const dynamic = 'force-dynamic'

type Entry = MetadataRoute.Sitemap[number]

/** One entry per language version, each listing both in `alternates`. */
function both(path: (lang: Lang) => string, lastModified?: string | Date, priority?: number): Entry[] {
  const languages = Object.fromEntries(LOCALES.map((l) => [l, absUrl(path(l))]))
  return LOCALES.map((l) => ({
    url: absUrl(path(l)),
    lastModified: lastModified ? new Date(lastModified) : undefined,
    priority,
    alternates: { languages },
  }))
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [cities, listings, events, stories, vote] = await Promise.all([
    getCities('en'),
    getListings('en'),
    getEvents('en'),
    getStories('en'),
    voteData(),
  ])

  // A seasonal guide's lastmod is its newest listed event's edit: the page
  // changes when one of them does (or drops off, which a crawl catches anyway).
  const today = todayISO()
  const seasonEntries = allSeasons().flatMap((season) => {
    const listed = seasonEvents(events, season.key, today)
    const newest = listed.map((e) => e.updatedAt).sort().pop()
    return both((l) => routes.season(l, season.path), newest, 0.7)
  })

  const entries: Entry[] = [
    ...both(routes.home, undefined, 1),
    ...both(routes.events, undefined, 0.8),
    ...both(routes.stories, undefined, 0.7),
    ...seasonEntries,
    ...both(routes.about, undefined, 0.4),
    ...both(routes.listYourSpot, undefined, 0.4),
    ...both(routes.freeRides, undefined, 0.7),
    ...ROUTE_SLUGS.flatMap((r) => both((l) => routes.freeRoute(l, r), undefined, 0.6)),
    // The search page only: a single address (`?a=`) is noindex.
    ...both(routes.address, undefined, 0.7),
    // Where to vote: the hub and one page per municipality or unincorporated
    // commission district, dated by the day their records were read. Left out
    // until the address database has them (the pages answer 503 till then).
    ...(vote
      ? [
          ...both(routes.vote, vote.fetchedAt, 0.8),
          ...vote.areas.flatMap((a) => both((l) => routes.voteArea(l, a.slug), vote.fetchedAt, 0.7)),
        ]
      : []),
    ...cities.flatMap((c) => both((l) => routes.city(l, c.slug), c.updatedAt, 0.9)),
    ...listings.flatMap((b) => {
      // The page 404s unless the city matches, so a listing with no city has no URL.
      // Unsourced records are design placeholders; don't promote them.
      if (b.publicationStatus === 'unsourced') return []
      const city = rel<City>(b.city)
      if (!city) return []
      return both((l) => routes.business(l, city.slug, b.slug), b.updatedAt, 0.8)
    }),
    ...events.flatMap((e) => both((l) => routes.event(l, e.slug), e.updatedAt, 0.6)),
    ...stories.flatMap((s) => both((l) => routes.story(l, s.slug), s.updatedAt, 0.6)),
  ]
  return entries
}
