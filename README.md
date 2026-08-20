# Flamingo County

A bilingual (EN/ES) business and events directory for **Hialeah**, **Miami Lakes** and
**Little Havana** — [flamingocounty.com](https://flamingocounty.com).

Imported from the [Claude Design](https://claude.ai/design) project
`995e950f-884e-4e65-97b9-6e5b80d13137` and deployed to Netlify as a static site.

## Run it locally

```sh
python3 -m http.server 8080
# → http://127.0.0.1:8080/Home.dc.html
```

Any static server works. Do **not** open the files over `file://` — `<dc-import>`
loads sibling components over `fetch`, which needs an http origin.

## How this is built

The pages are **not** plain HTML. Each `.dc.html` file is a Claude Design component:

```html
<head><script src="./support.js"></script></head>
<body>
<x-dc>
  <helmet> … fonts, favicons, global <style> … </helmet>
  <dc-import name="Nav" active="home"></dc-import>
  <h1>{{ t.heroH1a }}</h1>
  <sc-for list="{{ list }}" as="b"> … <sc-if value="{{ b.showRating }}"> … </sc-if> </sc-for>
  <dc-import name="Footer"></dc-import>
</x-dc>
<script type="text/x-dc" data-dc-script>
class Component extends DCLogic { renderVals() { … } }
</script>
</body>
```

`support.js` is the dc-runtime: it parses the template, hoists `<helmet>` into
`<head>`, resolves `{{ }}` / `<sc-for>` / `<sc-if>` / `<dc-import>`, and mounts the
result with React (loaded UMD from unpkg with SRI). **There is no build step** —
that is why `netlify.toml` has an empty build command.

**Every script in the page's own `<helmet>` executes twice.** `<helmet>` is not a real
element, so the browser's parser runs its `<script src>` children natively as body
content; the runtime then clones those same tags into `<head>`, where they run a second
time. (Imported components are a different path — they are fetched as text and their
helmets rewritten to `<sc-helmet>`, so they never execute natively.) Anything with a
side effect must therefore be idempotent, and all three of `image-slot.js`,
`no-touch-hover.js` and `fc-data.js` carry a guard for exactly this:
`customElements.get()`, a `__ntHoverPatched` flag, and `script[data-fc-i18n]`.

| File | What it is |
| --- | --- |
| `support.js` | The dc-runtime. Generated upstream — never edit by hand. |
| `fc-data.js` | `window.FCBase`: cities, listings, events, stories, the EN→ES dictionary, ICS generation, `href()`, `qp()`, and the Netlify form POST helper. |
| `image-slot.js` | The `<image-slot>` element (see *Photos* below). |
| `no-touch-hover.js` | Gates every `:hover` rule behind `(hover:hover)` so taps don't stick. |
| `vendor/i18next.min.js` | i18next `26.3.6`, UMD build, copied verbatim from `https://unpkg.com/i18next@26.3.6/dist/umd/i18next.min.js`. Vendored rather than CDN-linked so local dev works offline. See *Language*. |
| `*.dc.html` | One file per route, plus `Nav` and `Footer` as shared components. |
| `forms.html` | Unlinked. Exists only so Netlify can register the forms — see *Forms*. |
| `ROUTES.md` | Route map, and a sketch of a future Next.js port. Reference only. |

## URLs

Links are real `<a href>` navigations and all state lives in the query string, so
every view is shareable: `?city=`, `?biz=`, `?s=`, `?e=`, `?cat=`, `?q=`, `?kind=`,
`?view=`, `?month=`, `?lang=en|es`. The language starts from the device's own
language settings and persists per device once the visitor picks one — see
*Language*.

`_redirects` adds clean aliases (`/events`, `/about`, `/list-your-spot`, …) as 200
rewrites alongside the canonical `.dc.html` paths. **Read the comments in that file
before changing it** — the no-trailing-slash rule is load-bearing.

*Follow-up, deliberately not done yet:* point `href()` in `fc-data.js` at the clean
paths so internal links use them too. It's a one-line map change, but it alters
which URL the runtime resolves `Nav.dc.html` against, so it wants its own test pass.

## Language

EN/ES resolution lives in `fc-data.js`, first hit wins:

1. `?lang=en|es` — shared links keep their language. Clamped and case-insensitive:
   `?lang=ES` works, and anything that isn't Spanish (`?lang=fr`) resolves to `en`
   rather than landing in `<html lang>` as-is.
2. The saved choice in `localStorage` (`fc.lang`) — written **only** by `setLang()`,
   i.e. only when someone clicks the EN/ES toggle in the nav.
3. `detectLang(navigator.languages)` — the first entry whose primary subtag is `es`
   or `en`, so `es-419`, `es-MX` and `es-US` all resolve to Spanish, and
   `["fr-FR", "en-US"]` resolves to English.
4. `'es'` — only reached when the device asks for nothing this site can serve.

**Step 3 must never be persisted.** If a detected language were written to `fc.lang`,
that stored value would win on step 2 from then on and the device setting would be
ignored forever. This is also why `i18next-browser-languagedetector` is not used: it
caches to `localStorage` by default, and its localStorage reader expects raw strings
while `lsSet()` here stores JSON.

`T()` looks strings up through i18next; the dictionary is the `ES`/`EV_ES` maps in
`fc-data.js`, handed to `i18next.init()` at the bottom of that file. Two init options
are load-bearing:

- `keySeparator: false` **and** `nsSeparator: false` — the keys *are* the English
  strings, and 120 of them contain `.` or `:` (`"FILTER:"`). Without these, i18next
  reads those as nesting/namespace paths and the lookup silently misses.
- `lng: 'es'` is pinned, because `T()` returns the key untouched for English.

i18next is loaded by `fc-data.js` itself rather than from a `<helmet>` script tag:
helmet injects scripts with `createElement` + `appendChild`, which makes them async,
so load order relative to `fc-data.js` is not guaranteed. Until it lands, `T()` reads
`ES`/`EV_ES` directly — byte-identical output for all 367 keys, so there is no flash.
The trade-off is that a failed load is invisible in the page; `isInitialized` is the
assertion worth checking, and there is an `onerror` warning in the console.

The `{city}`-style single-brace placeholders in the dictionary are replaced by this
site's own code, not by i18next (whose syntax is `{{ }}`). Moving them to i18next
interpolation is an optional follow-up.

## Forms

Netlify detects forms by scanning deployed HTML **at deploy time**. The real forms
are rendered into the DOM at runtime, so that scan finds nothing. Hence:

- `forms.html` carries the plain static markup Netlify registers (`list-your-spot`
  and `newsletter`, with a honeypot).
- The live forms POST a matching payload through `FCBase.netlifySubmit()` in
  `fc-data.js`.

**Field names must stay in sync between `forms.html`, `fc-data.js` and
`ListYourSpot.dc.html`.** After any change, check the Netlify **Forms** tab and send
a real test submission — a page that renders is not proof that submissions land.

## Photos

`<image-slot>` resolves images from a `.image-slots.state.json` sidecar next to the
page. That file does not exist in the project, so every business photo, story cover
and event image renders as a labelled placeholder. This is intentional for now.

Real photography that *does* render: the skyline hero and the three city photos
(responsive, via `PHOTOS`/`pickPhoto` in `fc-data.js`), the mascots, the robot
receptionist, the perk icons, and the scene stills.

To fill the slots, drop images onto them in the Claude Design canvas and re-sync.

## Re-syncing from Claude Design

Editing files here forks them from the design project — there is no automatic sync
back. Rule of thumb:

- **Edit in the Claude Design canvas, then re-pull:** `*.dc.html`, `fc-data.js`,
  and anything under `assets/`, `mascots/`, `uploads/`.
- **Edit here — these do not exist in the design project:** `netlify.toml`,
  `_redirects`, `forms.html`, `README.md`, `.gitignore`, `vendor/`, `manifest.json`,
  `sw.js`, `pwa.js`, `offline.html`.
- **`fc-data.js` carries local edits on top of the design version.** A re-pull
  overwrites them, so re-apply these five hunks. Four are described under
  *Language*: `detectLang()`, `resolveLang()` + `lang()`, the i18next branch in
  `T()`, and the `<html lang>` + loader block above `window.FCBase = B`. The
  fifth is the **pricing removal in the `ES` map** — the membership-fee keys
  (`JOIN FOR`, `/MO`, `PER MONTH · NO CONTRACT`, `FIRST 30 DAYS FREE`,
  `START MY 30 FREE DAYS`, `THE MENU`, …) were deleted and several strings
  rewritten to drop the price. `web/src/i18n/dictionary.generated.ts` is built
  from this map by `pnpm gen:dictionary`, so a re-pull silently puts `$20` and
  `al mes` back into the Spanish copy.
- **The `.dc.html` files carry two PWA edits each** (described under *Homescreen
  install*). A re-pull overwrites both, so re-apply: the 8-line block in the real
  `<head>` of the ten route pages, and the deletion of the `apple-touch-icon` line
  from the `<helmet>` of **all twelve** files — `Nav` and `Footer` included, because
  their helmets are hoisted into `<head>` too.

Two things bit us on the way in, worth knowing before the next pull:

1. The design MCP's `get_file` **truncates at 256 KiB** and sets `truncated: true`.
   Anything larger comes back corrupt — check that flag.
2. `Flamingo County.dc.html`, the deprecated single-page build, was left behind
   deliberately. Don't deploy or link it.

## Homescreen install (PWA)

The site installs to an iPhone or Android homescreen and launches full-screen with no
browser chrome. There is no app-store build — this is the web app itself.

| File | What it is |
| --- | --- |
| `manifest.json` | Name, icons, `start_url: "/"`, `scope: "/"`, `display: standalone`. `theme_color` matches the sticky nav (`#0C0F14`), `background_color` matches `body` (`#FF2E88`) so the launch splash is on-brand. |
| `sw.js` | The service worker. **Android Chrome only offers to install when one with a `fetch` handler is registered** — it is not optional. |
| `pwa.js` | Registers the worker; shows Chrome's install prompt on Android and a "Share → Add to Home Screen" hint on iOS. Loaded from each page's real `<head>`. |
| `offline.html` | Shown when a navigation fails and nothing is cached. |
| `uploads/fc-*.png` | The install icons: 192, 512, a padded 512 `maskable`, and an opaque 180 `apple-touch-icon`. |

**`sw.js` caching mirrors `netlify.toml` on purpose.** `.dc.html` pages and the
root-level `.js` runtime are **network-first**, because they carry
`max-age=0, must-revalidate` there for the reason given above — they version as a unit,
and a cached page served against a newer `fc-data.js` is a page the runtime cannot
compile. `/assets`, `/mascots`, `/uploads` and `/vendor` are cache-first, matching their
one-year `max-age`. **Bump `CACHE` in `sw.js` on any deploy that touches a page or a
runtime script**; `activate` drops every other cache.

`support.js` fetches React, ReactDOM and Babel from unpkg at runtime, so nothing renders
without them — `sw.js` caches those pinned URLs too, or an offline revisit would be a
blank page. This is also why `offline.html` is plain HTML rather than a `.dc.html`.

**Two things that will break silently if changed:**

- `sw.js` returns early on any non-GET request. `FCBase.netlifySubmit()` POSTs to `/`,
  so touching non-GET requests kills both forms — in production, for installed users
  only. See *Forms*: a page that renders is not proof a submission lands.
- The PWA tags live in the real `<head>`, not in `<helmet>`. Chrome reads
  `<link rel="manifest">` off the parsed document to decide installability, and helmet
  tags only reach `<head>` after the runtime boots. The static head also keeps `pwa.js`
  clear of the double-execution problem above.

The old transparent `apple-touch-icon` was removed from every `<helmet>`, including
`Nav` and `Footer`. Imported components' helmets are hoisted into `<head>` as well, so
leaving it there would append it *after* the opaque one and win — iOS composites black
behind transparency, which is the artifact the new icon exists to avoid.

iOS standalone behavior cannot be checked in DevTools or Playwright. Verify install on a
real iPhone before calling a change to any of this done.

## Deploy

Pushes to `main` auto-deploy to Netlify. Publish directory is the repo root, no
build command.

## Custom domain (flamingocounty.com)

The domain is already added to the Netlify site (apex + `www` alias). What's left is
the DNS change at GoDaddy — the domain still points at GoDaddy's parking IPs and uses
their nameservers (`ns07/ns08.domaincontrol.com`).

In **GoDaddy → My Products → flamingocounty.com → DNS → Manage Zones**:

| Action | Type | Name | Value | TTL |
| --- | --- | --- | --- | --- |
| **Edit** the existing `@` record | `A` | `@` | `75.2.60.5` | 600 |
| **Add** (or edit if `www` exists) | `CNAME` | `www` | `flamingo-county.netlify.app` | 600 |

Delete any other `A` or `CNAME` record on `@` or `www` first — GoDaddy's parking
records will otherwise win. Leave `MX` and `TXT` records alone.

`75.2.60.5` is Netlify's apex load balancer (`apex-loadbalancer.netlify.com`). GoDaddy
can't do ALIAS/ANAME at the apex, which is why this is an `A` record rather than a
CNAME to the `.netlify.app` name.

Once it propagates (usually minutes, up to an hour), Netlify provisions the Let's
Encrypt certificate automatically. If it hasn't after DNS resolves, nudge it in
**Site configuration → Domain management → HTTPS → Verify DNS configuration**.

Check propagation with:

```sh
dig +short flamingocounty.com A        # want 75.2.60.5
dig +short www.flamingocounty.com      # want flamingo-county.netlify.app
```
