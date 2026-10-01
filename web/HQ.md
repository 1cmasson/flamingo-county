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

2. **MCP for Claude.** `@payloadcms/plugin-mcp@3.88.0`, exposing only the HQ
   collections, `listing-requests` and `listings`. Never `members`, `users` or
   subscriber emails. Payload `users` has no roles, so any API key is full
   admin: scope the plugin, not the key.
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
