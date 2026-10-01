# AEO handoff: making flamingocounty.com the source answer engines cite

Written 2026-10-01 for the next agent. Read this first, then `scripts/aeo/probe.ts` and `src/lib/jsonld.ts`.

## The goal
When someone asks ChatGPT, Perplexity, Google AI Overviews, Claude or Siri about restaurants, bars, nonprofits, events or local business in Hialeah / Miami-Dade (later also Miami-Dade business history), flamingocounty.com is one of the cited sources. Answer engines cite what they can crawl, parse, trust and quote, so the work is: be crawlable, be machine-readable, state verified facts as short direct answers, stay fresh, and be corroborated off-site.

## Decisions the user made (don't re-ask)
- **Autonomy:** AI drafts, a human batch-approves (weekly). Nothing AI-generated publishes unreviewed. Reason: 13 mock listings once had fabricated phone/hours/story; wrong facts in AI answers are worse than none.
- **Content focus:** restaurant listings, events, non-restaurant local businesses, and later a Miami-Dade history section (they have no history content yet).
- **Tracking:** free/DIY. No paid GEO tracker for now.
- **Training bots:** allowed (visibility is the goal). Opt-out recipe is in a comment in `src/app/robots.ts`.

## Done (PR #17, merged to main 2026-10-01, deployed on Railway)
- `src/app/robots.ts`, `src/app/sitemap.ts` (EN/ES hreflang alternates, real `lastmod`, skips `unsourced` listings), `src/app/llms.txt/route.ts` (generated from the DB).
- JSON-LD: `src/lib/jsonld.ts` + `src/components/JsonLd.tsx`. Organization/WebSite site-wide; Restaurant/BarOrPub/NGO + BreadcrumbList on listings; Event on events; ItemList on city pages. **Only fields the record actually stores are emitted**: no rating (authored design values), no hours (free text), no price (ever; see below). Category slugs are `food`, `night`, `nonprofit`.
- OpenGraph/Twitter via `openGraph()`/`twitterCard()` in `src/lib/site.ts`. Pages must use these helpers: Next shallow-merges `openGraph`, so a page that sets its own loses the layout's siteName/image.
- AI traffic log: `src/proxy.ts` `logAiTraffic` writes one JSON line (`{"aeo":"bot"|"referral",...}`) per AI crawler hit or AI-referred visit to stdout (Railway logs). No IPs/cookies. Referrers are undercounted (several assistants strip them).
- IndexNow: key file at `/<INDEXNOW_KEY>.txt` (rewrite in `next.config.ts` -> `src/app/indexnow/[key]/route.ts`), `afterChange`/`afterDelete` hooks on listings/events/stories/cities (`src/lib/indexnow.ts`), bulk script `pnpm aeo:indexnow`. Pings only when `INDEXNOW_KEY` is set AND `NODE_ENV=production`.
- Probe: `pnpm aeo:probe` (see below). 24-question EN/ES bank in `scripts/aeo/questions.json`.
- Tests: `tests/int/jsonld.int.spec.ts`, `tests/int/indexnow.int.spec.ts`.

