import { getCities, getEvents, getListings, rel } from '../../lib/data'
import { titleCase } from '../../lib/jsonld'
import { routes } from '../../lib/routes'
import { absUrl, SITE_NAME } from '../../lib/site'
import type { City } from '../../payload-types'
import { allSeasons, seasonWindow } from '../../lib/seasons'
import { todayISO } from '../../lib/dates'
import { TRANSIT } from '../../lib/transit'

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
    '## Living in Miami-Dade',
    `- [Your address](${absUrl(routes.address('en'))}): type any of Miami-Dade County’s street addresses and see its garbage, recycling and bulk trash days with the next dates, its FEMA flood zone and hurricane storm-surge evacuation zone, its county commissioner and Florida House and Senate districts, its Election Day polling place and precinct, its assigned public schools, and the nearest fire station, police station, hospital, library and park. Built from the public records of Miami-Dade County (Open Data), the City of Hialeah, the City of Miami and FEMA; each result shows the date the records were read. Spanish: ${absUrl(routes.address('es'))}`,
    `- [Free buses in Hialeah](${absUrl(routes.freeRides('en'))}): Hialeah’s two free bus lines, the Flamingo and the Marlin: where they go, when they run, live bus positions and the local spots a short walk from a stop. From the City of Hialeah’s ETA SPOT system and Miami-Dade Transit. Spanish: ${absUrl(routes.freeRides('es'))}`,
    ...TRANSIT.routes.map(
      (r) =>
        `- [${r.name} free bus line](${absUrl(routes.freeRoute('en', r.slug))}): every stop on Hialeah’s free ${r.name} line, with ride times and the spots near each stop. Spanish: ${absUrl(routes.freeRoute('es', r.slug))}`,
    ),
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
