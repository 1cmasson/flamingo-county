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

| File | What it is |
| --- | --- |
| `support.js` | The dc-runtime. Generated upstream — never edit by hand. |
| `fc-data.js` | `window.FCBase`: cities, listings, events, stories, the EN→ES dictionary, ICS generation, `href()`, `qp()`, and the Netlify form POST helper. |
| `image-slot.js` | The `<image-slot>` element (see *Photos* below). |
| `no-touch-hover.js` | Gates every `:hover` rule behind `(hover:hover)` so taps don't stick. |
| `*.dc.html` | One file per route, plus `Nav` and `Footer` as shared components. |
| `forms.html` | Unlinked. Exists only so Netlify can register the forms — see *Forms*. |
| `ROUTES.md` | Route map, and a sketch of a future Next.js port. Reference only. |

## URLs

Links are real `<a href>` navigations and all state lives in the query string, so
every view is shareable: `?city=`, `?biz=`, `?s=`, `?e=`, `?cat=`, `?q=`, `?kind=`,
`?view=`, `?month=`, `?lang=en|es`. The language also persists per device in
`localStorage`.

`_redirects` adds clean aliases (`/events`, `/about`, `/list-your-spot`, …) as 200
rewrites alongside the canonical `.dc.html` paths. **Read the comments in that file
before changing it** — the no-trailing-slash rule is load-bearing.

*Follow-up, deliberately not done yet:* point `href()` in `fc-data.js` at the clean
paths so internal links use them too. It's a one-line map change, but it alters
which URL the runtime resolves `Nav.dc.html` against, so it wants its own test pass.

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
  `_redirects`, `forms.html`, `README.md`, `.gitignore`.

Two things bit us on the way in, worth knowing before the next pull:

1. The design MCP's `get_file` **truncates at 256 KiB** and sets `truncated: true`.
   Anything larger comes back corrupt — check that flag.
2. `Flamingo County.dc.html`, the deprecated single-page build, was left behind
   deliberately. Don't deploy or link it.

## Deploy

Pushes to `main` auto-deploy to Netlify. Publish directory is the repo root, no
build command.
