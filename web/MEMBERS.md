# Member accounts — plan

**Status: built on `1cmasson/member-accounts`, not yet live.** Before launch:
a Google Cloud OAuth client, a privacy policy page, and the new Railway env vars
(see *Deployment*). Everything else below exists in the code.

Where it landed:

| Piece | File |
| --- | --- |
| Better Auth config | `src/lib/auth.ts` |
| Its endpoints | `src/app/api/auth/[...all]/route.ts` |
| Its schema, on boot | `src/lib/auth-migrate.ts` (`pnpm auth:migrate`) |
| Members collection | `src/collections/Members.ts` + migration `20260928_164435_add_members` |
| Server read/write | `src/lib/members.ts`, `src/app/api/me/saved/route.ts` |
| Sync | `src/lib/saved.ts` (*Sync* section), started by `src/components/MemberSync.tsx` |
| My Week UI | `src/components/MyWeekAccount.tsx` |
| In-app browser detection | `src/lib/webview.ts` |
| Tests | `tests/e2e/members.e2e.spec.ts`, `tests/int/webview.int.spec.ts`, `tests/int/savedLists.int.spec.ts` |

Two small departures from the plan below: My Week's copy follows the page's
existing inline `es ? … : …` pattern rather than `overrides.ts`, and the account
panel sits under the list rather than inside the empty state.

Goal: a visitor signs in with Google and their My Week — saved events and the
events they're going to — follows them to every device. Signed-out visitors keep
exactly today's behaviour.

My Week already promises this in its empty state: *"Saved on this device — a
member account keeps it everywhere."* This is the account that sentence refers to.

Before writing any code, read the relevant guides in `node_modules/next/dist/docs/`
— `AGENTS.md` is explicit that this Next is not the one in training data.

---

## Where things stand

- **One store.** Every save and every "going" tap goes through `useSaved()` in
  `src/lib/saved.ts`: a `useSyncExternalStore` over `localStorage` keys
  `fc.saved` / `fc.going` (arrays of event slugs). Its four consumers —
  `Nav.tsx` (badge), `EventActions.tsx`, `MyWeekList.tsx`, `MyWeekLink.tsx` —
  never touch storage directly. **Sync is added inside this hook and nowhere
  else**, so the consumers do not change.
- **Payload's `users` collection is the admin login** (`admin.user: Users.slug`).
  Anyone in it gets the admin panel. Members must never land there.
- **No outgoing email.** No email adapter is configured; `Subscribers` only
  stores addresses. This matters for the in-app-browser fallback below.
- **`src/proxy.ts` already skips `/api`** (`matcher` excludes
  `admin|api|_next|…`), so an auth route under `/api/auth` is not rewritten to
  `/es/api/auth`. Anything auth-related placed *outside* `/api` would be — keep
  it under `/api`.
- **Payload owns `app/(payload)/api/[...slug]`.** A static `app/api/auth/[...all]`
  segment takes precedence over a catch-all in Next's routing, but confirm
  `/api/users/me` and the admin login still work after adding it (the existing
  `admin.e2e.spec.ts` covers the login).
- **Rendering is dynamic** (`force-dynamic` on the `[lang]` layout and pages), so
  reading a session on the server costs nothing new architecturally.

---

## Proposed design

### 1. Auth: Better Auth, in its own database file

Better Auth handles the Google redirect, state/PKCE, sessions and cookies, and has
a first-party Next handler (`toNextJsHandler`) and a server-side
`auth.api.getSession({ headers })`.

- Route: `src/app/api/auth/[...all]/route.ts`.
- Provider: Google only. No email/password (see *Open decisions* for the
  fallback).
- Google OAuth redirect URI:
  `https://flamingocounty.com/api/auth/callback/google`, plus the `localhost`
  equivalent for dev.
- **Database: a separate SQLite file, `/data/auth.db`, on the same Railway
  volume** — not tables inside `content.db`.
  Why: CMS.md records that dev uses Payload's push mode and that push mode has
  already hidden migration drift once. A Drizzle push against a database
  containing tables Payload didn't declare may offer to drop them. Until that is
  verified *not* to happen, sharing the file is a risk to member data for no gain.
  If it is later proven safe, merging is possible; splitting after launch is
  harder.

Rejected alternative — Payload auth on a `members` collection plus a community
Google OAuth plugin: fewer moving parts, but the plugins are thin, public sign-up
isn't what Payload auth is designed around, and each Payload upgrade (we're on
3.88) becomes a compatibility check. Worth revisiting only if Better Auth +
SQLite turns out awkward.

