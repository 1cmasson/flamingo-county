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
| `pnpm verify` | 40 assertions over what the seed wrote. Exits non-zero on failure. |
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

Globals: `site-settings` (the old per-page `data-props`), `about-page` and
`list-your-spot-page` (copy that was inline `L(en, es)` pairs in the components).

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
whose *inner* fields are localized — story blocks, menu rows, opening hours —
must carry their generated row `id` into that second write, or Payload treats
the array as replaced and rebuilds it instead of translating in place.

## Not done yet

- **The frontend port.** `src/app/(frontend)/` is still the scaffold's page.
  `../ROUTES.md` maps all ten routes.
- **Railway.** Volume at `/data`; `DATABASE_URL=file:/data/content.db` *and*
  media `staticDir=/data/media` both have to sit under the mount or they vanish
  on redeploy. Run `payload migrate` on boot. SQLite on a volume pins the
  service to one instance — fine at this size.

  The initial migration has been *executed*, not just generated: `payload
  migrate` against an empty db, then `pnpm seed` and `pnpm verify` on the
  resulting schema, all 50 checks passing. Dev uses push mode, so without that
  run the artifact would be unproven until the first Railway boot. Re-check it
  the same way after any schema change:

  ```sh
  # point DATABASE_URL at a scratch file in .env first — the CLI reads .env,
  # so an inline env var will not override it
  pnpm payload migrate && pnpm seed && pnpm verify
  ```
- **Forms.** `list-your-spot` and `newsletter` work today only because Netlify
  scans deployed HTML at deploy time. That mechanism does not exist on Railway;
  both need collections with anonymous `create` access.
- **Event date logic.** The old calendar is a hardcoded two-month window
  (`EV_TODAY: '2026-08-17'`, `MONTHNAME` with only keys 8 and 9). Records
  migrated; the this-weekend/next-week bucketing has to be rebuilt. `date` is a
  bare day and `timeLabel` is unparsed display text — decide then whether to
  normalize to real datetimes.
- **URL contract.** Everything is `?biz=` / `?e=` / `?s=` today and advertised as
  shareable. Path routes need redirects preserving those.
