# Growth handoff: where Flamingo County stands, and what to do next

Written 2026-10-05. **Start here.** This supersedes the "Where things stand" section of
`web/HQ-HANDOFF.md`, and that file's still-open PR #44. Read this, then `web/HQ.md`
(how HQ works) and `web/hq/growth-review.md` (how the growth review runs).

## The goal

**The goal is traffic: more people from Miami-Dade reading flamingocounty.com.** Organic first,
small paid boosts later. Then more verified restaurant listings, then businesses paying for a
spotlight. Spotlights are sold privately and are never priced on the site.

**The strategy:** quality, grounded, hyper-local content, Spanish-first. Win Hialeah first, on
Facebook and in Spanish search; history is the hook people share, and restaurants are the
partners who spread it.

**The campaign plan** ("Taking Hialeah", a Claude doc):
https://claude.ai/artifact/XQbxCymr3HmVtiifQAcGDF
It holds the four campaigns, the 30-day timeline, the partner outreach kit and the history story
bank.

## Owner decisions (don't re-ask)

- **No cron or scheduled runs for reviews.** The owner sends `/review` in Telegram, which files a
  task titled `Growth review (asked <date>)`. The next Claude session runs `web/hq/growth-review.md`
  first. Only that title prefix counts as a request.
- **Nothing goes online without the owner's tap.** Claude drafts freely. Site content goes live
  through the Telegram **Publish** tap, social posts through **Approve**.
  - Never publish through the admin, a Railway shell or the Postiz MCP.
- **No prices on the site, ever.** Businesses are partners, never "members".
- **Every event links its source.** `organizerUrl` is required in practice, and the event page shows
  "Más info: <organizer> ↗".
- **Visuals before publishing.** Never send an event or post for approval without a picture.
  Screenshot the render first.
- **Real photos only when they're licensed.** Use public domain or CC that allows commercial reuse,
  with credit. Never Google Maps or Street View, Yelp, news sites or organizer flyers. The owner's
  own phone photos are best.
- **No invented facts or history.** Each claim is labeled Fact, Reported or Legend, with sources.
  AI is for production only (voice, illustration).
- **Social posts are Spanish first.** Event posts carry a two-card carousel, Spanish then English.
  Captions are bilingual.
- **Merge practice.** Other agents merge in parallel, so:
  - re-check `main` right before merging;
  - merge with `gh pr merge --match-head-commit <the sha CI tested>`;
  - confirm Railway deployed that exact commit;
  - back up the production DB before any PR with a migration.

## What shipped (all merged and verified live on 2026-10-05)

| PR | What |
| --- | --- |
| #47 | The growth loop: first-party visit counter (`hq-visits`, `/api/view`, no cookies or IPs), the `hq-experiments` ledger, `/review`, the brief's Site section, the `hqGrowthContext` tool, `web/hq/growth-review.md` |
| #49 | Multi-day events stay listed while they run |
| #50 | Listings fact-check: five unsupported claims removed from `data-import/listings.json` |
| #51 | Generated event cards (design C), the clean flamingo cutout, the "Más info" source link, and auto-post times at the next 11:30 or 19:00 Miami slot, 3 h apart, before the event |
| #54 | Seasonal guide `/es/halloween` and `/en/halloween`, plus the event `season` field (halloween, navidad) |
| #58 | Licensed venue photos: the `hqAddSiteMediaFromUrl` tool (allowlisted hosts and licences, credit required), credits on the page, cards and captions, the photo card layout, and the drawn Halloween Hialeah Park scene |
| #59 | Auto-drafted event posts carry an ES + EN card carousel |
| #60 | (Other session) eight more drawn scenes, city defaults and a per-event `setting` override |
| #62 | Wide scenes on the site: event board cards, the event page hero and link previews |

**Live content:**
- **Halloween:** 11 sourced events, ids 15–25, tagged `season: halloween`. Four have licensed venue
  photos.
