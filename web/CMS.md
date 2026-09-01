# Flamingo County CMS

Payload 3 on SQLite, holding the content that used to live as object literals in
`../fc-data.js`. The static site in the repo root is untouched and still serves
as-is — this runs alongside it, not instead of it.

## Run it

```sh
pnpm install
pnpm seed        # imports everything from ../fc-data.js; safe to re-run
pnpm dev         # → http://localhost:3000/admin
```

`pnpm seed` also creates the first admin user from `PAYLOAD_ADMIN_EMAIL` /
`PAYLOAD_ADMIN_PASSWORD` in `.env`. Leave those unset and Payload's own
create-first-user screen handles it instead.

| Command | What it does |
| --- | --- |
| `pnpm seed` | Import `../fc-data.js`. Upserts on slug — re-running changes nothing. |
| `pnpm verify` | Assertions over what the seed wrote, including the trimmed taxonomy. Exits non-zero on failure. |
| `pnpm seed:inspect` | Dump what the sandbox reads out of `fc-data.js`. Writes nothing. |
| `pnpm generate:types` | Regenerate `src/payload-types.ts` after a schema change. |
| `pnpm payload migrate:create <name>` | New migration. Do this before deploying a schema change. |

## What is in here

| Collection | N | From |
| --- | --- | --- |
| `cities` | 3 | `CITIES` |
| `categories` | 3 | `CATS`, minus the `all` chip and minus the three verticals with no listings, plus `nonprofit` which `CATS` never had — see *The taxonomy is narrower than the design source* |
| `event-kinds` | 7 | `EKINDS` minus the `all` chip |
| `listings` | 14 | `BIZ` + `DETAIL` |
| `stories` | 3 | `STORIES` (33 blocks) |
| `events` | 20 | `EVENTS` |
| `weekly-events` | 6 | `WEEKLY` |
| `spotlights` | 3 | `SPOTS` |
| `media` | 20 | Real photography only — city heroes, mascots, the founder shot, and 8 storefronts |

The table above is what `fc-data.js` *contains*. By default only cities,
categories, event-kinds, media and the globals are actually imported from it —
see *Only real businesses are seeded* below.

Globals: `site-settings` (the old per-page `data-props`), `about-page` and
`list-your-spot-page` (copy that was inline `L(en, es)` pairs in the components).

## Only real businesses are seeded

`fc-data.js` is design fiction — 14 listings whose phone and hours were
generated from the array index, plus the 20 events, 6 weekly events, 3
spotlights and 3 stories written around them. **None of it is imported.**

What the seed still takes from `fc-data.js`: the cities, both taxonomies, the
photography, and the site copy. Those describe real places and real words.

`SEED_MOCK_CONTENT=1` puts the fiction back — seed and verify both read it, and
the full assertion suite runs again. Nothing is lost by leaving it off:
`fc-data.js` is still in the repo and still the source of truth for it.

The content that ships is 13 researched listings, and `publicationStatus`
records how solid each one is:

| Value | N | What it is |
| --- | --- | --- |
| `ready` | 4 | Every published field traces to a source. |
| `needs_owner_confirmation` | 9 | Publishable, but `research.blockingGaps` names what still has to be asked. |
| `unsourced` | 0 | Design placeholders. Only present with `SEED_MOCK_CONTENT=1`. |

**What this empties.** The stories index and the home spotlight row have no
content, and Little Havana has no listings — there is no research for it yet, so
its city page renders COMING SOON. Every one of those renders its empty state
rather than breaking. That is the honest picture: the site now shows exactly
what is known about real businesses and nothing else.

The **events board is no longer empty**: one real event ships, seeded from
`REAL_EVENTS` in `src/seed/index.ts` rather than from `fc-data.js`. See
*One real event, and what it exposed* below.

