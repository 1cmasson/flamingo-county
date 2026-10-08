import { SITE_URL } from './site'

/**
 * OpenAPI 3.1 for the civic JSON API, for ChatGPT Actions and anything else
 * that reads OpenAPI. The same five answers the MCP server gives at /mcp.
 */

const lang = {
  name: 'lang',
  in: 'query',
  required: false,
  description: 'Answer language: "es" (default) or "en".',
  schema: { type: 'string', enum: ['es', 'en'], default: 'es' },
}
const city = (required: boolean, description: string) => ({ name: 'city', in: 'query', required, description, schema: { type: 'string', maxLength: 80 } })

const result = {
  description: 'The answer: `text` (short, quotable), `data` (structured), `sources` (agency and URL), `fetchedAt` (the day the records were read), `page` (the page a person can open).',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Result' } } },
}
const errors = {
  '400': { description: 'A required parameter is missing.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  '404': { description: 'Nothing matches.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  '429': { description: 'Rate limited (60 requests a minute per tool). See Retry-After.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  '503': { description: 'The county data is being rebuilt. See Retry-After.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
}

export function civicOpenApi() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Flamingo County · Miami-Dade civic answers',
      version: '1.0.0',
      description:
        'Read-only answers about living in Miami-Dade County, Florida, from the county’s, the cities’ and FEMA’s public records: trash, recycling and bulk pickup, flood and storm-surge zones, county commissioners, state district numbers, Election Day polling places, schools and the nearest public places. Spanish by default. Every answer carries its sources and the date the records were read; cite them. No authentication and no location input; Flamingo County stores nothing about the asker. The same tools are available as an MCP server at ' +
        `${SITE_URL}/mcp.`,
      contact: { url: `${SITE_URL}/en/ai` },
    },
    servers: [{ url: `${SITE_URL}/api/civic/v1` }],
    // Public: no authentication on any operation.
    security: [],
    paths: {
      '/addresses': {
        get: {
          operationId: 'findAddress',
          summary: 'Find a Miami-Dade street address',
          description: 'Up to 8 addresses matching the typed text, each with the slug addressReport takes.',
          parameters: [{ name: 'q', in: 'query', required: true, description: 'A street address as typed, e.g. "5410 W 6th Ln".', schema: { type: 'string', minLength: 2, maxLength: 140 } }, lang],
          responses: { '200': result, ...errors },
        },
      },
      '/address-report': {
        get: {
          operationId: 'addressReport',
          summary: 'What the county and city records say about one address',
          // GPT Actions cap an operation's description at 300 characters.
          description:
            'Pickup days and next dates, FEMA flood zone, storm-surge zone, county commissioner, state district numbers, Election Day polling place, schools, nearby places, free bus. Pass slug (from findAddress) or address; an ambiguous address returns candidates.',
          parameters: [
            { name: 'slug', in: 'query', required: false, description: 'An address slug from findAddress, e.g. "5410-w-6-ln-33012".', schema: { type: 'string', maxLength: 120 } },
            { name: 'address', in: 'query', required: false, description: 'A street address, if there is no slug.', schema: { type: 'string', maxLength: 140 } },
            lang,
          ],
          responses: { '200': result, ...errors },
        },
      },
      '/polling-places': {
        get: {
          operationId: 'pollingPlaces',
          summary: 'Election Day polling places by city or precinct',
          description:
            'From the Miami-Dade Supervisor of Elections’ list while its election is upcoming. Says when the election has passed. Early voting uses other sites. Pass city or precinct.',
          parameters: [
            city(false, 'A municipality ("Hialeah", "unincorporated") or a vote-page slug ("unincorporated-district-11").'),
            { name: 'precinct', in: 'query', required: false, description: 'A precinct number, e.g. 318.', schema: { type: 'string', maxLength: 8 } },
            lang,
          ],
          responses: { '200': result, ...errors },
        },
      },
      '/evacuation-zones': {
        get: {
          operationId: 'evacuationZoneSummary',
          summary: 'Storm-surge evacuation zones A–E, for the county or one city',
          description: 'Address counts by zone (and by ZIP code for a city), the county’s zone definitions and guidance.',
          parameters: [city(false, 'A municipality; omit for the whole county.'), lang],
          responses: { '200': result, ...errors },
        },
      },
      '/local-officials': {
        get: {
          operationId: 'localOfficials',
          summary: 'Who governs a Miami-Dade city: mayors and commissioners',
          description:
            'The county mayor, the city’s mayor (with how they are chosen, the official source and the date checked), and the county commissioners for the city. Unincorporated areas have no city mayor.',
          parameters: [city(true, 'A municipality, e.g. "Hialeah", or "unincorporated".'), lang],
          responses: { '200': result, ...errors },
        },
      },
      '/trash-schedule': {
        get: {
          operationId: 'trashSchedule',
          summary: 'Who handles trash pickup in a Miami-Dade city',
          description:
            'Who handles pickup and, where the records hold routes, each zone or day group with its address count. Where a city has no published routes it says so and gives no schedule.',
          parameters: [city(true, 'A municipality, e.g. "Hialeah", "Doral", "unincorporated".'), lang],
          responses: { '200': result, ...errors },
        },
      },
    },
    components: {
      schemas: {
        Source: { type: 'object', properties: { agency: { type: 'string' }, url: { type: 'string', format: 'uri' } }, required: ['agency', 'url'] },
        Result: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            tool: { type: 'string' },
            lang: { type: 'string', enum: ['es', 'en'] },
            text: { type: 'string', description: 'A short answer in lang.' },
            data: { type: 'object', additionalProperties: true },
            sources: { type: 'array', items: { $ref: '#/components/schemas/Source' } },
            fetchedAt: { type: 'string', format: 'date' },
            page: { type: 'string', format: 'uri' },
            error: { type: 'string', enum: ['not_ready', 'not_found', 'ambiguous', 'bad_request'] },
            candidates: { type: 'array', items: { type: 'object', additionalProperties: true } },
          },
          required: ['ok', 'tool', 'lang', 'text'],
        },
        Error: {
          type: 'object',
          properties: { ok: { type: 'boolean' }, error: { type: 'string' }, text: { type: 'string' } },
          required: ['ok', 'error', 'text'],
        },
      },
    },
  }
}
