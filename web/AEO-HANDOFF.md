# AEO handoff: making flamingocounty.com the source answer engines cite

Last updated 2026-10-07 for the next agent. Read this first. **Round 3 (below the owner rules) is the current plan;** the older sections are its background. Then read `scripts/aeo/probe.ts`, `src/lib/jsonld.ts` and, for the civic data, `src/lib/civicSync.ts`.

## The goal
When someone asks ChatGPT, Perplexity, Google AI Overviews, Claude or Siri about restaurants, bars, nonprofits, events or local business in Hialeah / Miami-Dade (later also Miami-Dade business history), **or about living there (trash days, flood and evacuation zones, who represents you, where you vote)**, flamingocounty.com is one of the cited sources. Answer engines cite what they can crawl, parse, trust and quote, so the work is: be crawlable, be machine-readable, state verified facts as short direct answers, stay fresh, and be corroborated off-site.

## Owner rules (don't re-ask, don't work around)
- **Publishing needs the owner's tap.** Claude drafts freely; site content goes live only when the owner taps Publish in Telegram (HQ). Save drafts over the `flamingo-hq` MCP with `draft: true`, then `hqRequestPublish`. Never publish through the admin in Chrome, a Railway shell, direct DB access, or a merge that changes content. Code PRs are not content publishing. If the owner asks to bypass this once, confirm first. (Memory: `site-writes-need-owner-code`.)
- **No prices, ever.** No `priceRange`, no event `offers`/price/`isAccessibleForFree`, no menu links, no "cheap eats" or "happy hour" answer pages, no price questions in the probe. The missing-`priceRange` Rich Results warning is accepted. Businesses are **partners** (ES: socio / alianza), not paying members. The CMS refuses a money amount in an event's entry label (`noPrice` in `src/fields/shared.ts`). (Memory: `no-prices-partnership`.)
- **Autonomy:** AI drafts, a human batch-approves. Nothing AI-generated publishes unreviewed. 13 mock listings once had fabricated phone/hours/story; a wrong fact in an AI answer is worse than none.
- **Content focus:** restaurant listings, events, non-restaurant local businesses, later a Miami-Dade history section (only with a cited source per claim).
- **Tracking:** free/DIY, no paid GEO tracker. **Training bots:** allowed (opt-out recipe in a comment in `src/app/robots.ts`).

## Round 3 (2026-10-07): civic answers, and finishing round 2