### 2. The saved lists live in Payload, in a `members` collection

One home for the data, visible to staff in the admin:

| Field | Type | Notes |
| --- | --- | --- |
| `authId` | text, unique, indexed | Better Auth user id — the join key |
| `email` | email | copied from Google on first sign-in, for staff lookup |
| `name` | text | from Google |
| `lang` | select en/es | last language used |
| `saved` | json | array of event slugs |
| `going` | json | array of event slugs |

- **Not an auth collection** (no `auth: true`) — Better Auth owns identity; this
  is just data. That also means members can never reach the admin.
- Access: `read`/`update`/`delete` staff-only via Payload's `req.user`. Members
  never talk to Payload's REST API; they go through our own route (below), which
  uses the Local API with `overrideAccess` after checking the Better Auth session.
- Admin group: `Inbox`, next to `Subscribers` and `ListingRequests`.
- Needs a migration (`payload migrate:create`), **executed** against a scratch db
  before merging, per the lesson in CMS.md.

### 3. One sync endpoint

`src/app/api/me/saved/route.ts`:

- `GET` → `{ saved, going }` for the signed-in member (401 if not).
- `PUT` → replaces both lists. Body is small; whole-list writes avoid a merge
  protocol. Server validates: arrays of strings, capped length, and **drops slugs
  that no longer match an event** (see *Renamed events*).

Whole-list replace means two devices editing at the same second can lose one
tap. For a personal list at this scale that's acceptable; noted, not solved.

### 4. `useSaved()` gains a sync layer

Signed out: unchanged, byte for byte.

Signed in:

1. **First sign-in on a device** — union the device's lists with the account's,
   `PUT` the result, write it back to localStorage. Nothing a visitor saved before
   signing in is lost.
2. **Every later page load** — `GET`, and the server copy **replaces** local.
   (Union only happens once per sign-in; after that, union would resurrect events
   removed on another device.)
3. **Every toggle** — update localStorage and emit immediately (the UI never waits),
   then `PUT` in the background, debounced. On failure, keep local and retry on
   the next toggle or `online` event.
4. **Sign-out clears `fc.saved` / `fc.going`** on that device. Two reasons: shared
   family phones, and preventing the next sign-in's union from reviving stale
   picks.

The hook learns whether someone is signed in from a small session flag passed down
from the `[lang]` layout (server-read via `getSession`) — not a client fetch — so
the first paint knows. `ready` keeps its current hydration role.

The existing cross-tab behaviour (`storage` event) keeps working because
localStorage stays the thing the UI reads.

### 5. UI

**Sign-in is offered on My Week only** (decided). No nav sign-in link and no
nudge after a save — the rest of the site stays exactly as it is for signed-out
visitors.

- **My Week, signed out:** under the list (or in the empty state), the existing
  "a member account keeps it everywhere" line becomes a "Sign in with Google"
  button. In an in-app browser, the *Open in your browser* prompt replaces the
  button (see below).
- **My Week, signed in:** a small account line at the top — name, "Synced
  across your devices", Sign out, Delete account.
- **Nav:** unchanged. The badge keeps counting saved events whether or not
  anyone is signed in.

**In-app browser prompt** (decided — no email sign-in):

- Detect embedded webviews by user agent, server-side from the request headers
  so the right thing renders on first paint: `Instagram`, `FBAN`/`FBAV`/`FB_IAB`
  (Facebook, Messenger), `musical_ly`/`BytedanceWebview` (TikTok), `Line/`,
  `Snapchat`, generic Android `; wv)`. Keep the list in one function in
  `src/lib/` with a unit test per UA string.
- Instead of the Google button, show: "To sign in, open this page in Safari /
  Chrome", with a **Copy link** button and a one-line hint for where the app's
  own "Open in browser" menu is (iOS: ⋯ → Open in Safari; Android: ⋮ → Open in
  Chrome).
- On Android, also offer a direct "Open in Chrome" link via an
  `intent://…#Intent;scheme=https;package=com.android.chrome;end` URL, which most
  Android webviews honour. iOS has no equivalent, so iOS gets copy-link only.
- Detection will miss some webviews. If one slips through, the visitor sees
  Google's `disallowed_useragent` page — the same as having no prompt at all,
  so a miss costs nothing extra. When a new user agent turns up, add it to the list.
