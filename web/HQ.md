# Flamingo HQ — the ops layer

A private layer on the same Payload app and database as the site, for the owner
only. Phase 1 has three parts:

- **Intake pings.** A new listing request or newsletter signup is logged to
  `hq-events` and sent to Telegram. Before this they sat in the admin until
  someone looked.
- **Morning brief.** At 7:30 AM Miami time, Telegram gets a summary: what
  happened since the last brief, what is waiting (new requests, drafts to
  approve, listings needing owner confirmation), open tasks, and posts going out
  in the next 24 hours.
- **Social approvals.** A draft in `hq-social-drafts` is previewed in Telegram
  with its cover photo or video and **Approve / Reject** buttons. Approve
  uploads the files to Postiz and schedules the post on Facebook, Instagram or
  TikTok. Nothing is posted without that tap.

Everything is in the admin under **HQ**. The code is in `src/lib/{hq,brief,telegram,telegramBot,postiz}.ts`,
`src/collections/Hq*.ts`, `src/jobs/morningBrief.ts` and `src/app/api/telegram/route.ts`.

## Setting it up

1. **Create the bot.** In Telegram, message `@BotFather` and send `/newbot`. Its
   token is `TELEGRAM_BOT_TOKEN`. Use a *different* bot from the Claude Code
   Telegram channel, because two consumers of one token steal each other's
   updates.
2. **Find your chat id.** Message the new bot once, then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and read `message.from.id`.
   That is `TELEGRAM_OWNER_CHAT_ID`. Do this *before* step 4, since `getUpdates`
   stops working once a webhook is set.
3. **Get a Postiz API key.** In Postiz, open Settings → Public API. It's the
   same workspace key the Postiz MCP connection uses, without the `Bearer `
   prefix. Postiz keeps one key per workspace, so creating a new one breaks the
   MCP until its setting is updated. The base URL is
   `https://postiz.flamingocounty.com/api/public/v1`. It must include `/api`:
   the bare `/public/v1` is the frontend and redirects to `/auth`.
4. **Set the Railway variables**, then deploy. The migration runs on boot:

   | Variable | Value |
   | --- | --- |
   | `TELEGRAM_BOT_TOKEN` | from BotFather |
   | `TELEGRAM_OWNER_CHAT_ID` | your numeric user id |
   | `TELEGRAM_WEBHOOK_SECRET` | a fresh random string, `[A-Za-z0-9_-]` only |
   | `POSTIZ_API_URL` | `https://postiz.flamingocounty.com/api/public/v1` |
   | `POSTIZ_API_KEY` | from Postiz |

5. **Point Telegram at the site.** Run this once. Use the bare domain, because
   `www` redirects and Telegram does not follow redirects:

   ```sh
   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -d url=https://flamingocounty.com/api/telegram \
     -d secret_token=$TELEGRAM_WEBHOOK_SECRET \
     -d 'allowed_updates=["message","callback_query"]'
   ```

6. Send the bot `/brief`. If the brief comes back, everything is connected.
   If nothing comes back, ask Telegram what happened:

   ```sh
   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
   ```

   `last_error_message` gives the reason, and a growing `pending_update_count`
   means updates aren't getting through. Cloudflare sits in front of the site:
   a 403 there means it is challenging Telegram's POSTs to `/api/telegram`,
   which needs a WAF skip rule for that path.
7. **Test the approval flow on a throwaway post.** Create a Facebook-only draft
   scheduled weeks out, approve it, confirm it appears in the Postiz calendar,
   then delete it there. The Postiz upload and post-creation formats come from
   the docs and have been tested only against a fake, so this first run is the
   real check.

Without the Telegram variables, nothing breaks. Events are still logged, the
webhook answers 503 and the brief job skips.

## Telegram commands

| Command | Does |
| --- | --- |
| `/brief` | The brief, now. This doesn't move the next scheduled brief's window. |
| `/inbox` | New events, newest first. |
| `/seen` | Mark every new event seen. |
| `/done <id>` | Mark one event done. |
| `/tasks` | Open tasks. 🤖 marks the ones assigned to Claude. |
| `/task <text>` | File a task for Claude. Claude Code picks these up. |

Social drafts and site publish requests arrive as messages with buttons:
Approve / Reject and Publish / Reject.

Only `TELEGRAM_OWNER_CHAT_ID` gets answers. Anyone else is ignored without a
reply.

## Measuring the posts

Three sources, all saved in the database so the history outlives Postiz, which
fetches stats live and keeps none:

- **Post checkpoints.** The hourly `socialStats` job (at :45) saves each
  published post's Postiz stats 24 hours, 3 days and 7 days after it went out,
  to `hq-social-stats`. Measuring every post at the same ages is what makes them
  comparable. Postiz answers `[]` until a post is live and matched, so an empty
  reply is retried hourly for 48 hours, then skipped. A gap is never stored as
  zeros.
- **Account snapshots.** Once a day, in the 6 AM Miami hour before the brief,
  each account's last seven days are saved. The brief's **Socials** section
  reads the latest one.
