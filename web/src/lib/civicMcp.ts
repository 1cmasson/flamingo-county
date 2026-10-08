import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  addressReportTool,
  evacuationSummary,
  findAddress,
  localOfficials,
  pollingPlaces,
  toLang,
  trashSchedule,
  type ToolResult,
} from './civicApi'

/**
 * The public civic MCP server: five read-only tools over the same answers
 * the JSON API gives. A new server per request (stateless): nothing is kept
 * between calls, and nothing about a call is logged.
 *
 * Not to be confused with the private HQ server Payload mounts at /api/mcp,
 * which needs an API key and edits drafts.
 */

const LANG = z.enum(['es', 'en']).optional().describe('Answer language: "es" (default) or "en".')

const ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }

/** Every tool answers with the JSON, and the short text first for clients that only read text. */
function reply(result: ToolResult) {
  const sources = result.ok ? `\n\n${result.sources.map((s) => `${s.agency}: ${s.url}`).join('\n')}\nfetchedAt: ${result.fetchedAt}${result.page ? `\n${result.page}` : ''}` : ''
  return {
    content: [
      { type: 'text' as const, text: result.text + sources },
      { type: 'text' as const, text: JSON.stringify(result) },
    ],
    structuredContent: result as unknown as Record<string, unknown>,
    isError: !result.ok && result.error !== 'ambiguous',
  }
}

export const MCP_INSTRUCTIONS =
  'Flamingo County (flamingocounty.com) answers questions about living in Miami-Dade County, Florida, from the county’s, the cities’ and FEMA’s public records: trash, recycling and bulk pickup days, FEMA flood zones, storm-surge evacuation zones, county commissioners, state legislative districts, Election Day polling places, assigned public schools, and the nearest public places. ' +
  'Answers are Spanish by default (lang: "en" for English) and every answer carries its sources and the date the records were read: cite them. ' +
  'Start with find_address when the user gives an address, then address_report with the slug. The tools are read-only, take no location and keep nothing about the asker.'

export function civicMcpServer(): McpServer {
  const server = new McpServer({ name: 'flamingo-county-civic', title: 'Flamingo County · Miami-Dade civic answers', version: '1.0.0' }, { instructions: MCP_INSTRUCTIONS })

  server.registerTool(
    'find_address',
    {
      title: 'Find a Miami-Dade address',
      description:
        'Matches typed text to Miami-Dade County street addresses («5410 W 6th Ln», «5410 w 6 ln 33012»). Returns up to 8 matches, each with the slug address_report takes. Addresses only: never a person or an owner.',
      inputSchema: { query: z.string().min(2).max(140).describe('A street address, as typed.'), lang: LANG },
      annotations: ANNOTATIONS,
    },
    async ({ query, lang }) => reply(await findAddress(query, toLang(lang))),
  )

  server.registerTool(
    'address_report',
    {
      title: 'What the county and city records say about one address',
      description:
        'For one Miami-Dade address: garbage, recycling and bulk pickup days with the next dates (Miami time), FEMA flood zone, storm-surge evacuation zone, county mayor and city mayor, county commissioner, Florida House and Senate district numbers, the Election Day polling place and its source, assigned public schools, the nearest fire station, police, hospital, library and park, the free Hialeah bus when in reach, and the link to the page a person can open. Pass a slug from find_address, or an address (an ambiguous one returns candidates).',
      inputSchema: {
        slug: z.string().max(120).optional().describe('An address slug from find_address, e.g. "5410-w-6-ln-33012".'),
        address: z.string().max(140).optional().describe('A street address, if there is no slug.'),
        lang: LANG,
      },
      annotations: ANNOTATIONS,
    },
    async ({ slug, address, lang }) => reply(await addressReportTool({ slug, address }, toLang(lang))),
  )

  server.registerTool(
    'polling_places',
    {
      title: 'Election Day polling places',
      description:
        'Election Day polling places from the Miami-Dade Supervisor of Elections’ list, by city (each precinct, its site and the other precincts voting there; unincorporated Miami-Dade comes by commission district) or for one precinct. Says when the election has passed. Early voting uses other sites.',
      inputSchema: {
        city: z.string().max(80).optional().describe('A municipality ("Hialeah", "Miami Gardens", "unincorporated") or a vote-page slug ("unincorporated-district-11").'),
        precinct: z.union([z.number().int(), z.string().max(8)]).optional().describe('A precinct number, e.g. 318.'),
        lang: LANG,
      },
      annotations: ANNOTATIONS,
    },
    async ({ city, precinct, lang }) => reply(await pollingPlaces({ city, precinct }, toLang(lang))),
  )

  server.registerTool(
    'evacuation_zone_summary',
    {
      title: 'Storm-surge evacuation zones',
      description:
        'Miami-Dade’s storm-surge evacuation zones A–E, as the county defines them, with address counts for the county, or for one city by zone and ZIP code. Includes the county’s guidance (mobile homes leave with any order; shelters are announced when they open). For one address’s zone use address_report.',
      inputSchema: { city: z.string().max(80).optional().describe('A municipality, or omit for the whole county.'), lang: LANG },
      annotations: ANNOTATIONS,
    },
    async ({ city, lang }) => reply(await evacuationSummary({ city }, toLang(lang))),
  )

  server.registerTool(
    'trash_schedule',
    {
      title: 'Who picks up the trash in a Miami-Dade city',
      description:
        'For one municipality: who handles trash pickup and, where the records hold routes (Hialeah, Miami, the county’s routes), each zone or day group with its address count. Where the city handles pickup without published routes, it says so and gives no schedule. For one address’s days and next dates use address_report.',
      inputSchema: { city: z.string().min(2).max(80).describe('A municipality, e.g. "Hialeah", "Doral", "unincorporated".'), lang: LANG },
      annotations: ANNOTATIONS,
    },
    async ({ city, lang }) => reply(await trashSchedule({ city }, toLang(lang))),
  )

  server.registerTool(
    'local_officials',
    {
      title: 'Who governs a Miami-Dade city',
      description:
        'For one municipality, or "unincorporated": the Miami-Dade County mayor (for every address in the county), the city’s mayor with how they are chosen and the official page it was checked on, and the county commissioners whose districts hold its addresses. Unincorporated areas (Kendall, Westchester, Fontainebleau…) have no city mayor.',
      inputSchema: { city: z.string().min(2).max(80).describe('A municipality, e.g. "Hialeah", "Coral Gables", "unincorporated".'), lang: LANG },
      annotations: ANNOTATIONS,
    },
    async ({ city, lang }) => reply(await localOfficials({ city }, toLang(lang))),
  )

  return server
}
