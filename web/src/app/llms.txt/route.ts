import { getCities, getEvents, getListings, rel } from '../../lib/data'
import { titleCase } from '../../lib/jsonld'
import { routes } from '../../lib/routes'
import { absUrl, SITE_NAME } from '../../lib/site'
import type { City } from '../../payload-types'
import { allSeasons, seasonWindow } from '../../lib/seasons'
import { todayISO } from '../../lib/dates'

// Built from the database on request; a container build runs against an empty one.
export const dynamic = 'force-dynamic'

/**
 * llms.txt: a plain-text map of the site for language-model crawlers. Whether
 * any engine reads it is unproven; it costs nothing and stays in step with the
 * database because it is generated, not hand-written.
 */
export async function GET() {
  const [cities, listings, events] = await Promise.all([
    getCities('en'),
    getListings('en'),
    getEvents('en'),
  ])
  const lines = [
    `# ${SITE_NAME}`,
    '',
    '> A bilingual (English/Spanish) directory of the restaurants, bars, nonprofits and events that locals vouch for in Hialeah, Miami Lakes, Little Havana and the rest of Miami-Dade County, Florida.',
    '',
    'Every page exists in English (/en/...) and Spanish (/es/...). Business details come from the business’s own channels and named public sources; where hours or contact details could not be confirmed, the page says so instead of guessing.',
    '',
    '## Areas',
    ...cities.map((c) => `- [${titleCase(c.name)}](${absUrl(routes.city('en', c.slug))}): ${c.blurb ?? ''}`.trimEnd()),
    '',
    '## Businesses',
    ...listings
      .filter((b) => b.publicationStatus !== 'unsourced')
      .flatMap((b) => {
        const city = rel<City>(b.city)
        if (!city) return []
        return [`- [${b.name}](${absUrl(routes.business('en', city.slug, b.slug))}): ${b.tag ?? ''}`.trimEnd()]
      }),
    '',
    '## Events',
    `- [All events](${absUrl(routes.events('en'))})`,
    ...allSeasons().map((s) => {
      const year = seasonWindow(s, todayISO()).year
      return `- [${s.title('en', year)}](${absUrl(routes.season('en', s.path))}): ${s.description('en', year)} Spanish: ${absUrl(routes.season('es', s.path))}`
    }),
    ...events.map((e) => `- [${e.title}](${absUrl(routes.event('en', e.slug))}): ${e.date.slice(0, 10)}`),
    '',
  ]
  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  })
}