- **Tracking links.** Bio links and post links go through `/go/...` and are
  counted in `hq-clicks`. Link previews and crawlers are not counted:

  | Link | Use it for |
  | --- | --- |
  | `flamingocounty.com/go/ig` | Instagram bio |
  | `flamingocounty.com/go/tt` | TikTok bio |
  | `flamingocounty.com/go/fb/<draft id>` | a link inside Facebook post #id |
  | `flamingocounty.com/go/qr?to=/es/events` | a flyer or QR code, landing on events |

  The visitor lands on `to` (the home page by default) tagged with
  `utm_source`, `utm_medium` and `utm_campaign`. `to` must be a path on the
  site, so the link can't be turned into an open redirect.

Each draft also has a **pillar** (spotlight, event, story, promo) and a
**language**, so results can be compared by the kind of post. The weekly
review that turns these numbers into lessons and next week's drafts needs
Claude to reach this data, which is the MCP step below.

Two things found against the live instance on 2026-10-01:
- Postiz's `percentageChange` is a placeholder. It was 5 on every Facebook and
  Instagram metric and 0 on every TikTok one, whatever the data. It is kept in
  `raw` and never shown. Change over time should come from our own daily
  snapshots.
- How the create-post reply names post ids isn't settled: the docs disagree.
  `postIdsFrom` reads every documented shape. When it finds none, the stats job
  looks the post up with `GET /posts` by channel and publish time, so the first
  real approval will show which path it takes.

## Claude over MCP

`/api/mcp` lets Claude Code (or any MCP client) work against HQ directly: read
the brief, work the task queue, write social drafts, and pull post results for
a weekly review.

**Connect it.**
1. In the admin, open **MCP → API Keys** and create a key. Tick only what it
   should use. For Claude, tick:
   - **find, create and update** on HQ events, tasks and social drafts
   - **find, create and update** on events, weekly events, stories,
     spotlights and listings (drafts only; see *Drafts and publishing*)
   - **find** on HQ media, social stats and clicks, cities and categories
   - **find and update** on listing requests
   - all the **tools**
   Copy the key; it's shown once.
2. On the Mac, run:

   ```sh
   claude mcp add --transport http flamingo-hq https://flamingocounty.com/api/mcp \
     --header "Authorization: Bearer <key>"
   ```

**What it can and can't reach.** Two layers: the list in `payload.config.ts`
is what's possible at all, and a key's ticked boxes are what that key may
use. `users`, `members`, `subscribers`, the public `media` and the jobs are
not in the list, so no key can reach member data, visitor emails or the public
site's uploads. Delete is off everywhere.

**Approval stays human.** Claude can create and edit drafts, but a draft's
`status` and HQ's bookkeeping fields refuse writes that arrive over MCP
(`humanOnly` in `src/fields/shared.ts`). The only path to Postiz is the Approve
tap in Telegram. The tool schemas still list those fields; they are silently
dropped, and their descriptions say so.

**What you approve is what gets posted.** Editing a pending draft, from Claude
or the admin, sends a fresh preview. Approve also compares the draft with a
fingerprint of the preview you tapped, so content changed after a preview is
never posted unseen: you get the current version to approve instead.

**HQ's own tools:**

| Tool | Does |
| --- | --- |
| `hqBrief` | The brief as plain text, without moving the scheduled one. |
| `hqSocialReport` | Every post in the last N days: pillar, language, time, furthest checkpoint per platform, clicks; plus account snapshots and bio clicks. The input to the weekly review. |
| `hqRequestPublish` / `hqPublishStatus` | Ask you to publish a site draft (you tap Publish in Telegram), and check the answer. |
| `hqAddDraftMediaFromUrl` | Downloads a public https JPEG, PNG or MP4 into HQ media for a draft. It refuses private and loopback hosts and doesn't follow redirects, so the server can't be pointed at itself. |

## Drafts and publishing

**The rule: drafts are free, going live needs you.** It's the same for the site
and for social posts.

| | Claude does freely | Needs your tap in Telegram |
| --- | --- | --- |
| Social posts | write and edit drafts | **Approve** schedules it in Postiz |
| Site content (events, weekly events, stories, spotlights, listings) | create and edit drafts | **Publish** makes it live |

**How site drafts work.** These five collections have Payload drafts:
- Saving a draft never touches the live page. The public site shows only
  published versions.
- Every query in `lib/data.ts` filters to `published`, and anyone not logged in
  reads published documents only, including through REST and GraphQL with
  `?draft=true`.
- In the admin you get **Save draft** and **Publish** buttons, and you can
  publish anything yourself as before.

**What Claude can and can't do.** Over MCP, Claude can create and update these
documents, but only as drafts. `mcpDraftsOnly` refuses any MCP write without
`draft: true`, and pins the status to `draft` even when the data says
`published` (Payload would otherwise treat that as a publish).

**Publishing a draft:**
1. Claude calls `hqRequestPublish`.
2. Telegram shows what changes against the live page, field by field and per
   language, with a link to the draft in the admin. ⚠️ lines flag a `slug`
   change (breaks live links) and a listing's `publicationStatus` change.