The researched 11 come from `data-import/listings.json`, a tracked copy of the
file generated from the per-business dossiers in the sibling `flamingo-city`
repo's `research/<city>/`. The importer is `src/seed/research-listings.ts`; it
prefers the in-repo copy and falls back to the sibling checkout, so a deploy
that only has this repo still gets all 13. Override with `RESEARCH_JSON`.

**Two of the 13 have no dossier.** `casa-marin` and `el-club-de-la-amistad` were
written by hand into `data-import/listings.json` from press and the
organisations' own sites. Regenerating that file from the sibling repo therefore
**drops them** — `_meta.local_edits` says so. `HAND_AUTHORED` in
`research-listings.ts` keeps `research.sourceFile` empty for the two rather than
pointing it at a dossier that has never existed, which is the same rule as
`"N/A"` is not a value: an invented provenance pointer is worse than none.

Keeping the copy tracked matters: `flamingo-city` is a different git repo and
does not exist on Railway, and the importer skips silently when it finds
nothing — so relying on the sibling would have produced a short seed with no
error.

Three rules that file states and the importer obeys — all three are enforced by
assertions in `pnpm verify`, because each is a way the import could quietly lie:

- **`corporate_record.filing_date` is never an opening date.** It is a Florida
  registration event, and several of these businesses registered decades after
  they opened. Only `established` / `opened` reach `research.established`.
- **`"N/A"` is a gap marker, not a value.** It never becomes a string.
- **Conflicting hours are not resolved by picking one.** They arrive with
  `detail.hoursConfidence` and the disagreements in `detail.hoursConflicts`.

Coverage is partial and uneven on purpose: Miami Lakes and Hialeah only,
restaurants and bars only. Little Havana has no research behind it yet, and the
`clean` / `contract` / `halls` categories no longer exist — the site says only
what it has.

### Renaming a listing takes a map, not just an edit

`upsert` keys on **slug**, so changing a slug in `listings.json` alone does not
rename anything — it creates a second row and orphans the first, taking the
count from 11 to 12 and failing `pnpm verify`. `SLUG_RENAMES` in
`src/seed/research-listings.ts` is the record of every such rename, and
`renameListings` applies it before the research loop.

It renames in place with `payload.update` rather than delete-and-recreate, so
the row keeps its id and the story blocks, hours, research sources and locale
rows stay attached. It refuses when **both** slugs exist, on the same grounds as
`pruneCategories`: that means an earlier seed already made the duplicate, and
choosing which to keep is a guess. The error names the fix. It runs outside the
`try` that downgrades a missing research file to a skip, so the refusal cannot
be swallowed.

One rename so far. `el-mejor-batido-de-hialeah` → `s-and-n-vegetables`: the
Hialeah ventanita is published under **S&N Vegetables**, its corporate and press
name, by owner decision. The awning name survives in `alternate_names` and
`seo.json_ld.alternateName`, and `research.sourceFile` still points at the
dossier's real filename via `DOSSIER_SLUG` — the upstream repo did not rename
the file.

**This diverges from upstream.** The dossier in the sibling `flamingo-city` repo
still says El Mejor Batido de Hialeah, so regenerating `data-import/listings.json`
reverts the name. `_meta.local_edits` in that file records the divergence for
whoever regenerates it. No redirect exists for the old URL: nothing links to it
and the site has not shipped.

## Deploying to Railway

Verified by building the image and running it against a Docker volume, not just
written. `railway.json` at the repo root points at `web/Dockerfile`.

| Setting | Value |
| --- | --- |
| Root Directory | the repo root — **not** `web/` |
| Builder | Dockerfile, `web/Dockerfile` |
| Volume mount | `/data` |
| `DATABASE_URL` | `file:/data/content.db` |
| `MEDIA_DIR` | `/data/media` |
| `PAYLOAD_SECRET` | a fresh random string |

After the first deploy, run `pnpm seed` once from Railway's shell.

**The build context is the repo root on purpose.** The seed reads `../fc-data.js`
and `../data-import/listings.json`, and uploads photography from `assets/`,
`mascots/` and `uploads/` — all outside `web/`. Build with `web/` as the context
and the image looks fine until someone seeds, then produces 0 media.

