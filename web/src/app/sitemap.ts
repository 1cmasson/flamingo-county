import type { MetadataRoute } from 'next'
import { LOCALES, type Lang } from '../i18n'
import { routes } from '../lib/routes'
import { getCities, getEvents, getListings, getStories, rel } from '../lib/data'
import { absUrl } from '../lib/site'
import { ROUTE_SLUGS } from '../lib/transit'
import type { City } from '../payload-types'

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
  const [cities, listings, events, stories] = await Promise.all([
    getCities('en'),
    getListings('en'),
    getEvents('en'),
    getStories('en'),
  ])

  const entries: Entry[] = [
    ...both(routes.home, undefined, 1),
    ...both(routes.events, undefined, 0.8),
    ...both(routes.stories, undefined, 0.7),
    ...both(routes.about, undefined, 0.4),
    ...both(routes.listYourSpot, undefined, 0.4),
    ...both(routes.freeRides, undefined, 0.7),
    ...ROUTE_SLUGS.flatMap((r) => both((l) => routes.freeRoute(l, r), undefined, 0.6)),
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