- **Scheduled posts:** 12 posts in Postiz, Oct 6–12. These carry the Spanish card only, because they
  were scheduled before #59.
- **Earlier events:** 4 events from Oct 1–10, including Sabor Fest.
- **Listings:** 4 corrected listings.

## How the new pieces work

- **The growth loop.** `hqGrowthContext` returns everything in one call: 28 days of traffic, what's
  live, what shipped, intake counts, the experiments, open tasks and social results. The review
  then:
  1. judges the experiments that are due;
  2. rewrites the `hq-playbook`;
  3. picks at most 3 next moves (each an experiment plus a task);
  4. sends one Telegram summary.
- **The experiment ledger**, judged on Nov 1 via `/review`:
  - #1 the Halloween guide
  - #2 weekly weekend events
  - #3 partner outreach
- **Event cards.** `src/lib/eventCard.tsx` renders them, served at `/api/og/event/<slug>`. There
  are four sizes: link, page, card and social.
  - **Background:** the event's photo if it has one, otherwise a drawn scene (`src/lib/eventSetting.ts`:
    the per-event `setting`, the venue's words, the category, then the city default), otherwise the
    flat city colour.
  - **Season cards:** `/api/og/season/<key>`.
- **Brand assets.** These are locked and never regenerated; edits use them as `--ref`. Provenance
  for each is in `sets/README.md` in `content-marketing-system/brand/flamingo-county/sets/`:
  - `season/halloween-hialeah-park.png`, adapted from Phillip Pessar, CC BY 2.0 (the credit is
    required)
  - `poster/`: 12 portrait scenes
  - `poster-wide/`: the same 12 scenes at 16:9
- **New MCP tools and fields** only appear after the owner runs `/mcp` → **flamingo-hq** →
  Reconnect. Make sure it's flamingo-hq, not postiz.
  - The server accepts new fields such as `season` before the client schema shows them.
  - Calling `/api/mcp` from scripts is blocked by Cloudflare (403). Don't work around it.

## Claude's next work (board: `hq-tasks`)

| Task | What |
| --- | --- |
| #19 | **Every Thursday:** find this weekend's real events (sources: `research-events.md`), draft them with source links and images, request Publish, and draft one roundup post. Next season: Navidad (`lib/seasons.ts` already has the option). |
| #20 | Turn the owner's partner-visit answers into listing drafts **and** `data-import/listings.json` edits, through a PR (the seed overwrites CMS edits). The owner flips listings to `ready`. |
| #27 | Harden the Docker build: `payload migrate` sometimes exits 0 without migrating. Seen twice. |
| #26 | Let finished story videos go through Approve (hosted draft media). |
| #17 | Import Search Console data. Blocked on #18. |
| — | Give the Senior Social (event 25) a better `setting`, e.g. banquet hall. Add Main Street's trick-or-treat once its year is confirmed. Check the Hialeah Gardens and Miami Springs city calendars by hand (their sites block bots). |
| — | Original-handoff polish: move the `/admin/hq` link inside the HQ nav group (small PR). |
| — | Housekeeping, **only with the owner's OK**: 13 old agent worktrees under `~/Documents/dev-projects/flamingo-county/.claude/worktrees/` and about 42 merged remote branches (6 are `hq-w*`). Remove only worktrees whose branch is merged and that no running session uses. |
| Nov 1 | Remind the owner to send `/review`, then run the first growth review. |

## Waiting on the owner

| Task | What |
| --- | --- |
| #2 | **Oct 22, around 11 AM:** check that the deleted test post didn't go out on Facebook. |
| #10, #11, #12 | Remove the direct Postiz MCP. Turn on branch protection for `main`. Rotate the OpenRouter key. |
| #18 | Give read-only Search Console access. This unblocks #17. |
| #13, #14 | Calendar iCal URL, for the brief. Chat model and budget, for the bot. |
| #9, #1, #24 | Decisions: the public agents (`HQ-PUBLIC-AGENTS.md`), the Six Inches intro, and two history stories to produce. Suggested: the flamingo myth and Hollywood at the racetrack. |
| #25 | Visit Casa Marín, Morro Castle and Polo Norte, and call The Bend (is it still open?). Questions and messages are in the plan doc's outreach kit. |
| — | Phone photos of the venues on the shot list (`research-venue-photos.md`). |
| — | Confirm two auto-draft behaviours: a page created and published in one step in the admin makes no social draft, and TikTok is skipped for still photos. |
| — | Privacy call: the MCP key can read visitors' phones and emails in `listing-requests`. Keep it, untick it, or add a filter that returns only the business and status. |