Three things this arrangement got wrong the first time, all found by running the
container rather than reading it:

- **pnpm must be pinned.** Newer pnpm stopped reading the `pnpm` field in
  `package.json`, so `onlyBuiltDependencies` was ignored, sharp never built and
  the install failed. `packageManager` in `package.json` fixes it.
- **`generateStaticParams` routes 500'd** with `DYNAMIC_SERVER_USAGE`. The build
  database is empty, so those hooks return nothing and Next falls back to
  generating on demand — where the nav's header read throws. The four affected
  routes are now `force-dynamic`. Note that `pnpm build` **and** a local
  `pnpm start` both pass while this is broken, because a local build has a
  seeded database. Only a container build reproduces it.
- **Media and the database both have to sit under the mount.** Getting one right
  loses the other half of the content.

### The taxonomy is narrower than the design source

`fc-data.js` carries five categories, written for a directory that would cover
trades and event venues. Two of them have listings, so two of them ship:
`food` → **RESTAURANTS** and `night` → **BARS**. `night` is relabelled because
its two listings are a taproom and a liquor lounge, not night clubs.

A third category, `nonprofit` → **NONPROFITS** / **ORGANIZACIONES**, exists here
and nowhere upstream. `fc-data.js` was written for a directory of businesses and
has no nonprofit in it at all, and Club de la Amistad — a volunteer club with no
premises — does not belong under RESTAURANTS.

`CAT_KEEP`, `CAT_RELABEL` and `EXTRA_CATS` in `src/seed/index.ts` hold the
divergence. Editing `fc-data.js` instead would have been reverted by the next
Claude Design re-pull. A category added to `EXTRA_CATS` **must** also go in
`CAT_KEEP`, or `pruneCategories` deletes the row on the same run that creates
it — and then throws on the next one, once a listing references it. The third
place is `CATEGORY` in `research-listings.ts`: a research category with no
mapping there is *skipped with an exit code of 0*, so a listing silently fails
to import.

The ES label is `ORGANIZACIONES`, not the club's own *sin fines de lucro*, which
is accurate but three words too long for a filter chip.

The seed only upserts, so `pruneCategories` deletes rows that fall out of
`CAT_KEEP` — without it a database seeded before the trim keeps offering
CONTRACTORS, HOME CLEANING and BANQUET HALLS in the List Your Spot dropdown,
which is entirely DB-driven. It **refuses** rather than orphans: a category
still referenced by a `listing` or a submitted `listing-request` throws, on the
grounds that the trim is then wrong. Check `listing-requests` on a deployed
database before re-seeding it.

### One real event, and what it exposed

`base.EVENTS` is 20 invented listings-parties behind `SEED_MOCK_CONTENT`, and
the whole events block was inside that gate — so there was no route at all for
an event that actually happens. `REAL_EVENTS` in `src/seed/index.ts` is that
route, and runs ungated. One record so far: **Nos reunimos en Casa Marín**,
Sunday 6 September 2026, the Club de la Amistad's members-and-volunteers lunch
at Casa Marín.

It runs **after** the researched-listings loop, because `venueType: 'listing'`
needs `id.listings` populated. It throws when the venue slug did not seed,
rather than writing an event with no venue.

Spanish is the source language for these, which inverts the listing importer's
English-only rule. The flyer is Spanish; `title`, `note`, `timeLabel` and
`freeLabel` are authored in both locales rather than run through the EN→ES
dictionary, which has never seen them.

Three things only a real event could surface, all fixed:

- **`timeLabel` was not localized.** It held clock readings ('9PM–1AM') where
  the language does not matter. An event whose time is not settled says so in
  words — *Por confirmar* — which does. Migration
  `20260901_204154_localize_event_time_label` moves the column into
  `events_locales`. It moves rather than copies, which is safe only because no
  deployed database has ever held an event.
