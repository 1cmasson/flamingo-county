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
| `pnpm verify` | 43 assertions over what the seed wrote. Exits non-zero on failure. |
| `pnpm seed:inspect` | Dump what the sandbox reads out of `fc-data.js`. Writes nothing. |
| `pnpm generate:types` | Regenerate `src/payload-types.ts` after a schema change. |
| `pnpm payload migrate:create <name>` | New migration. Do this before deploying a schema change. |

## What is in here

| Collection | N | From |
| --- | --- | --- |
| `cities` | 3 | `CITIES` |
| `categories` | 5 | `CATS` minus the `all` chip |
| `event-kinds` | 7 | `EKINDS` minus the `all` chip |
| `listings` | 14 | `BIZ` + `DETAIL` |
| `stories` | 3 | `STORIES` (33 blocks) |
| `events` | 20 | `EVENTS` |
| `weekly-events` | 6 | `WEEKLY` |
| `spotlights` | 3 | `SPOTS` |
| `media` | 10 | Real photography only |

The table above is what `fc-data.js` *contains*. By default only cities,
categories, event-kinds, media and the globals are actually imported from it —
see *Only real businesses are seeded* below.

Globals: `site-settings` (the old per-page `data-props`), `about-page` and
`list-your-spot-page` (copy that was inline `L(en, es)` pairs in the components).

## Only real businesses are seeded

`fc-data.js` is design fiction — 14 listings whose phone and hours were
generated from the array index, plus the 20 events, 6 weekly events, 3
spotlights and 3 stories written around them. **None of it is imported.**

What the seed still takes from `fc-data.js`: the three cities, both taxonomies,
the photography, and the site copy. Those describe real places and real words.

`SEED_MOCK_CONTENT=1` puts the fiction back — seed and verify both read it, and
the full assertion suite runs again. Nothing is lost by leaving it off:
`fc-data.js` is still in the repo and still the source of truth for it.

The content that ships is 11 researched listings, and `publicationStatus`
records how solid each one is:

| Value | N | What it is |
| --- | --- | --- |
| `ready` | 4 | Every published field traces to a source. |
| `needs_owner_confirmation` | 7 | Publishable, but `research.blockingGaps` names what still has to be asked. |
| `unsourced` | 0 | Design placeholders. Only present with `SEED_MOCK_CONTENT=1`. |

**What this empties.** The events board, the stories index and the home
spotlight row have no content, and Little Havana has no listings — there is no
research for it yet. Every one of those renders its empty state rather than
breaking. That is the honest picture: the site now shows exactly what is known
about real businesses and nothing else.

The researched 11 come from `data-import/listings.json`, a tracked copy of the
file generated from the per-business dossiers in the sibling `flamingo-city`
repo's `research/<city>/`. The importer is `src/seed/research-listings.ts`; it
prefers the in-repo copy and falls back to the sibling checkout, so a deploy
that only has this repo still gets all 11. Override with `RESEARCH_JSON`.

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
restaurants and bars only. Little Havana and the `clean` / `contract` / `halls`
categories have no research behind them yet.

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

### Sourced listings lead the grids

`getListings` returns `ready`, then `needs_owner_confirmation`, then
`unsourced` — real businesses ahead of design placeholders — with seed order
preserved inside each tier. The tiering is applied in `lib/data.ts` rather than
in the query, because Payload would sort `publicationStatus` alphabetically and
put `needs_owner_confirmation` ahead of `ready`.

This matters most on the city pages, which show only three picks each
(`City.dc.html:127` does the same). Hialeah and Miami Lakes now lead with
researched businesses; Little Havana still shows fc-data records, because no
research covers it yet.

The **home spotlight row is not affected** — those three are curated one-per-city
records in the `spotlights` collection, not the head of the grid.

### Hours print only when they are trustworthy

7 of the 11 researched listings have hours below `high` confidence, two of them
with three sources that flatly disagree. The Business page renders a schedule
only at `high` confidence, or when `hoursConfidence` is empty — empty means
authored design content, not a failed verification. Anything less shows
"Hours vary by source — call to confirm." next to the phone number.

## Things that are deliberate, not oversights

**Only `el-gallo` has business detail.** The other 13 listings' phone, website,
hours, story and quote were *synthesized at render time from the array index* in
`Business.dc.html` — `'(305) 555-0' + (100 + i)`. Importing that would launder
placeholder data in as authored content. Empty is the honest state; real owner
detail has to be collected.

**Every photo slot is empty.** `.image-slots.state.json` never existed, so every
business photo, event image and story cover has always been a labelled
placeholder. The `hint` fields carry the art direction. Only real photography —
city heroes, mascots, the founder shot — is imported.

**`going` counts are seed integers**, not a live tally. Saved/going state is
`localStorage`-only and has no server side until there are accounts.

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

Ported so far: the chrome (nav, footer), **Home**, **City**, **Business** and
**Story**. Still on the list: Events, Event, Stories index, My Week,
List Your Spot, About.

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
filters from `searchParams`, so the browser can serialise the fields itself.

**`<image-slot>` became `<MediaSlot>`** — real image when the CMS has one, and
otherwise the element's exact empty state, which is what the live site shows
today.

### Rendering is dynamic, on purpose

Every route builds as `ƒ` rather than `○`. The nav lives in the layout and needs
to know the current section, which it gets from a header stamped by the proxy —
and reading a request header makes the segment dynamic.

That is the right default for a CMS-backed site: an edit in the admin is live on
the next request with no rebuild. Data comes from Payload's local API, so there
is no network hop to pay for. If static rendering is ever wanted, the way back
is to drop the header and pass `active` per page as the source did
(`<dc-import name="Nav" active="story">`) — `generateStaticParams` is already in
place on every dynamic route.

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