### Where things stand (checked live on 2026-10-07)
- **Citations: still the 2026-10-01 baseline, 0/216.** The next probe is due 2026-10-22 to 10-29 (Open items #3 below). Google sent **2 visits in 28 days** (`hqBrief`).
- **Round 2 stalled.** Of 13 listings, only `molinas-ranch` shows "Last verified" and `OpeningHoursSpecification` live. HQ task #30 is "doing", but **no drafts exist for the other ten** (checked with `findListings` with `draft: true`), so it waits on Claude, not on the owner. The likely blocker is the Spanish hours-label snag in Open items #1. No listing has its `answer` copy yet.
- **New since round 2 (PRs #86/#87, live 2026-10-07):**
  - **`/[lang]/address`**, linked from the home page box, TU DIRECCIÓN in the menus and the footer. For any of Miami-Dade's ~613,000 street addresses it shows:
    - trash, recycling and bulk days, with the next dates
    - the FEMA flood zone and the storm-surge zone
    - the county commissioner and the state districts, plus Hialeah's mayor
    - the Election Day polling place and the assigned schools
    - the nearest fire station, police, hospital, library and park
    - a map of eight layers
  - **The data** comes from `src/lib/civicSync.ts`, which builds `/data/civic/civic.db` monthly on the server, never in git. Its tables:
    - `addr`: one row per address, with its zone ids
    - `meta`: the zone tables and the places
    - `tiles`: vector tiles for the map
  - **What isn't crawlable:** single-address pages (`?a=`) are **noindex** on purpose. The search page `/es/address` is in the sitemap, but nothing on it is a citable fact.
  - **`llms.txt` mentions neither the address tool nor the free-rides pages.**
- **No unmerged AEO work exists.** Every `aeo-*` branch is merged, and `admin-hq-link` (#79) was an admin nav change.

### Why civic is the opportunity
These questions are asked daily, in Spanish, and today's answers are buried in city PDFs and map viewers that answer engines can't read. On 2026-10-06 ChatGPT, asked for one Hialeah address's bulk trash day, said the city map "isn't returning the address" and declined. It also sent the asker to a Flamingo stop 24 minutes' walk away, when the free Marlin stopped 7 minutes away. We hold the worked-out answers. What's missing is a page per question that a crawler can read and quote.

### What this round will not do
- **No page per house, ever.** It's a "look up anyone's home" directory and thin content. Single addresses stay noindex.
- **No pages per street (yet).** Tens of thousands of near-identical generated pages, on a site with no citations and most pages still "Discovered, not indexed", is what Google's scaled-content policy targets. A small street experiment can come later, measured (Phase 5).
- **No owner-occupancy data.** The homestead work is an eligibility guide, never a lookup of whether a given address has an exemption (Phase 4).

### Phase 0: measure first (do before shipping any page)
1. Add **25–30 civic questions** to `scripts/aeo/questions.json`.
   - Spanish first, phrased the way people ask: «qué día recogen la basura grande en hialeah», «quién es mi comisionado en miami-dade», «dónde voto en hialeah», «hialeah está en zona de evacuación», «cuál es mi zona de inundación».
   - Add English twins.
   - Give the new ids a `civic-` prefix. Keep reporting the original 23 ids separately, as below.
2. **Run a baseline on only the civic ids now** (`--only` / `--runs 1` keep it cheap) and log it in `docs/aeo-experiments.md` as an experiment: pages changed = the new civic pages, control = listings and events.
3. **Decide the Search Console path for HQ-G2.**
   - Owner action H7 is done, so it's no longer blocked. The `/api/mcp` script route is blocked by Cloudflare, and the third-party Search Console MCPs are unvetted.
   - **Recommendation:** a Google Cloud service account added to the Search Console property as a restricted user, its key in a Railway env var, and `searchanalytics.query` called inside `hqGrowthContext`. It pulls when a `/review` runs, so no cron is needed.
   - **Owner decision (O1).**

**Done when:** the questions are merged, the baseline is logged with its date, and G2 has a decided path (built or scheduled).

### Phase 1: quick wins (one small PR)
- **`llms.txt`:** add the address tool (what it answers and its source agencies), the free-rides hub and route pages, and every page this round creates.
- **JSON-LD on `/address`:**
  - `WebApplication`, with `areaServed` Miami-Dade County. Leave out `isAccessibleForFree` and any `offers`: the "no prices" rule bans those on events, and it's simplest to keep them off every page.
  - `Dataset`, naming the county, city and FEMA sources.
- **Sitemap and IndexNow:** the new URLs, then `pnpm aeo:indexnow`.
- **Finish round 2 #1 (task #30).**
  1. Clear the Spanish `detail.hours[].d` snag: make the seed write Spanish labels, or put them in each ES draft.
  2. Create the ten listing drafts carrying only the four fact fields.
  3. Call one `hqRequestPublish`. Publishing takes the **owner's tap**.

**Done when:**
- `llms.txt` lists the new pages.
- The Rich Results Test is clean on `/en/address`.
- Ten more listings show "Last verified".

### Phase 2: "where to vote" (time-boxed: the election is 2026-11-03)
These pages are only worth it if they're crawled well before Election Day. **Ship by 2026-10-14 or skip until the next election.**
- **Pages:** `/[lang]/vote` plus one page per municipality, and one for unincorporated Miami-Dade split by commission district.
  - Each page is a table: precinct → Election Day polling place (name and address) → the precincts it serves.
  - A map links to the address page's `polling` layer.
- **Copy:** «Esto es para el día de las elecciones; la votación temprana es en otros lugares», linking the Miami-Dade Elections Department.
- **Verify before shipping.** The `PollingPlace_gdb` layer was edited 2026-08-03. Spot-check 10 precincts against the Elections Department's own precinct finder for **this** election. If any differ, the county data is stale: don't ship, and say so.
- **After Nov 3:** show "the 2026-11-03 election is over" and stop claiming the sites are current. Keep the pages for the next election.

**Done when:** the pages are live, in the sitemap and submitted, with 10/10 spot checks matching and the after-election behavior coded.

### Phase 3: civic answer pages (a few dozen, each with data that really differs)
Every page:
- leads with a one-sentence direct answer (the answer-block pattern from #48),
- shows a table of the underlying records, and links the map layer (`/es/address?lens=…`),
- shows "Fuente: <agency> · datos del <fetchedAt>" with links,
- carries `BreadcrumbList` and `WebPage` with `dateModified`,
- uses `FAQPage` **only** where each answer is a sourced record.

**Pages:**
- **Commission districts (13):** the commissioner, the cities and areas in the district, a map, and the source.
- **City civic pages (~34 municipalities, plus unincorporated):**
  - who collects trash (the city or the county)
  - the zone table, where we have one
  - the share of addresses in high-risk flood zones and in each surge zone
  - the number of polling places
  - the fire and police stations
  - the link to the city's own site
- **Storm-surge zones A–E**, and a Hialeah page («¿Hialeah está en zona de evacuación?»: about 10,500 Hialeah buildings are in zones D/E). **Hurricane season ends 2026-11-30**, so ship this before that.
- **Trash zone pages**, only where real schedules exist:
  - Hialeah (garbage, recycling and bulk zones)
  - City of Miami (garbage, recycling, and the 4-Day Plan bulk)
  - County routes, grouped by pickup days. County bulk is by appointment, and county recycling is every other week with no published anchor, so name the day and link the county's lookup. Never invent dates.

**Build notes:**
- Generate the page data in `civicSync.ts` (new `meta` keys or tables) and bump `SCHEMA`.
- Pages read only `civic.db`. **While it's missing, return 503 with Retry-After, never an empty 200.**

**Done when:**
- The pages are live and in the sitemap, with IndexNow submitted.
- The Rich Results Test is clean on one page of each kind.
- The civic probe ids are re-run 4–6 weeks after shipping and logged against Phase 0.

### Phase 4: homestead and senior exemption guide (ship by January; filing closes March 1, the next on 2027-03-01)
- **An eligibility guide, not a lookup.** A few yes/no questions:
  - Do you own it and live there on January 1?
  - Are you 65 or older? Under the year's income limit?
  - Have you lived there 25+ years? Are you a veteran or disabled?
- **Results:** which exemptions to ask about, the March 1 deadline, what to bring, and links to the Property Appraiser's online filing and offices.
- **Figures are read from the Property Appraiser's site** when the guide is built or refreshed, with source and date shown: this year's income limit, the exemption amounts. Never from memory.
- **Spanish first.** It answers «¿cómo aplico al homestead en Miami-Dade?» and «exención para personas mayores Miami-Dade».
- **The county has no open-data layer of exemptions** (searched 2026-10-07). A per-address check would expose whether an owner lives in their house, so there won't be one.

### Phase 5: later, only if Phases 2–3 get crawled and cited
- **A street-page experiment** on one city (Hialeah's main corridors), measured against a control. Kill it if it doesn't earn impressions.
- **Elementary-school zone pages (216).**
- **A public, read-only civic tool for AI agents** (approved, O4): a remote MCP or OpenAPI endpoint over `/api/address/*`, so assistants that can call tools ask us directly. It only exposes what the page already shows, and goes through a privacy review before launch.

### Guardrails for whoever executes this
- **Civic pages are code, not CMS content,** so they ship by PR, not through the owner's Publish tap. But **nothing AI-written ships unreviewed**: page text is built from the records, and any written intro goes through PR review.
- **Privacy:** `ADDRESS_FIELDS` and `PARCEL_FIELDS` in `civicSync.ts` are allowlists. Never add owner, mailing-address, price, value or legal fields. A test checks this.
- **Bump `SCHEMA` on any change to `civic.db`,** so servers rebuild at boot. The first build takes ~10 minutes, during which pages must 503.
- **County layers come from the Open Data `*_gdb` services, by name.** The 311 map service renumbered and dropped its layers on 2026-10-07.
- **Merging:** follow `GROWTH-HANDOFF.md`. Re-check `main` right before merging, `gh pr merge --match-head-commit`, and confirm Railway deployed that SHA. Other agents merge in parallel.
- **Copy:** Spanish quotes are « », English uses " ". Spanish first. Use "guagua" for bus in Hialeah copy.
- **State legislators:** the county's House and Senate layers date from 2022. Show the district and link the Legislature's lookup, never the name.

### Owner decisions (answered 2026-10-07)
| # | Decision | Answer |
| --- | --- | --- |
| O1 | Search Console access for HQ-G2 | **Not working yet.** The owner believed it was connected. On 2026-10-07 the local `gcloud` login returned 403 "insufficient authentication scopes" for the Search Console API. Next step: the owner runs `gcloud auth application-default login --scopes=https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/cloud-platform` (read-only, for local sessions). For HQ-G2 on the server, the service account below is still the plan. |
| O2 | Ship "where to vote" pages before Nov 3 | **Go**, if the 10 spot checks pass by 2026-10-14 |
| O3 | Tap Publish on the ten listing-fact drafts once sent | **Yes** |
| O4 | A public civic tool for AI agents | **Yes, approved.** It still comes after Phases 2–3, and needs its own privacy review: expose only what `/address` already shows, and never accept or log anything about the person asking. |
| O5 | A Cloudflare cache rule for `/api/tiles/*` (respect origin headers) | **Yes.** It's a Cloudflare dashboard change. Claude can do it in the owner's Chrome, with confirmation before saving. |

### Order and dates
| When | What |
| --- | --- |
| Now | Phase 0, then Phase 1 |
| By 2026-10-14 | Phase 2 (where to vote), or skip it |
| 2026-10-22 to 10-29 | Re-run the probe (Open items #3), including the civic baseline ids |
| By 2026-11-15 | Phase 3, surge pages first (hurricane season ends Nov 30) |
| January | Phase 4 |
| After 4–6 weeks of data | Decide on Phase 5 |

## What is live (all merged to main and deployed, 2026-10-01)
- **Foundations (#17):** `robots.ts`, `sitemap.ts` (EN/ES hreflang, real `lastmod`, published content only via `lib/data.ts`), `llms.txt`, JSON-LD (`src/lib/jsonld.ts` + `src/components/JsonLd.tsx`), OpenGraph helpers in `src/lib/site.ts` (pages must use `openGraph()`/`twitterCard()`: Next shallow-merges `openGraph`), AI traffic log (`logAiTraffic` in `src/proxy.ts`, one JSON line per AI bot hit or AI referral in Railway logs), IndexNow (hooks on listings/events/stories/cities, skips drafts; bulk `pnpm aeo:indexnow`).
- **Drafts (#20):** listings, events, weekly events, stories and spotlights have Payload drafts. New fields go in migrations after the latest one, and the version tables (`_listings_v`, `_events_v`) need the same fields (Payload generates that).
- **Listing facts (#27):** `detail.openingHours` (days + HH:mm), `detail.hoursSource`, `lastVerifiedAt` + `verifiedBy`. JSON-LD emits `openingHoursSpecification` **only at `hoursConfidence === 'high'`** (4 listings: molinas-ranch, polo-norte, cancun-grill, dr-limon-ceviche-bar). Listing `sameAs` now includes the website (stored as a bare host, given `https://`).
- **Event facts (#30):** `endDate` (multi-day), `placeAddress`, `organizer` (listing) or `organizerName`/`organizerUrl` (falls back to the venue's listing), `eventStatus` with a visible CANCELLED / POSTPONED / NEW DATE chip. A night past midnight (9PM–1AM) ends the next day in both JSON-LD and the `.ics`. `postalAddress()` keeps "Suite 40" in the street.
- **No prices / partners (#28):** copy says PARTNERSHIP / PARTNER; price data stripped from `data-import/listings.json` and `fc-data.js`.
- **Question bank (#26):** 153 questions (86 EN / 67 ES) in `scripts/aeo/questions.json`; experiments log in `docs/aeo-experiments.md`.
- **Direct answers (#48) and stranded fixes (#46), 2026-10-05:** question + answer block, visible breadcrumbs, "Last verified" (listings), `WebPage` JSON-LD with `dateModified`, localized listing `answer` field (migration `20261006_013746_add_listing_answer`); city names typed as URLs (`/en/little-havana`) 308 to the short slug; body background `--ink` for the iOS overscroll.
- **Gala (event id 2):** English title "Friendship & Recognition Gala" + English description, venue address and the Club de la Amistad (listing id 13) as organizer, all published via HQ (owner's taps, requests #1 and #2). Seed (`src/seed/real-events.ts`) matches, so a re-seed won't revert it.

## Open items, in priority order
1. **Production has none of #27's listing data yet (0/13 listings have `openingHours`/`lastVerifiedAt`, checked 2026-10-05).** **Never run the full `pnpm seed` on production.** It rewrites far more than listings: it prunes categories, upserts events, stories, cities and media, and rewrites `site-settings`, `about-page` and `list-your-spot-page`. On 2026-10-05 it would also have set an organizer on the live Casa Marín event. The plan instead: one HQ draft per researched listing carrying ONLY `lastVerifiedAt`, `verifiedBy`, `detail.openingHours` and `detail.hoursSource` (values taken from a fresh local seed, so production matches `listings.json`), then `hqRequestPublish` and the owner's tap. Start with `molinas-ranch` as a canary, check it live, then the other 10; leave `casa-marin` and `el-club-de-la-amistad` (hand-authored, no dossier date). Rehearsed end to end on a scratch DB on 2026-10-05: a draft with only those keys keeps every other field (EN and ES), publishing works even though ES `hours[].d` is empty, and `restoreVersion` to the prior published version puts the listing back exactly. That is the undo. The #50 wording changes to `research.blockingGaps` / `hoursConflicts` are a separate, optional round.
2. **Direct-answer blocks: code live 2026-10-05 (#48, with #46's two stranded casa-marin fixes); copy still to write.** #48 added the question + answer block, "Last verified" (listings only), visible breadcrumbs, a `WebPage` node carrying `dateModified`, and a localized `answer` field on listings. Event answers are composed from structured fields. Listing answers are **authored**, never templated from research: cuisine and dishes are English-only and founding years carry attribution notes. Until written, a ~15-word fallback shows (name, category, city, street). **Order:** the owner runs item #1's seed (still not done on 2026-10-05: 0/13 production listings have `lastVerifiedAt`, so no "Last verified" line shows yet) (it skips listings with a pending draft) → save EN **and** ES `answer` drafts over HQ, then one `hqRequestPublish` (an EN-only answer falls back to English on `/es`). **Snag:** saving the `es` locale of a listing with display hours fails (`Detail page > Hours n > D`): `detail.hours[].d` is localized and required, and the seed writes English only (which is also why Spanish pages print "Sun, Mon"). 9 of 13 listings have hours. Either include Spanish day labels in each ES draft or make the seed write them first. A published `answer` survives a re-seed (checked on a scratch DB).
3. **Re-run the probe ~2026-10-22 to 10-29** (3–4 weeks after deploy). `cd web && pnpm aeo:probe`. Report the **23 original ids** (the first 24 minus `cheap-eats-hialeah`) against the baseline separately from the new ones. A full 153-question run is ~1,400 calls, about $7–36; `--runs 1` or `--only <model>` is cheaper. Log it in `docs/aeo-experiments.md`. Also re-check Bing **AI Performance** (baseline 0 citations, Jun 30–Sep 29).
4. **Phase B, rest:** localized `faqs[]` per listing (FAQPage JSON-LD only for sourced answers); `neighborhood` relation + `Neighborhoods` collection; cuisine/category hub pages (`/{lang}/{city}/cuisine/{slug}`); listing `lat/lng` only from a mechanical source (e.g. the free US Census geocoder) with the source recorded. Never copy `seo.json_ld` from `data-import/listings.json` (it emits hours below `high`).
5. **Answer pages** from our own data ("late-night food in Hialeah", "things to do in Hialeah this weekend", "best cafecito in Hialeah"). No price-based pages.
6. **Content pipeline**, scripts under `scripts/aeo/`: discover (Google Places API, public event pages) → verify mechanically against ≥2 sources → draft with Claude (structured output, "unknown" instead of inference, EN+ES) → QA gate (JSON-LD validity, no unsourced fields, EN/ES parity, duplicates) → HQ drafts + weekly digest for the owner's taps. Monthly re-verification of hours/phone/closed. Owner-claim flow via `ListingRequests`. **Blocked on the owner's Google Places budget decision.**
7. **Off-site authority** (the owner's to do, drives many citations): Google Business Profile for Flamingo County, Wikidata entries, local press/newsletters, genuine Reddit participation, partners linking to their page, consistent name/address/phone.
8. **Search Console / Bing data on a schedule.** Candidate MCPs (unvetted; read the source, pin a version, read-only scopes, env vars): `saurabhsharma2u/search-console-mcp`, GrowthLever `gsc-mcp`, the Bing Webmaster Tools MCP.
9. **Caching.** Public pages are `force-dynamic` on SQLite with no CDN cache. ISR needs `[lang]/layout.tsx` to stop reading the session per request first. Revisit when crawler load shows in the logs.
10. `proxy.ts` sends header-less crawlers to `/es`; home's `x-default` is `/es`. Watch that English pages get indexed.

## Measurement
- **Baseline 2026-10-01** (before any of this deployed): cited 0/216 across `perplexity/sonar`, `openai/gpt-4.1:online`, `anthropic/claude-sonnet-4.5:online` (24 questions x 3 runs). "Mentioned" 3/72 each. Most-cited instead: tripadvisor, theinfatuation, miamiandbeaches, yelp, restaurantji, ubereats, miaminewtimes, miamiherald.
- Baseline file: `~/Documents/dev-projects/flamingo-county-aeo-results/2026-10-01T14-17-28-905Z.jsonl` (outside every checkout; `scripts/aeo/results/` is gitignored).
- Caveat: for the `:online` models OpenRouter runs its own search plugin, so only Perplexity searches natively. Treat results as a before/after trend line, and spot-check the real apps by hand.

## Status of the consoles (2026-10-01)
- **Google Search Console:** Domain property verified (carlosmasson96@gmail.com). Sitemap: **Success, 46 pages**. Indexing requested for both Gala pages; Google listed them as "Discovered – currently not indexed", likely true of most pages on a new site. Check the Pages report in a week or two.
- **Bing Webmaster Tools:** imported from Search Console. Sitemap: **Success, 46 URLs**. AI Performance: **0 citations** (Jun 30–Sep 29), the Copilot baseline.
- **Rich Results Test:** listing (`/en/hialeah/morro-castle`): Breadcrumbs, Local business, Organization valid. Event (Gala): Breadcrumbs + Event valid; the organizer, status and address warnings were fixed in #30; `offers`/`performer` stay missing by design. City (`/en/hialeah`): Breadcrumbs + Carousel valid.

## Accounts and infrastructure
- **Railway:** project `satisfied-vitality`, env `production`, service `flamingo-county`. The main checkout `~/Documents/dev-projects/flamingo-county` is linked (`railway status`, `railway deployment list`, `railway variable list --kv`). Deploys run `payload migrate && auth:migrate` at boot; each switchover gives a few seconds of 502. `INDEXNOW_KEY` = `d817a4a96c78cb68708d68dedcbc7aad` (public by design).
- **DNS is Cloudflare**, not GoDaddy (README table is stale). Keep the `google-site-verification` TXT record.
- **OpenRouter:** key rotated 2026-10-01, name `flamingo-county-aeo-probe`, $50 limit. Stored in **macOS Keychain** (service `flamingo-county-openrouter`) and in the `danio` worktree's gitignored `web/.env.local`. Restore into a new worktree without printing it: `echo "OPENROUTER_API_KEY=$(security find-generic-password -a "$USER" -s flamingo-county-openrouter -w)" >> web/.env.local`. Never print, commit or paste it. (Memory: `openrouter-key-keychain`.)
- **flamingo-hq MCP** (`https://flamingocounty.com/api/mcp`, user scope in `~/.claude.json`): if it was added after a session started, its tools won't load until a restart. The same endpoint answers plain JSON-RPC over HTTP with the configured bearer header; send a normal `User-Agent` (Python's default gets a 403 at the edge). The server enforces drafts-only either way.

## Gotchas (things that cost time)
- **This is Next 16.** Read `node_modules/next/dist/docs/` before writing Next code (`AGENTS.md`).
- Fresh worktree: `pnpm install --frozen-lockfile`.
- **Local site on a scratch DB:** export `DATABASE_URL=file:<tmp>/x.db`, `PAYLOAD_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=http://localhost:3100`, `PAYLOAD_ADMIN_EMAIL`, `PAYLOAD_ADMIN_PASSWORD`; from an EMPTY db run `pnpm seed`, `pnpm auth:migrate`, `pnpm dev -p 3100` (another worktree usually holds :3000). To test migrations instead: `payload migrate` on an empty db, then seed/verify with `NODE_ENV=production` (dev mode tries a schema push and fails with "index already exists").
- `pnpm test:int` needs those env vars and a **seeded** DB (the search tests read real rows).
- `SEED_MOCK_CONTENT=1` seeding fails on main with a Category validation error (pre-existing, unrelated).
- Two branches that each add a Payload migration from the same snapshot leave the snapshot chain inconsistent. Stack them, or regenerate the second after the first lands.
- `prettier --write` reformats untouched lines here (the repo isn't prettier-clean); format only what you wrote.
- Browser consoles need the owner signed in; never enter credentials. Confirm OAuth/consent clicks with the owner. Close the tabs you open.

## How to verify after a deploy
```bash
for p in sitemap.xml robots.txt llms.txt d817a4a96c78cb68708d68dedcbc7aad.txt; do echo "$p $(curl -s -o /dev/null -w '%{http_code}' https://flamingocounty.com/$p)"; done
curl -s https://flamingocounty.com/en/hialeah/molinas-ranch | grep -o '"@type":"OpeningHoursSpecification"' | wc -l   # 2 once prod is re-seeded
curl -s https://flamingocounty.com/en/events/gala-de-la-amistad-2026 | grep -o '"organizer":{[^}]*}'
cd web && INDEXNOW_KEY=d817a4a96c78cb68708d68dedcbc7aad pnpm aeo:indexnow   # bulk resubmit after big content changes
```
Rich Results Test: `https://search.google.com/test/rich-results?url=<page url>`.

## Related memory notes
`site-writes-need-owner-code`, `no-prices-partnership`, `openrouter-key-keychain`, `flamingo-county-live`, `flamingo-county-payload-cms`, `flamingo-county-fabricated-detail`, `e2e-port-3000-collision`, `flamingo-hq-ops-layer`.