- **`t('← ALL EVENTS')` had no Spanish.** The generated dictionary carries bare
  `ALL EVENTS` and the arrowed `← ALL LISTINGS`, but never the arrowed events
  variant — and the key is the whole English literal, arrow included. The event
  page's back link was shipping English to Spanish readers. Fixed in
  `i18n/overrides.ts`.
- **The mascot covered the date badge below ~800px.** Both are anchored to the
  hero's right edge, and the hero bottoms out at 190px while a fixed 170px
  mascot did not. Its height now tracks the hero's own clamp.

Dates are written as **midday UTC** (`T12:00:00.000Z`), matching the mock loop.
A bare calendar date lands on the previous day once `dateOnly()` reads it back
in `America/New_York`.

### Sourced listings lead the grids

`getListings` returns `ready`, then `needs_owner_confirmation`, then
`unsourced` — real businesses ahead of design placeholders — with seed order
preserved inside each tier. The tiering is applied in `lib/data.ts` rather than
in the query, because Payload would sort `publicationStatus` alphabetically and
put `needs_owner_confirmation` ahead of `ready`.

The city pages no longer show three picks (`City.dc.html:127` did): they are
the browse surface and show everything in the city, with a search box. A city
with **zero** listings renders a COMING SOON panel instead — gated on the count
rather than the slug, so it clears itself when the first listing lands. Little
Havana is the only one today.

The **home spotlight row is not affected** — those three are curated one-per-city
records in the `spotlights` collection, not the head of the grid.

### Hours print only when they are trustworthy

8 of the 13 researched listings have hours below `high` confidence, two of them
with three sources that flatly disagree, and `casa-marin` publishes none at all —
its only source is a page whose About copy is still the site template's, and a
schedule on a page nobody edited is not an owned channel. The Business page renders a schedule
only at `high` confidence, or when `hoursConfidence` is empty — empty means
authored design content, not a failed verification. Anything less shows
"Hours vary by source — call to confirm." next to the phone number.

## Things that are deliberate, not oversights

**Only `el-gallo` has business detail.** The other 13 listings' phone, website,
hours, story and quote were *synthesized at render time from the array index* in
`Business.dc.html` — `'(305) 555-0' + (100 + i)`. Importing that would launder
placeholder data in as authored content. Empty is the honest state; real owner
detail has to be collected.

**Empty photo slots render nothing.** `MediaSlot` used to reproduce the Claude
Design canvas element's empty state — a dashed box with a photo icon and the
`imageHint` printed in it — because at the time every slot was empty. All 13
listings have a `gallery[0]` now, and the only empty slots left were the two
spare tiles in the business page's gallery strip, which was a fixed
`[0,1,2].map` over `gallery[i+1]`: three dashed boxes on every listing,
apologising for photographs nobody had promised. The strip now renders one tile
per photo that exists and does not render at all when the hero is the only one.

`imageHint` is still a field on `listings` and `events`. It is art direction for
whoever fills the slot and it still shows in the admin — it is simply no longer
printed at the reader.

The photos live in `assets/businesses/<slug>.jpg`, tracked, and are keyed by
**slug** in `LISTING_PHOTO` (`src/seed/research-listings.ts`). Keying on the
filename would have been wrong: five of the eight arrived named differently from
the listing they belong to — `trigo-cafe-tapas-wine.jpg` is `trigo-cafe`,
`morro-castle-restaurant.jpg` is `morro-castle`. `upsertMedia` warn-skips a path
it cannot find and the research loop sits inside a catch, so a mismatch would
have produced a green seed with blank slots rather than an error. `pnpm verify`
now asserts all eight resolve to a populated `gallery[0]`.

`molinas-ranch.jpg` is a Google Street View capture with the watermark burned
in; its `credit` says so, and it should be replaced when the storefront is
actually shot.

