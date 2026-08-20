# Visual review of the six unreviewed routes

Phase 2 shipped ten routes, but six were verified only by status code, typecheck
and build. This is the by-eye pass over those six, done the way `CMS.md`
prescribes: the static reference served from the repo root and the port served
from `web/`, screenshotted at the same viewports and compared.

```sh
python3 -m http.server 8080 --directory ..   # reference
pnpm dev                                     # port
```

Viewports: **1280** and **390** for all six, plus **720** for the events
calendar — the breakpoint `CMS.md` called out as never rendered.

## Two things that had to be controlled first

**The reference has to actually render.** `support.js` pulls React from unpkg and
compiles the `.dc.html` in the browser; a blank reference makes every diff look
like a pass. Every capture asserts on painted text and node count before the
screenshot is trusted. All reference captures rendered (940–6942 chars).

**"Today" had to be pinned.** The reference freezes `EV_TODAY` at `2026-08-17`;
the port derives it live in `America/New_York`. Comparing on 2026-08-19 would
show two days of bucket drift on exactly the two date-driven pages under review.
`todayISO()` was pinned to `2026-08-17` for the comparison and **the patch has
been reverted** — `src/lib/dates.ts` is back to its committed state.

## Not a defect: the reference renders its footer three times

On the events board the string `DEALS IN YOUR INBOX EVERY FRIDAY` appears at
three different offsets, from a single `<dc-import name="Footer">`. That is the
dc runtime duplicating the component, the same class of problem as scripts
running twice. The port renders it once, which is correct. **Do not port this.**

## Status

Five findings are fixed and verified; four are deferred as new component work.

| # | Finding | Status |
| --- | --- | --- |
| 1 | List Your Spot accepts empty city / category | **fixed** |
| 2 | Event page right-hand column missing | deferred |
| 3 | Events board ON DECK hero + post-an-event card missing | deferred |
| 4 | Calendar loses weekday headings ≤720px | **fixed** |
| 5 | Stories features wrong story (no `sort`) | **fixed** |
| 6 | Stories call-to-action card missing | deferred |
| 7 | My Week hero stat tiles missing | deferred |
| 8 | About city panels flat cyan | **fixed** |
| 9 | `min-height:100vh` applied below the nav | **fixed** |
| 10 | Home's spotlight row in reversed city order (no `sort`) | **fixed** |

Finding 10 was not in the original six — it surfaced while checking that the
fixes had not regressed the four routes phase 2 already signed off.

Verified after the fixes, at the same viewports:

| | before | after | reference |
| --- | --- | --- | --- |
| My Week height | 1229 | **908** | 910 |
| Weekday headings at 720 | 0 | **7** | 7 |
| `select[required]` | none | **city, category** | n/a |
| About photo-backed panels | 0 | **3** | 3 |
| Stories featured | *The same two people* | ***The sign his brother painted*** | *The sign his brother painted* |
| Home spotlight row | Havana → Lakes → Hialeah | **Hialeah → Lakes → Havana** | Hialeah → Lakes → Havana |

`pnpm build` passes all routes, `tsc --noEmit` is clean, and `pnpm verify`'s 50
assertions still pass.

### Regression check on the routes phase 2 had already approved

Two of these fixes reach outside the six: the listings `sort` changes what Home
and City grids return, and moving `min-height` changes every page. Home, City,
Business, Story and My Week were therefore re-shot against the reference at
1280 **and** 390, with the same both-sides-rendered gate.

Heights track the reference (Home +81/+2, City 0/0, Business −8/−225, Story
+26/+85, My Week +8/−92). Listing order was checked by name sequence rather than
by height, since a reordered grid is the same height as a correct one — Home,
Little Havana and Hialeah all now match the reference exactly.

Two deltas are explained rather than fixed: My Week at 390 is 92px shorter than
the reference because the stat tiles (finding 7) are still missing, and
Business at 390 is 225px shorter — a pre-existing difference on a route outside
this review, left alone rather than folded in.

## Findings, worst first

### 1. List Your Spot accepts a submission with no city and no category

Both selects are `defaultValue=""` with an empty leading `<option>`, and neither
carries `required` — only `business` and `phone` do. A listing request can be
submitted with both relationships null.

This is the one finding that corrupts data rather than pixels. The PR body says
the form was "verified by submitting from the Spanish page — the row lands with
`havana`/`food` as relationships"; that verification passed because the submitter
chose values. Nothing enforces it.

The source pre-selected the first real option, so a city and category were always
present. Two ways to fix, and they are not equivalent — **blank + `required` is a
deviation from the source**, arguably a better one, because a pre-selected
"Hialeah" silently mislabels every request from someone who does not notice the
field. Worth an explicit decision rather than a silent choice.

**Fixed** — `required` on both selects, blank first option kept. The reasoning is
recorded in the component's own comment so nobody "restores" the source default
later without reading why.

### 2. Event page — the entire right-hand column is missing

The source wraps "also that day" and a sidebar in one grid
(`Event.dc.html:85`, `data-stack`, `1.5fr 0.9fr`). The port renders only the
left column and stops. Three panels never got ported:

- **WHEN & WHERE** — venue, neighbourhood, city, date · time, and a
  `SEE THE LISTING →` button shown when the event has a listing.
- **GOING WITH THE CREW?** — copy plus the city mascot on its tinted panel.
- **GOT SOMETHING HAPPENING?** — the cyan `POST AN EVENT` card linking to
  List Your Spot.

