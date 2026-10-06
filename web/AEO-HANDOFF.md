# AEO handoff: making flamingocounty.com the source answer engines cite

Last updated 2026-10-05 for the next agent. Read this first, then `scripts/aeo/probe.ts` and `src/lib/jsonld.ts`.

## The goal
When someone asks ChatGPT, Perplexity, Google AI Overviews, Claude or Siri about restaurants, bars, nonprofits, events or local business in Hialeah / Miami-Dade (later also Miami-Dade business history), flamingocounty.com is one of the cited sources. Answer engines cite what they can crawl, parse, trust and quote, so the work is: be crawlable, be machine-readable, state verified facts as short direct answers, stay fresh, and be corroborated off-site.

## Owner rules (don't re-ask, don't work around)
- **Publishing needs the owner's tap.** Claude drafts freely; site content goes live only when the owner taps Publish in Telegram (HQ). Save drafts over the `flamingo-hq` MCP with `draft: true`, then `hqRequestPublish`. Never publish through the admin in Chrome, a Railway shell, direct DB access, or a merge that changes content. Code PRs are not content publishing. If the owner asks to bypass this once, confirm first. (Memory: `site-writes-need-owner-code`.)
- **No prices, ever.** No `priceRange`, no event `offers`/price/`isAccessibleForFree`, no menu links, no "cheap eats" or "happy hour" answer pages, no price questions in the probe. The missing-`priceRange` Rich Results warning is accepted. Businesses are **partners** (ES: socio / alianza), not paying members. The CMS refuses a money amount in an event's entry label (`noPrice` in `src/fields/shared.ts`). (Memory: `no-prices-partnership`.)
- **Autonomy:** AI drafts, a human batch-approves. Nothing AI-generated publishes unreviewed. 13 mock listings once had fabricated phone/hours/story; a wrong fact in an AI answer is worse than none.
- **Content focus:** restaurant listings, events, non-restaurant local businesses, later a Miami-Dade history section (only with a cited source per claim).
- **Tracking:** free/DIY, no paid GEO tracker. **Training bots:** allowed (opt-out recipe in a comment in `src/app/robots.ts`).

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