**Reset `media/` and `content.db` together or not at all.** `upsertMedia`
dedupes by looking up the *source* file's basename in the `media` table, but
Payload suffixes a filename when one already exists on disk. Delete the database
alone and every upload collides with the file left behind, lands as
`cancun-grill-1.jpg`, misses the dedupe on the next run and is created again —
20 media rows became 52 across two seeds while this was being written. `rm -rf
media content.db*` and seed once. Both are gitignored artifacts that `pnpm seed`
rebuilds.

**`going` counts are seed integers**, not a live tally. Saved/going state is
`localStorage`-only and has no server side until there are accounts.

**Spanish that `fc-data.js` never said lives in `src/i18n/overrides.ts`.**
`dictionary.generated.ts` is rewritten from the design source by
`pnpm gen:dictionary`, so a hand-edit there does not survive. `translator()`
merges the overrides over the generated map. Same contract either way: the key
is the English string, and a miss returns the key — so an English literal
changed in a `.tsx` without a matching entry ships English to Spanish readers.

**Untranslated fields hold English in the ES locale, not blank.** The seed's
`es()` mirrors the old `T()` — dictionary miss returns the English string — so a
gap looks *filled in* in the admin rather than empty. With `fallback: true` we
could have written `undefined` and let fallback supply the English at read time,
which would surface gaps as blank fields. Current behaviour matches what the
live site does today; worth revisiting if you want the admin to show you what
still needs translating. The known gaps are the 3 story outros and one `sparkle`
paragraph — `pnpm verify` prints a note about them.

## The seed reads `fc-data.js`, it does not duplicate it

`src/seed/load-fc-data.ts` evaluates the real file in a `with`-block proxy
sandbox that auto-vivifies any browser global it reaches for. That matters
because the file is a moving target — there is i18next work in flight on `main`
that touches `document` and `fetch`, and a re-pull from Claude Design will add
something else. The loader asserts the record counts before anything is written,
so a shape change fails loudly instead of importing half a dataset.

Two writes per record, always: Payload stores one locale per write, so English
creates the row and a second `update({ locale: 'es' })` translates it. Arrays
whose *inner* fields are localized — story blocks, opening hours —
must carry their generated row `id` into that second write, or Payload treats
the array as replaced and rebuilds it instead of translating in place.

## The frontend

Ported so far: the chrome (nav, footer), **Home**, **City**, **Business**,
**Story**, **Events**, **Event**, **Stories index**, **My Week**,
**List Your Spot** and **About**.

### How to check a port is faithful

The reference implementation is still in this worktree, so serve it and compare:

```sh
python3 -m http.server 8080 --directory ..   # the old site
pnpm dev                                     # the port
```

Then screenshot the same page from both at the same viewport — `/Home.dc.html`
against `/en`, `/Story.dc.html?s=el-gallo` against `/en/stories/el-gallo`. Check
1280 **and** 390; the whole burger-nav path only exists below 1020px. Do this
before believing a page is done: it has already caught a full-width button that
looked inline, a nav active-state that never fired, and two mascots that
silently resolved to bare relationship ids.

One caveat: `support.js` pulls React from unpkg, so confirm the reference
actually rendered before trusting a comparison. A blank reference makes every
diff look like a pass.

### What changed in translation

**Hover is CSS now.** `style-hover` compiled to real `:hover` rules at runtime,
and `no-touch-hover.js` then rewrapped them in `@media (hover:hover)` so taps
would not stick. Both are authored directly, which also retires the four
booleans the nav kept in state purely to show a tooltip.

**Responsive rules port unchanged.** Every breakpoint keys off a `[data-*]`
attribute — `data-stack`, `data-navburger`, `data-rail` — so `globals.css` keeps
them verbatim and the JSX carries the same attributes.

**Language moved from localStorage to a cookie**, because a server render cannot
read localStorage. The chain is unchanged — `?lang=` → cookie → `Accept-Language`
→ `es` — and so is the rule that makes it work: **only the toggle writes.**
Persisting a *detected* language would make it win on every later request and
the device setting would never be consulted again. `src/proxy.ts` only reads.

