import { getCities, getEvents, getListings, rel } from '../../lib/data'
import { titleCase } from '../../lib/jsonld'
import { routes } from '../../lib/routes'
import { absUrl, SITE_NAME } from '../../lib/site'
import type { City } from '../../payload-types'
import { allSeasons, seasonWindow } from '../../lib/seasons'
import { todayISO } from '../../lib/dates'
import { TRANSIT } from '../../lib/transit'
import { electionState, placesData, surgeData, voteData } from '../../lib/civic'
import { SURGE_PAGES } from '../../lib/surgeCopy'
import { areaName } from '../../lib/voteCopy'
import { COUNTY_MAYOR } from '../../lib/mayors'

// Built from the database on request; a container build runs against an empty one.
export const dynamic = 'force-dynamic'

/**
 * llms.txt: a plain-text map of the site for language-model crawlers. Whether
 * any engine reads it is unproven; it costs nothing and stays in step with the
 * database because it is generated, not hand-written.
 */
export async function GET() {
  const [cities, listings, events, vote, surge, places] = await Promise.all([
    getCities('en'),
    getListings('en'),
    getEvents('en'),
    voteData(),
    surgeData(),
    placesData(),
  ])
  const state = vote ? electionState(vote.pollingSource, vote.lastElection) : null
  const src = vote?.pollingSource
  // Says what the pages say: current sites only while the list's election is still to come.
  const voteAbout = state?.upcoming
    ? `the Election Day polling place of every precinct for the ${state.election} election, by municipality, with unincorporated Miami-Dade by county commission district, from the Miami-Dade Supervisor of Elections’ polling place list of ${src?.published}. Election Day only; early voting uses other sites.`
    : `polling places of every precinct, by municipality, with unincorporated Miami-Dade by county commission district${state?.over ? `. The ${state.over} election is over` : ''}; the sites are ${src?.election ? `from the Supervisor of Elections’ list for that election` : 'from Miami-Dade County’s open-data layer'}. Confirm a site with the Miami-Dade Elections Department before voting.`
  const voteLines = vote
    ? [
        `- [Where to vote in Miami-Dade](${absUrl(routes.vote('en'))}): ${voteAbout} Spanish: ${absUrl(routes.vote('es'))}`,
        ...vote.areas.map(
          (a) =>
            `- [Where to vote in ${areaName(a, 'en')}](${absUrl(routes.voteArea('en', a.slug))}): ${a.precincts.length} ${a.precincts.length === 1 ? 'precinct' : 'precincts'} and their ${state?.upcoming ? 'Election Day ' : ''}polling places. Spanish: ${absUrl(routes.voteArea('es', a.slug))}`,
        ),
      ]
    : []
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
    '## For AI agents',
    `- MCP server (Streamable HTTP, no auth, read-only): ${absUrl('/mcp')}. Tools: find_address, address_report (pickup days with next dates, FEMA flood zone, storm-surge zone, county and city mayors, county commissioner, state district numbers, Election Day polling place, schools, nearby public places), polling_places, evacuation_zone_summary, trash_schedule, local_officials (mayors and commissioners for a city). Answers in Spanish by default (lang=en for English), each with its sources and the date the records were read.`,
    `- OpenAPI 3.1 for the same answers as a JSON API (ChatGPT Actions and others): ${absUrl('/api/civic/v1/openapi.json')}`,
    `- How to connect (Claude custom connector, ChatGPT GPT Actions): ${absUrl(routes.ai('en'))} Spanish: ${absUrl(routes.ai('es'))}`,
    '- Flamingo County does not store or log queries, and nothing takes a location: the tools answer about an address someone gives, never about a person. (The hosting providers, Railway and Cloudflare, handle technical request data; on the JSON API the address is in the URL, on the MCP server it is in the request body.)',
    '',
    '## Living in Miami-Dade',
    `- [Your address](${absUrl(routes.address('en'))}): type any of Miami-Dade County’s street addresses and see its garbage, recycling and bulk trash days with the next dates, its FEMA flood zone and hurricane storm-surge evacuation zone, its county commissioner and Florida House and Senate districts, its Election Day polling place and precinct, its assigned public schools, and the nearest fire station, police station, hospital, library and park. Built from the public records of Miami-Dade County (Open Data), the City of Hialeah, the City of Miami and FEMA; each result shows the date the records were read. Spanish: ${absUrl(routes.address('es'))}`,
    `- [Free buses in Hialeah](${absUrl(routes.freeRides('en'))}): Hialeah’s two free bus lines, the Flamingo and the Marlin: where they go, when they run, live bus positions and the local spots a short walk from a stop. From the City of Hialeah’s ETA SPOT system and Miami-Dade Transit. Spanish: ${absUrl(routes.freeRides('es'))}`,
    ...voteLines,
    ...(places
      ? [
          `- [Miami-Dade's cities and commission districts](${absUrl(routes.places('en'))}): each of Miami-Dade's ${places.cities.length - 1} cities and the unincorporated county, and the ${places.districts.length} county commission districts, from Miami-Dade County Open Data (data of ${places.fetchedAt}), with a table of all 34 city mayors. Spanish: ${absUrl(routes.places('es'))}`,
          `- Mayor of Miami-Dade County, for every address in the county inside a city or not: ${COUNTY_MAYOR.name} (${COUNTY_MAYOR.sourceUrl}, checked ${COUNTY_MAYOR.checked}). Unincorporated areas such as Kendall, Westchester and Fontainebleau have no city mayor.`,
          ...places.cities.map((c) => {
            const name = areaName({ munic: c.munic, district: null }, 'en')
            return `- [${name}](${absUrl(routes.place('en', c.slug))}): its mayor (from the city's official site, with the date checked), who picks up the trash (and the pickup zones where the records hold them), how many of its ${c.total} addresses are in FEMA high-risk flood zones and storm-surge evacuation zones, polling places, and the fire and police stations inside its limits. Spanish: ${absUrl(routes.place('es', c.slug))}`
          }),
          ...places.districts.map(
            (d) =>
              `- [Miami-Dade Commission District ${d.district}](${absUrl(routes.district('en', d.district))}): commissioner ${d.name} (county records), the cities and unincorporated ZIP codes in the district, ${d.total} addresses. Spanish: ${absUrl(routes.district('es', d.district))}`,
          ),
        ]
      : []),
    ...(surge
      ? [
          `- [Storm-surge evacuation zones in Miami-Dade](${absUrl(routes.evacuation('en'))}): what each of the county's storm-surge planning zones A to E means (the county's own definitions), and how many addresses each city has in each zone, from Miami-Dade County Open Data (data of ${surge.fetchedAt}). Spanish: ${absUrl(routes.evacuation('es'))}`,
          ...SURGE_PAGES.flatMap((slug) => {
            const a = surge.areas.find((x) => x.slug === slug)
            if (!a) return []
            const name = areaName({ munic: a.munic, district: null }, 'en')
            return [
              `- [Is ${name} in an evacuation zone?](${absUrl(routes.evacuationArea('en', slug))}): ${a.addresses.total - a.addresses.none} of ${name}'s ${a.addresses.total} addresses are in a storm-surge evacuation zone, by zone and ZIP code. Spanish: ${absUrl(routes.evacuationArea('es', slug))}`,
            ]
          }),
        ]
      : []),
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
