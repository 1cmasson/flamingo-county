# Civic tools for AI agents: privacy and abuse

The public, read-only civic tools are approved by the owner (AEO round 3, decision O4). This note is the privacy review they needed before launch. It covers what they expose, what they keep, and how abuse is limited.

## What there is
| Surface | URL | Notes |
| --- | --- | --- |
| MCP server | `https://flamingocounty.com/mcp` | Streamable HTTP, stateless, no auth. POST only (GET returns a description). Tools: `find_address`, `address_report`, `polling_places`, `evacuation_zone_summary`, `trash_schedule`. |
| JSON API | `https://flamingocounty.com/api/civic/v1/…` | GET `addresses`, `address-report`, `polling-places`, `evacuation-zones`, `trash-schedule`. |
| OpenAPI 3.1 | `https://flamingocounty.com/api/civic/v1/openapi.json` | For ChatGPT Actions and other OpenAPI clients. |
| How to connect | `/es/ai`, `/en/ai` | Indexable, in the sitemap and `llms.txt`. |

**Not the HQ server.** Payload's private HQ server is `/api/mcp`: it needs a key and it edits drafts. The public server is a different route (`src/app/mcp/route.ts`) and shares no code, tools or credentials with it.

## What an answer may contain
**Only what `/address` already shows a person.** All five tools are built on the same functions as the pages: `src/lib/civicApi.ts`, over `civic.db`.
- **The address list.** `ADDRESS_FIELDS` and `PARCEL_FIELDS` in `civicSync.ts` are allowlists, and they are unchanged. The database never holds an owner, a mailing address, a sale price, a value or a legal description, so no tool can return one.
- **No coordinates, in either direction.**
  - No tool takes a location. The address page's "use my location" (`/api/address/near`) is deliberately left out, so an assistant can't be used to work out where a person is.
  - Answers carry no latitude or longitude for the address. Nearby places come as a name, an address and a walking distance, as on the page.
- **No state legislators' names.** The county's House and Senate layers date from 2022, so only the district numbers are given, with the Legislature's lookup links.
- **No invented schedules.** Where a city handles pickup without published routes, the answer says so and gives no days.
- **Every answer carries its sources** (agency and URL), `fetchedAt` (the day the records were read) and, where there is one, the page a person can open.
- **No prices** anywhere.

## What we keep about a request: nothing
- **No logging of query contents.** No addresses, slugs, typed text, cities or precincts.
  - The routes contain no `console` calls.
  - `proxy.ts`, whose AI-traffic log records a path, doesn't run on `/api/*` or on `/mcp`.
  - A test spies on `console` while every tool runs and fails if an address string appears.
- **No storage.** No cookies, no accounts, no sessions (the MCP server is stateless), no database writes.
- **No caching of answers.** Responses send `Cache-Control: no-store`, so an address in a query string never sits in Cloudflare's or a browser's shared cache. The OpenAPI document holds no query and is cacheable.
- **Rate limiting.** The limiter (`src/lib/civicApiHttp.ts`) keeps, per client address and tool, a count and the start of the current minute, in memory only. The key is dropped once its minute is over. No query text goes into it.
- **Counters.** None for now. If any are added, they hold the tool name and the day, never a query.

**What we can't control.** Railway's and Cloudflare's own edge logs may record request URLs, and on the JSON API an address arrives in the URL's query string. The MCP server takes its arguments in the POST body, which those logs don't record. If that matters for a client, use MCP.

## Abuse
- **Rate limits.** They are a soft control, counted per server process. The key is Cloudflare's `CF-Connecting-IP`, or else the last `X-Forwarded-For` hop (the one our proxy appends, never the client-written first hop). That assumes Cloudflare is in front: a client that reaches the Railway origin directly can vary those headers. The limits:
  - 60 requests a minute per client and tool, on both surfaces;
  - 300 a minute per client for the MCP endpoint as a whole, which covers initialize and tools/list;
  - past the limit, **429** with `Retry-After`.
- **Bounded input.** Queries are capped at 140 characters, and every tool runs against the in-memory database with indexed lookups. A tool returns at most 8 address matches, never a list of addresses.
- **No enumeration.** There is no "all addresses on a street" or "near this point" tool. The only lists are per city: precincts, zones and ZIP codes, as the public pages show them.
- **Data still building.** While `civic.db` is missing or in an older layout (`civicCurrent()`), tool calls answer **503** with `Retry-After: 600`, as the pages do.
- **CORS** is open (`*`) for GET and for POST to `/mcp`. Nothing depends on cookies, so there is no session to ride.
- **Indexing.** API responses send `X-Robots-Tag: noindex, nofollow`. Only `/[lang]/ai` is meant for search engines.

## Review checklist for future changes
- [ ] A new tool or field shows nothing `/address` doesn't already show.
- [ ] Nothing takes or returns coordinates.
- [ ] No `console` call or store touches a query. The "no address strings logged" test still passes, and it covers the new tool.
- [ ] The new tool is rate-limited and in `TOOL_NAMES`.
- [ ] `ADDRESS_FIELDS` and `PARCEL_FIELDS` are unchanged, or reviewed against the privacy test in `tests/int/civic.int.spec.ts`.