**Search is a plain GET form.** No client component: the page already reads its
filters from `searchParams`, so the browser can serialise the fields itself. It
is the only query UI left — the category chips on Home and the city/kind chips
on Events are gone, since 11 listings across two categories is not enough to
filter. `?city=` on Home survives: it is not a chip, it drives the per-city hero
art and the city-scoped spotlight row, and shared links carry it. Nothing on the
site links to it any more.

**The ticker runs on the listings collection.** It was one hardcoded sentence
claiming 412 local spots and a banquet-hall vertical. Each item is now a link to
a real business. The `tick` keyframe translates `-50%`, so the run is duplicated
exactly and the copy is `aria-hidden` with `tabIndex={-1}`; the duration is
computed from the item count rather than pinned; and the marquee pauses on
`:focus-within` and `:active`, plus `:hover` behind `@media (hover: hover)` so a
tap cannot freeze it for good.

**`<image-slot>` became `<MediaSlot>`** — real image when the CMS has one, and
otherwise the element's exact empty state, which is what the live site shows
today.

### Rendering is dynamic, on purpose

Every public route builds as `ƒ` rather than `○`, declared once as
`export const dynamic = 'force-dynamic'` on `[lang]/layout.tsx`.

**It used to be implicit and that was a trap.** The nav read a request header
for its active section, and reading a header is what made each segment dynamic.
When the active state moved to the client (see below), four routes with no
`searchParams` of their own — About, List Your Spot, My Week, the stories index
— silently went static and `pnpm build` died prerendering `/es/about`.

Static is the wrong answer here anyway. The layout queries Payload on every
render — the nav's cities and the ticker's listings — and a container build runs
against an empty database, so prerendering would bake a nav with no city tabs
and an empty ticker into the HTML until someone rebuilt. And it would look
correct locally, where the build database is seeded. Same shape as the
migration-drift trap below: **only a container build reproduces it.**

Dynamic is also the right default for a CMS-backed site: an admin edit is live
on the next request with no rebuild, and the local API means no network hop.

### The nav's active state is derived on the client

`NavMenus` computes it from `usePathname()`. It cannot be a server-computed
prop: `Nav` lives in the layout, and App Router does not re-render a layout on
a navigation that leaves its own segment unchanged, so `/en/lakes` →
`/en/hialeah` reused the layout and the highlight froze on whichever city was
loaded first. A hard reload was always correct, which is why it survived review.

That retired `lib/active.ts` and the `x-fc-pathname` header. `proxy.ts` keeps
its language chain, which is unrelated.

### Images are served at the size they are displayed

`lib/srcset.ts` builds a `srcSet` from the variants Payload generated on upload.
Nothing emitted one until 2026-08-27, so every photo went over the wire at full
upload size while `thumbnail`, `card` and `hero` sat unused on the volume. The
Hialeah grid went from 2.30 MB to 0.78 MB at 1280 @1x, and the home page from
5.43 MB to 2.77 MB.

Two rules it encodes, both learned the hard way:

- **Read the variants, do not name them.** Sharp SKIPS any target wider than the
  original, so a 1600px storefront has no `hero` and a 353px mascot has none at
  all. Naming the three sizes emits `undefined 1920w` across most of the library.
  The original joins the set and the whole thing is deduped by width, because
  `havana-1920` *is* its own `hero`.
- **`sizes` describes the slot, not the image.** It is what picks the candidate,
  so a wrong value silently overfetches — the card grid is `minmax(min(100%,265px),1fr)`
  inside a 1280 shell and therefore ~330px, not the `100vw` an omitted `sizes`
  assumes. Check it through `currentSrc` in a real browser; the attribute being
  present proves nothing about which file the browser actually took.

**Two heavy images this does not solve**, both a different problem:

- `skyline-hero.png` (1.1 MB) is a CSS `background-image`. `srcSet` does not
  apply — it needs `image-set()` or restructuring into an `<img>`.