## Status of the original handoff's "what an agent can pick up"

| Item | Status |
| --- | --- |
| Watch the first real runs | The evening wrap and morning brief run daily (`wrap.sent` at 8 PM, `brief.sent` at 7:30 AM). Auto-drafts work. The calendar in the brief waits on #13. |
| Weekly-review key and routine | Replaced by `/review`. No key or routine is needed (task #6, re-scoped). |
| Chat smoke test | Blocked on #12 and #14. |
| Remove round-1 worktrees and branches | Not done. See Housekeeping above. |
| `/admin/hq` link in the nav group; listing-requests field filter | Not done. The filter waits on the privacy call. |
| Public agents | Waiting on the owner's decisions (#9). |

## Open PRs from other sessions (not this track)

- #44: the HQ handoff refresh, now stale (this file supersedes it).
- #45, #46, #48: the AEO track.
- #52: social card fixes.
- #61: free rides.

## Where things live

- **Research** (every claim with a URL and access date): `~/Documents/dev-projects/flamingo-county-research/`
  - `2026-10-01/`: events, listings fact-check, history story bank (30 stories), partners (25 prospects, outreach scripts), landscape
  - `2026-10-05/`: Halloween events, venue photos and the shot list
- **Plan doc:** https://claude.ai/artifact/XQbxCymr3HmVtiifQAcGDF
- **Brand kit:** `~/Documents/dev-projects/content-marketing-system/brand/flamingo-county/`. Image
  generation uses `scripts/fal_image.py`, model `nano-banana-pro/edit`, with the `STYLE` block from
  `MASCOTS.md` pasted verbatim.
- **Production backups:** `/data/backups/content-pre-pr51-*`, `content-pre-pr54-*` and
  `content-pre-pr58-*`, plus `flamingo-hialeah-pre-pr51.png`.

## Gotchas that cost time

- **The Railway build sometimes skips migrations.** `pnpm payload migrate` exits 0 having done
  nothing, then the build fails with "no such table". A retry passes.
  - `railway redeploy` refuses failed deployments, and `railway up` uploads die on connection
    resets.
  - What works: GraphQL `deploymentRedeploy(id)` with the CLI's `user.accessToken`, read inside the
    command and never printed.
  - `railway logs` streams forever, so always wrap it in `timeout`.
- **Migrations run against an empty database in CI.** A data migration must not use `payload.find`
  or `payload.update` on a collection that later migrations extend. Use plain SQL (see
  `20261002_060000_replace_flamingo_mascot.ts`).
  - Test with `DATABASE_URL=file:<scratch>/fresh.db PAYLOAD_SECRET=x NODE_ENV=production npx payload migrate`.
- **Image budget:** each `.jpg` or `.png` must be 400 KB or less (`web/scripts/check-image-budget.mjs`).
- **Postiz can't reliably edit or cancel a scheduled post.** Approving is final, so get the draft
  right before the owner's tap.
- **Auto-drafts fire on every Publish.** Publishing many events at once means many posts, spaced
  3 h apart. Warn the owner first.
- **Researcher subagents share one web-search budget** of about 200 per session, so keep research
  tasks tight.
  - Florida DBPR licence files are the best free "is it still open?" check.
  - Sunbiz blocks bots.
- **Ports:** other worktrees hold :3000 and :3100. Use 3110–3140 for local servers. Don't run
  `pkill -f next-server`, because it can kill other sessions' servers.