3. **Publish** publishes exactly that draft in both languages. If the draft was
   edited after the preview, nothing is published and the current version is
   sent instead. A newer request replaces an older one. Requests expire after
   3 days.

`hq-publish-requests` isn't exposed over MCP, so no client can approve its own
request. The tap is your Telegram account behind the webhook's secret.

**The seed won't publish around you.** A seeded update builds on the newest
version, which could be an unapproved draft, so the seed skips any document
with a pending draft and says so.

**The migration that turned drafts on** (`20261001_170211_add_site_drafts`)
rebuilds the five content tables, because SQLite can't loosen a column in
place. Two bugs in the generated SQL were fixed by hand; keep the fixes if it
is ever regenerated:
- **The copy step read a `_status` column the old tables don't have.** It
  failed outright, which on Railway means a failed boot. It now writes
  `'published'` for every existing row. The column defaults to `'draft'`,
  which would have taken every page off the site.
- **Foreign keys were switched back on after the first table.** Dropping a
  parent table with them on cascades into its children (hours, story blocks,
  translations). They now stay off around the whole rebuild.

Checked on a scratch database holding listings with hours and story rows, a
bilingual story with all four block types, an event, a weekly event and a
spotlight:
- row counts identical across all 21 tables
- every row published
- no foreign-key violations
- everything still returned by the site's queries in both languages

**What this doesn't cover.** It governs the MCP path. A Claude Code session on
your Mac has other ways in, and those are governed by the written rule, not by
this server:
- your logged-in Chrome (the admin)
- `git push` / merging PRs
- a Railway shell
- the direct Postiz MCP

Branch protection on `main`, and removing `postiz-flamingo-county` once HQ is
live, make those harder.

## Things that are deliberate

- **The brief runs every hour and sends once.** The jobs queue has no timezone
  setting, and croner reads cron in the server's local zone: UTC on Railway,
  Eastern on a dev Mac. So the job runs every hour at :30 and only the 7 AM
  Miami run sends, which also stays correct across daylight saving. Completed
  jobs are deleted, so the other 23 runs leave nothing behind. This was found by
  running it: a fixed `11,12` UTC schedule queued for 15:30 UTC on a Mac.
- **`src/instrumentation.ts` starts the job runner.** Payload's `autoRun` only
  starts for `getPayload({ cron: true })`, which the frontend never calls.
  Without this file, the brief would only run after someone logged in to the
  admin.
- **One runner, one instance.** This only works because SQLite pins the service
  to a single replica. A second replica would send every brief twice.
- **A ping never fails a form.** `recordEvent` swallows its own errors, and the
  Telegram call is not awaited. The test suite submits a listing request with
  the network down to check this.
- **Approve can't post twice.** The draft moves to `approved` before any Postiz
  call, so a later tap, or Telegram redelivering the webhook, finds it no longer
  pending. Taps that arrive *at the same time* (Telegram delivers webhooks
  concurrently) are stopped by an in-memory guard in `decideDraft`. That guard
  is sound only because the service runs as one process. Both cases are
  tested.
- **HQ media is private.** `hq-media` is staff-only and separate from the public
  `media`. Files go to Telegram and Postiz as uploads, not URLs, so nothing
  unpublished is ever publicly reachable. Only JPEG, PNG and MP4 are accepted:
  Instagram rejects WebP and Postiz accepts only MP4 video.
- **Postiz channel ids are looked up at approval time.** Reconnecting an account
  in Postiz mints a new id. If a platform isn't connected, the draft is marked
  `failed` with the reason, rather than scheduling to a dead channel.
- **The TikTok settings are fixed**: public, comments on, no duet or stitch,
  `DIRECT_POST`. They come from the instance's own `integrationSchema`. Change
  them in `lib/postiz.ts`.

## What comes next

2. **MCP for Claude** — built; see *Claude over MCP*. Next on it: a scheduled
   weekly review that reads `hqSocialReport`, keeps a short playbook of what
   works, and drafts the next week's posts for approval.
3. **Social stats** — post checkpoints, account snapshots and tracking links
   are built (see *Measuring the posts*). The endpoints, checked against the
   live instance on 2026-10-01:
   - `GET /analytics/<channel id>?date=N` returns daily series for each
     platform, and the labels differ by platform. Facebook gives page
     impressions, media views, posts engagement and page followers. Instagram
     gives reach, likes, views, comments, shares, saves and replies. TikTok
     gives followers, following, total likes and videos.
   - `GET /analytics/post/<post id>?date=N` is the per-post route. An unknown
     id returns `[]`. It can't be checked with real data until something has
     been posted.
4. **A chat model in the bot** (OpenRouter), fed redacted summaries only. No raw
   visitor emails or phones should go to a third-party model.
5. **A dashboard view** in the admin, or the Voysi dashboard reading HQ over the
   API.
6. **Customer-facing agents**, and with them roles, least-privilege tools, evals
   and red-team tests.