- `flamingo-hialeah.png` (418 KB) and `cow-miami-lakes.png` (609 KB) are 353px
  and 360px originals, so there is nothing to choose between. They are simply
  badly encoded for their dimensions and want re-encoding, or a WebP
  `formatOptions` on the media collection — an asset decision, not a markup one.

### Still to do on the frontend

All ten routes are ported. Six of them were only ever checked by status code,
typecheck and build; that gap is now closed — see `VISUAL-REVIEW.md` for the
by-eye pass over Events, Event, Stories, My Week, List Your Spot and About,
including the 720px calendar breakpoint. Nine defects came out of it. Five are
fixed; the four below are the remainder.

- **Sections that were never ported.** The **Event** page is missing its whole
  right-hand column — *when & where*, *going with the crew* and *post an event*
  (`Event.dc.html:85` wraps them in a `1.5fr 0.9fr` `data-stack` grid). The
  **events board** is missing the **ON DECK** spotlight hero and its own
  *post an event* card. **Stories** is missing the cyan *your story goes here*
  card in the third shelf slot. **My Week**'s hero is missing its **SAVED** and
  **GOING** counters.

  Two of those draw a mascot on a tinted panel. Use `lib/castBg.ts` — the
  literal `castBg` on each city is dead data that renders flat cyan, and that
  helper computes what the source actually draws.

- **Old URLs.** `?biz=`, `?e=`, `?s=` are advertised as shareable in the site
  README and exist in the wild. They need resolving routes that look the record
  up and redirect — `?biz=el-gallo` has to become `/en/havana/el-gallo`, which
  needs the city, so `next.config` rewrites cannot do it.
- **Scroll-driven animations** on Story use `animation-timeline`, which is
  Chromium-only. Other engines apply the `both` fill and show the end state
  immediately — a graceful degradation, left as CSS rather than reimplemented.
- **Railway.** Volume at `/data`; `DATABASE_URL=file:/data/content.db` *and*
  media `staticDir=/data/media` both have to sit under the mount or they vanish
  on redeploy. Run `payload migrate` on boot. SQLite on a volume pins the
  service to one instance — fine at this size.

  The initial migration has been *executed*, not just generated: `payload
  migrate` against an empty db, then `pnpm seed` and `pnpm verify` on the
  resulting schema, all checks passing. Dev uses push mode, so without that
  run the artifact would be unproven until the first Railway boot.

  **The migration was regenerated on 2026-08-20 and the old one deleted.** It
  had drifted out of sync with the config and no longer built a working schema:
  `cities.order`, three `site_settings.hero_*` columns and the two form-inbox
  join columns on `payload_locked_documents_rels` existed in the config and in
  the push-mode dev database but were absent from the migration. Adding a
  migration on top could not fix it — the generated repair tried to rebuild
  `cities` by selecting a column the migrated schema had never had, and failed.
  Nothing had shipped, so one clean initial migration was the honest artifact.

  The lesson generalises: **push mode hides migration drift completely.** Adding
  a field and seeing it work in dev proves nothing about the migration. Re-check
  it the same way after any schema change:

  ```sh
  # point DATABASE_URL at a scratch file in .env first — the CLI reads .env,
  # so an inline env var will not override it
  pnpm payload migrate && pnpm seed && pnpm verify
  ```

### One rule worth keeping

Every Payload query in `lib/data.ts` sets an explicit `sort`. Three did not, and
all three were wrong in the same way: Payload's default is `-createdAt`, so the
stories index featured the newest story instead of the first, and the home page
printed its spotlight row Little Havana first. Seed order is authored order — if
you add a `find`, sort it.

The three use `sort: 'createdAt'` rather than the `sort: 'order'` field that
cities, categories and event-kinds carry. That is a deliberate shortcut: it
restores authored order without a schema change, but it is **not** editor
controllable, so re-ordering the stories shelf from the admin is not possible
today. Promoting them to a real `order` field is the proper fix whenever
someone needs to reorder content without re-seeding.