## Progress since the handoff (2026-10-01, later)
- **The HQ stack (#16 -> #18 -> #19 -> #20) merged to main 2026-10-01.** #20 added Payload drafts to listings/events/stories/spotlights/weekly-events, so drafts are done; drop them from Phase B. Its migration rebuilt those tables; new fields go in migrations after `20261001_170211_add_site_drafts`, and draft versions (`_listings_v`, `_events_v`) need the same fields.
- #20 already routes the sitemap and llms.txt through `lib/data.ts`, which filters to `published`. No separate fix needed.
- **Phase B, part 1** (PR #27, branch `1cmasson/aeo-listing-facts`, on main): structured `detail.openingHours` + `detail.hoursSource`, `lastVerifiedAt` + `verifiedBy`, importer mapping, `openingHoursSpecification` at `high` confidence only (4 listings: molinas-ranch, polo-norte, cancun-grill, dr-limon-ceviche-bar). Production gets the data only when the owner re-runs `pnpm seed` on Railway (prod matched a fresh seed exactly on 2026-10-01, so that's safe; re-check if listings are edited in the admin first). The seed never overwrites an existing `lastVerifiedAt`.
- **Event facts** (branch `1cmasson/aeo-event-facts`, stacked on #27): `endDate` (multi-day), `placeAddress`, `organizer` (listing) / `organizerName` / `organizerUrl`, `eventStatus` with a visible CANCELLED / POSTPONED / NEW DATE chip. JSON-LD and the .ics both end a past-midnight night on the next day (both used to end it before it started). Rich Results on the Gala flagged missing `organizer`, `eventStatus` and a street address: all fixed. Production needs the Gala's `placeAddress` + `organizer` saved as an HQ draft and published after this deploys.
- **2026-10-01:** Gala EN title/description published via HQ (owner's tap); indexing requested in Search Console for both Gala pages. Google had them as "Discovered – currently not indexed", likely true of most pages on a new site.
- **OWNER RULE: no prices, ever.** No `priceRange`, no event `offers`/price/`isAccessibleForFree`, no menu links, no "cheap eats" answer pages, no price questions in the probe. Businesses are **partners**, not paying members (PR #28 renamed the copy and stripped price data from `data-import/listings.json` and `fc-data.js`; the CMS refuses a money amount in an event's entry label). The missing-`priceRange` Rich Results warning is accepted.
- `data-import/listings.json` `seo.json_ld` must not be copied: it emits hours at `medium` confidence (1910) and its `servesCuisine` differs from the record's `cuisine`.
- Baseline results backed up to `~/Documents/dev-projects/flamingo-county-aeo-results/` (outside every checkout).
- Question bank: PR #26 grows it to 153 (price questions removed) and adds `docs/aeo-experiments.md`. Compare against the baseline on the 23 remaining original ids.
- The `casa-marin` worktree edits the business and city pages and `lib/data.ts`. Hold the direct-answer blocks (item 3) until it lands.

## Accounts and infrastructure (verified, not assumed)
- **Railway:** project `satisfied-vitality`, env `production`, service `flamingo-county`. The main checkout `~/Documents/dev-projects/flamingo-county` is linked; this worktree is not. `railway variable list --kv` from the main checkout works. `INDEXNOW_KEY` = `d817a4a96c78cb68708d68dedcbc7aad` (public by design) is set.
- **DNS is Cloudflare** (nameservers jill/ruben.ns.cloudflare.com), not GoDaddy; the README's GoDaddy table is stale. Existing TXT records: Zoho verification + SPF (leave alone). A `google-site-verification=...` TXT was added by Google's Domain Connect flow. **Do not remove it** or Search Console un-verifies.
- **Google Search Console:** Domain property `flamingocounty.com` verified (carlosmasson96@gmail.com). Sitemap `https://flamingocounty.com/sitemap.xml` submitted 2026-10-01; status was "Couldn't fetch" immediately after (normal for a first fetch; the file is valid, 200, `application/xml`). **Check it flipped to Success.** For a Domain property, the sitemap field needs the full URL, not `sitemap.xml`.
- **Bing Webmaster Tools:** site imported from Search Console (read-only Google grant given to Bing, revocable at myaccount.google.com/permissions). Sitemap submitted, "Processing". Bing has a beta **"AI Performance"** report in the sidebar that has not been opened yet; it may show Copilot/Bing AI citations, which is exactly the metric we want.
- **Rich Results Test** on `/en/hialeah/morro-castle`: 3 valid items (Breadcrumbs, Local business, Organization); one non-critical warning, missing optional `priceRange` (accepted: the site publishes no prices). Event and city pages not yet tested.
- **OpenRouter:** key (cap $50) is in `web/.env.local` (gitignored). It was pasted into a chat transcript, so recommend rotating it. The probe reads it from env or that file. Never commit or print it.

## Measurement
- **Baseline taken 2026-10-01 before the changes had deployed:** cited 0/216 across `perplexity/sonar`, `openai/gpt-4.1:online`, `anthropic/claude-sonnet-4.5:online` (24 questions x 3 runs). "Mentioned" 3/72 each (the entity questions). Most-cited instead: tripadvisor, theinfatuation, miamiandbeaches, yelp, restaurantji, ubereats, miaminewtimes, miamiherald.
- File: `scripts/aeo/results/2026-10-01T14-17-28-905Z.jsonl`. The results dir is **gitignored**; it exists only in this worktree. Back it up or decide to track it before the worktree is removed.
- **Caveat:** for the `:online` models OpenRouter runs its own search plugin (GPT and Claude returned identical source sets; `exa.ai` shows up as a source). Only Perplexity searches natively. So results are a consistent trend line for before/after, not a copy of what the consumer apps show. Spot-check the real apps by hand occasionally.
- **Re-run ~3-4 weeks after deploy** (engines need time to re-crawl): `cd web && pnpm aeo:probe`, compare `cited` rate per model against 0%. Run each question several times; answers vary run to run. About $0.005-0.025 per call, ~$4-5 for a full run.

## Open items, in priority order
1. **Check Search Console sitemap status** (should say Success), and Bing's. Test an event page and a city page in the Rich Results Test. Open Bing "AI Performance".
2. **Phase B: schema and content model** (Payload migrations): listing `lat/lng` (only from a mechanical source such as the free Census geocoder, with the source recorded), ~~structured `openingHours`~~ and ~~`lastVerifiedAt` + `verifiedBy`~~ (done in #27; still to do: show "last verified" on the page and use it for `dateModified`), localized `faqs[]`, `neighborhood` relation, `sameAs[]`; new `Neighborhoods` collection and cuisine/category hub pages (`/{lang}/{city}/cuisine/{slug}`); ~~event `endDate`, organizer, address for place venues, `eventStatus`~~ (done in the event-facts PR, stacked on #27; no price ever). Then emit FAQPage in JSON-LD **only for sourced values**. Don't copy `seo.json_ld` from `data-import/listings.json`: it emits hours below `high` confidence.
3. **Direct-answer blocks**: each page opens with a 40-60 word answer, question-shaped headings, a visible "last verified" line, breadcrumbs.
4. **Content pipeline (Track 2)**, scripts under `scripts/aeo/`: discover candidates (Google Places API, public event pages) -> verify facts mechanically against >=2 sources (no LLM guessing; low confidence stays `needs_owner_confirmation`) -> draft with Claude (structured output, "unknown" instead of inference, EN+ES) -> automated QA gate (JSON-LD validity, no unsourced fields, ES/EN parity, duplicates) -> unpublished drafts + one weekly digest for human batch approval -> publish, IndexNow, revalidate. Monthly re-verification of hours/phone/closed status. Owner-claim flow extending `ListingRequests` to turn `needs_owner_confirmation` into first-party facts. Needs Google Places API budget (not decided).
5. **Answer pages** from our own data ("best cafecito in Hialeah", "late-night food in Hialeah", "things to do in Hialeah this weekend"). Miami-Dade history section later, only with cited sources per claim.
6. **Off-site authority** (mostly manual, drives a lot of citations): Google Business Profile for Flamingo County, Wikidata entries, local press/newsletters, genuine Reddit (r/Miami, r/hialeah) participation, businesses linking back to their page, consistent name/address/phone everywhere.
7. **Search Console / Bing data pull on a schedule.** Candidates found by search (not vetted, review the source and pin a version before installing; they hold OAuth tokens): `saurabhsharma2u/search-console-mcp` (GSC + Bing + GA4, MIT), GrowthLever `gsc-mcp` (read-only), the Bing Webmaster Tools MCP (needs `BING_WEBMASTER_API_KEY`). Use read-only scopes, env vars not config files.
8. **Question bank**: expand from 24 to 100-200 using Search Console queries, People Also Ask, Reddit. Add an experiments log (`docs/aeo-experiments.md`): change one thing on a subset of pages (FAQ block, direct-answer intro, JSON-LD) and compare against untouched control pages for 4-6 weeks.
9. **Caching.** Every public page is `force-dynamic` with SQLite and no CDN cache; heavy crawling could strain it. ISR was deliberately skipped in PR #17 because `[lang]/layout.tsx` reads the signed-in session per request, so it needs that restructured first. Revisit when crawler load shows in the logs.
10. `proxy.ts` sends header-less crawlers to `/es` (default). Home sets `x-default` -> `/es`. Check English pages are being indexed.

## Gotchas (things that cost time)
- **This is Next 16, not the Next you know.** `AGENTS.md` says to read `node_modules/next/dist/docs/` before writing code. Metadata routes (`robots.ts`, `sitemap.ts`) are documented under `01-app/03-api-reference/03-file-conventions/01-metadata/`.
- A fresh worktree has no `node_modules`: `pnpm install --frozen-lockfile`.
- **Local site against a seeded scratch DB** (no repo DB exists): export `DATABASE_URL=file:<tmp>/x.db`, `PAYLOAD_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=http://localhost:3100`, `PAYLOAD_ADMIN_EMAIL`, `PAYLOAD_ADMIN_PASSWORD`; then from an EMPTY db file run `pnpm seed` (dev schema push creates the tables), then `pnpm auth:migrate`, then `pnpm dev -p 3100`. Do not run `payload migrate` first: the dev push then fails with "index already exists". Port 3100 because another worktree usually holds :3000.
- `pnpm test:int` fails two DB tests with "missing secret key" unless those env vars are exported. With them: 81/81 pass.
- `pnpm build` against an empty/unmigrated DB fails in `generateStaticParams` of existing pages (stories, city). Build against a seeded DB, as above. New routes are `force-dynamic` and don't touch the DB at build.
- Seed data: 13 real researched listings (4 `ready`, 9 `needs_owner_confirmation`), 3 cities (`havana`, `lakes`, `hialeah`), 2 events, 0 stories. City names are stored in caps ("MIAMI LAKES"); use `titleCase()` from `jsonld.ts` for structured data. Don't import the old mock listings (see memory note on fabricated detail).
- The Railway deploy runs `payload migrate && auth:migrate` in `docker-entrypoint.sh`. A new Payload collection/field needs a migration file in `src/migrations`.
- Browser-driven consoles (Search Console, Bing, Cloudflare consent) need the user signed in; never enter credentials. OAuth/consent grants (Cloudflare Domain Connect, Bing<-Google) were each confirmed with the user before clicking. Keep doing that. Chrome tabs opened for this were closed.

## How to verify changes after deploy
```bash
for p in sitemap.xml robots.txt llms.txt d817a4a96c78cb68708d68dedcbc7aad.txt; do echo "$p $(curl -s -o /dev/null -w '%{http_code}' https://flamingocounty.com/$p)"; done
curl -s https://flamingocounty.com/en/hialeah/morro-castle | grep -o '"@type":"[A-Za-z]*"' | sort -u
# bulk resubmit after big content changes:
cd web && INDEXNOW_KEY=d817a4a96c78cb68708d68dedcbc7aad pnpm aeo:indexnow
```
Rich Results Test: `https://search.google.com/test/rich-results?url=<page url>` (works signed in via the browser tools).

## Related memory notes
`flamingo-county-live` (Railway hosting), `flamingo-county-payload-cms` (web/ is the live site), `flamingo-county-fabricated-detail`, `e2e-port-3000-collision`.