- **Delete account:** confirm screen → deletes the Better Auth user, its sessions
  and the `members` row, then clears local storage. Required by Google's OAuth
  policy for apps that request user data, and by Apple if this is ever wrapped as
  an app.
- All copy in both languages: English strings are the keys; Spanish goes in
  `src/i18n/overrides.ts` so `pnpm gen:dictionary` can't revert it.
- Google's button branding rules apply (their logo, "Sign in with Google" /
  "Iniciar sesión con Google").

### 6. Deployment

New Railway env vars:

| Var | Value |
| --- | --- |
| `BETTER_AUTH_SECRET` | fresh random string |
| `BETTER_AUTH_URL` | `https://flamingocounty.com` |
| `AUTH_DATABASE_URL` | `file:/data/auth.db` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from Google Cloud |

- Auth schema migration runs on boot, alongside `payload migrate`, in
  `docker-entrypoint.sh`.
- `auth.db` must sit under `/data` or it vanishes on redeploy — same rule as
  `content.db` and media.
- **Backups:** there are now two database files on the volume, and `auth.db` holds
  personal data. Whatever backs up `content.db` must cover both.
- Add the new vars to the *Deploying to Railway* table in CMS.md.

Google Cloud side:

- OAuth client (Web), consent screen in **production** mode (testing mode caps
  at 100 users and expires tokens after 7 days).
- Scopes: `openid email profile` only — basic scopes don't require Google's
  verification review.
- Consent screen needs a privacy policy URL and a homepage URL on the verified
  domain. **There is no privacy policy page today**; one has to exist before
  launch.

---

## Things that will bite if not planned for

- **In-app browsers.** Google refuses OAuth inside embedded webviews
  (Instagram, Facebook, TikTok, some Messenger/WhatsApp link previews) with
  `Error 403: disallowed_useragent`. A local directory gets a lot of its traffic
  exactly this way. Handled by the *Open in your browser* prompt in §5.
- **Renamed events.** Lists store event slugs, and CMS.md documents that
  renames happen. A renamed event silently disappears from My Week. The `PUT`
  handler drops unknown slugs; if renames are common, keep a slug-redirect map
  and remap instead of dropping.
- **The "going" count.** `EventActions` shows `seeded + 1 if you're going`. With
  accounts, a real count across members becomes possible — **out of scope**, but
  the `members.going` field is what would feed it.
- **Admin separation.** Test that a signed-in member gets nothing from `/admin`
  and `/api/users/me`.

---

## Decisions

Made:

- **In-app browsers → detect and prompt "Open in Safari/Chrome".** No email
  sign-in, so no email provider is needed. (§5)
- **Sign-in is offered on My Week only.** No nav link, no post-save nudge. (§5)

Still open:

1. **Library.** Better Auth (recommended above) vs Payload auth + a community
   Google plugin. Confirm current package names/versions on npm at build time —
   nothing is pinned in this plan.
2. **Privacy policy.** Who writes it, and in both languages.

---

## Build order

1. Google Cloud OAuth client (dev redirect only) and env vars locally.
2. Better Auth route + `auth.db`; sign in / sign out works on localhost.
3. `members` collection + migration (executed, not just generated).
4. `/api/me/saved` with validation.
5. Sync layer in `useSaved()`.
6. My Week sign-in / account UI, EN/ES copy.
7. Delete account.
8. In-app browser detection + *Open in your browser* prompt.
9. Tests — see below.
10. Privacy policy page; production consent screen; Railway env vars and prod
    redirect URI; deploy.

Estimate: 2–3 days of build, plus Google consent-screen setup and the privacy
policy, which are calendar time rather than code time.

## Tests

`tests/e2e` can't drive real Google sign-in. Seed a Better Auth session directly
(test-only helper that creates a user + session and sets the cookie), then cover:

- signed-out save/unsave unchanged (existing frontend spec should stay green)
- first sign-in merges device picks with account picks
- later load: server copy wins; removal on "device A" doesn't come back on "B"
- sign-out clears local lists
- delete account removes the member row and the auth user
- member cannot reach `/admin`
- My Week renders the *Open in your browser* prompt, not the Google button, for
  an Instagram / Facebook user agent (Playwright `userAgent` override); every
  other page is unchanged
- webview detection: one `tests/int` case per known UA string, plus desktop
  and mobile Safari/Chrome as negatives
- `PUT` rejects junk and drops unknown slugs (`tests/int`)