Measured: port 1300px tall against the reference's 1781px at 1280.

### 3. Events board — the spotlight hero and the post-an-event card are missing

- **ON DECK / THE ONE THING NOT TO MISS THIS WEEK** — the whole featured-event
  hero (`Events.dc.html:70`), image, title, details and `SEE THE EVENT →`.
- **GOT SOMETHING HAPPENING? / POST AN EVENT** (`Events.dc.html:313`).

Neither string exists anywhere in the ported route.

### 4. Events calendar loses its weekday headings below 720px

The breakpoint mechanism is sound — `[data-caltitles]` hides and `[data-caldots]`
shows at ≤720 in both. But the port also puts `data-caltitles` on the **weekday
header row** (`events/page.tsx:671`), which the source never does — in
`Events.dc.html` the attribute appears once, on the per-cell titles container
(line 270). So at ≤720 the port hides `SUN MON TUE WED THU FRI SAT` along with
the day titles, and the calendar loses its column labels.

This is what the element counts were pointing at: reference 42/42 (every grid
cell), port 32/31 — the one unmatched `caltitles` is the header row.

**Fixed** — the attribute is off the heading row. All seven headings render at
720 again.

### 5. Stories features the wrong story, because the query has no sort

Both sides use the same rule — first story is featured, rest go below
(`Stories.dc.html:131-132` uses `slice(0,1)` / `slice(1)`; the port destructures
`const [feature, ...rest]`). The difference is the order they receive.

`getStories` (`lib/data.ts:114`) passes no `sort`, so Payload falls back to
`-createdAt` and hands back the stories newest-first. Seeded order is
`el-gallo(1), pan-cubano(2), sparkle(3)`; the page renders `3, 2, 1`. The
reference features *The sign his brother painted*, the port features *The same
two people, every time*.

**`getListings` (`lib/data.ts:87`) has the same missing `sort`.** Every other
query in `data.ts` sets one explicitly (`cities`/`categories`/`event-kinds` by
`order`, `events` by `date`, `weekly-events` by `dow`). Listings feed the Home
and City grids, which were reviewed in phase 2 and passed — so either ordering
did not matter there or it was not noticed.

**Fixed** — both queries now sort by `createdAt`, which is seed order and so
authored order. Stories features *The sign his brother painted* again, with the
shelf in source order behind it. The listings change was made for the same
reason but its effect on the Home and City grids was **not** visually
re-checked; those pages are outside this review's six.

### 5b. Home's spotlight row runs in reversed city order

Found while regression-checking, not during the six-route pass. `getSpotlights`
(`lib/data.ts:198`) was the third query with no `sort`, so the row came back
`-createdAt` and printed Little Havana → Miami Lakes → Hialeah against the
source's Hialeah → Miami Lakes → Little Havana. Home was reviewed and approved in
phase 2 with this already wrong.

**Fixed** — `sort: 'createdAt'`, same as the other two.

### 6. Stories — the call-to-action card is missing

"Also on the shelf" has three slots in the source: two stories and a cyan
**YOUR STORY GOES HERE / LET US INTERVIEW YOU →** card. The port renders only
the two stories, leaving the third column empty.

### 7. My Week — hero stat tiles missing

The source hero is a `1.2fr 0.8fr` grid whose right column holds two counters,
**SAVED** and **GOING**. The port renders the hero as a plain block with no
counters.

### 8. About — the city mascot panels lost their backdrop

All three panels render flat cyan. The cause is a shadowed field: `fc-data.js`
carries a literal `castBg: '#00feff'` on each city, but `About.dc.html:148`
**ignores it** and computes its own — an `accent`-tinted wash at 62% over the
city photo, falling back to `accent` when there is no photo. The seed imported
the literal field and the page renders that, so every city gets cyan instead of
pink / cyan / yellow over its own street photo.

Note for whoever fixes this: the Event page's **GOING WITH THE CREW?** panel and
the events **ON DECK** hero use the same tinted-mascot treatment. Fix the
backdrop computation once as a shared helper, or the flat-cyan bug ships into
two more places.

**Fixed** — `lib/castBg.ts` computes it, and About uses it. The helper exists
precisely so the two deferred panels above can reuse it rather than reach for
the dead `castBg` field again.

### 9. Systemic — `min-height:100vh` is applied below the nav

`PageShell` sets `minHeight: 100vh`, but in the App Router `Nav`, `children` and
`Footer` are siblings, so the shell starts *below* the nav. Total page height
becomes `nav + 100vh + footer` rather than the source's `100vh` for the whole
document, which wraps the nav (`MyWeek.dc.html:47`).

Measured, My Week at 1280:

| | nav | content | footer | total |
| --- | --- | --- | --- | --- |
| reference | 0–104 | 104–662 | 662–887 | 900 (stretched) |
| port | 0–104 | 104–1004 | 1004–1229 | 1229 |

In the source the slack falls **below** the footer; in the port it opens up
**between the content and the footer**, as ~320px of empty background. Invisible
on long pages, which is why it survived — every page checked in phase 2 was long
enough to hide it.

**Fixed** — `minHeight: 100vh` moved onto a wrapper in `layout.tsx` that contains
nav, children and footer, and dropped from `PageShell`. My Week now measures
908px against the reference's 910.
