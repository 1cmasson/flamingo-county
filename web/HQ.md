# Flamingo HQ — the ops layer

A private layer on the same Payload app and database as the site, for the owner
only. Phase 1 has three parts:

- **Intake pings.** A new listing request or newsletter signup is logged to
  `hq-events` and sent to Telegram. Before this they sat in the admin until
  someone looked.
- **Morning brief.** At 7:30 AM Miami time, Telegram gets a summary: today's
  calendar (when it's connected; see *The calendar*), what happened since the
  last brief, what is waiting (new requests, drafts to approve, listings needing
  owner confirmation), open tasks, and posts going out in the next 24 hours.
- **Evening wrap.** At 8 PM Miami time, Telegram gets the day's counterpart:
  what happened today, open tasks due by the end of tomorrow (overdue ones
  flagged), tomorrow's calendar, and the social and site drafts waiting on you.
- **Social approvals.** A draft in `hq-social-drafts` is previewed in Telegram
  with its cover photo or video and **Approve / Reject** buttons. Approve
  uploads the files to Postiz and schedules the post on Facebook, Instagram or
  TikTok. Nothing is posted without that tap. If another draft (pending,
  approved or scheduled) goes out within 3 hours of it, the preview says so
  with a ⚠️ line naming that draft: auto-drafts keep that gap themselves, but
  a hand-made draft (from any agent) sets its own time.

Everything is in the admin under **HQ**. The code is in `src/lib/{hq,brief,telegram,telegramBot,chat,postiz}.ts`,
`src/lib/{calendar,wrap}.ts`, `src/collections/Hq*.ts`, `src/jobs/{morningBrief,eveningWrap}.ts`
and `src/app/api/telegram/route.ts`.

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
webhook answers 503 and the brief and wrap jobs skip.

## The calendar

The brief's **Today** and the wrap's **Tomorrow** come from your Google
Calendar's *secret address in iCal format*. It's read-only and needs no OAuth.

1. In Google Calendar, open **Settings → your calendar → Integrate calendar**
   and copy **Secret address in iCal format** (it ends in `/basic.ics`).
2. Set it in Railway without it touching the terminal history or the chat:
   `railway variable set GOOGLE_CALENDAR_ICS_URL --stdin`, then paste it.

| Variable | Value |
| --- | --- |
| `GOOGLE_CALENDAR_ICS_URL` | the secret iCal address. Optional: unset, the calendar sections are left out and nothing is fetched |

**It's a secret.** Anyone holding the URL can read the whole calendar, so it is
never logged and never put in an error message; a failed read logs only the
reason (`timed out`, `HTTP 404`, `unreachable`, `unreadable`). If it leaks,
**Reset** it on the same Google settings page and set the new one.

How it reads:
- The file is fetched fresh for each brief and wrap (and each `/brief` or
  `hqBrief`), with an 8-second timeout. If the read fails, the brief still goes
  out, with one line saying the calendar is unavailable and why.
- Times are put on Miami's clock: an IANA `TZID` (what Google writes) through
  Intl, UTC as is, another zone through the file's own `VTIMEZONE`, and
  floating time as Miami time. Recurring events (`RRULE`, `EXDATE`, a moved or
  cancelled single occurrence) are expanded by
  [ical.js](https://github.com/kewisch/ical.js).
- A timed event is listed on the day it starts, so an 11:30 PM event stays on
  its own evening. One lasting a day or more also shows on its later days as
  "Until …". An all-day event shows on each of its days. Cancelled events are
  left out.
- Only titles and times are shown, not descriptions, guests or locations. Note
  that `hqBrief` hands the brief, Today included, to Claude over MCP.

## Telegram commands

| Command | Does |
| --- | --- |
| `/brief` | The brief, now. This doesn't move the next scheduled brief's window. |
| `/inbox` | New events, newest first. |
| `/seen` | Mark every new event seen. |
| `/done <id>` | Mark one event done. |
| `/tasks` | Open tasks. 🤖 marks the ones assigned to Claude. |
| `/task <text>` | File a task for Claude. Claude Code picks these up. |
| `/review` | Ask Claude for a growth review. It files one task (or points at the open one) and answers at once with the last 7 days of site visits. See *Growth review*. |

Anything that isn't a command gets the help, unless the chat model is set up
(next section).

Social drafts and site publish requests arrive as messages with buttons:
Approve / Reject and Publish / Reject.

Only `TELEGRAM_OWNER_CHAT_ID` gets answers. Anyone else is ignored without a
reply.

## Chatting with the bot

With `OPENROUTER_API_KEY` and `HQ_CHAT_MODEL` set, a plain message to the bot
(not a `/command`) is answered by a model on OpenRouter: "¿cómo van los posts
esta semana?", "anything waiting on me?". It replies briefly, in the language
you wrote in. The code is `src/lib/chat.ts`.

| Variable | Value |
| --- | --- |
| `OPENROUTER_API_KEY` | an OpenRouter key. Set a **credit limit** on the key in OpenRouter: that is the monthly spend cap. |
| `HQ_CHAT_MODEL` | an OpenRouter model id, e.g. `vendor/model-name` |
| `HQ_CHAT_DAILY_LIMIT` | optional, model calls per 24 hours. Default 50. Past it, the bot says so and commands still work. |
| `HQ_CHAT_MAX_TOKENS` | optional, the cap on each reply. Default 500. |

Leave either of the first two unset and the bot behaves as before: plain text
gets the help. **Owner to do:** pick the model and the budget (task H5), and
rotate the OpenRouter key that was pasted in a transcript before setting it
here (task H3).

**What the model sees: summaries only.** The brief as plain text, open task
titles, the last 15 event summaries and a compact 7-day social report (post
times, kinds, stats, clicks). Nothing else is read for it, so it never gets a
listing request's phone, email or owner, subscribers, members, or any event's
raw `data`. As a backstop, every message sent, including yours and the stored
history, has anything shaped like an email or phone number replaced with
`[email]` / `[phone]`. A bare 7+ digit number is redacted too; counts in the
summary are written with commas so they survive.

**It can only read.** The model gets no tools. Ask it to do something
("publica el evento", "email the venue") and it answers with a task line
instead; HQ files an `hq-tasks` row assigned to Claude, the same as `/task`,
and tells you its number. Nothing else is created or changed.

**Short memory.** The last 8 turns from the past 12 hours are sent back with
each message, so follow-ups work. Turns live in `hq-chat-turns` (admin → HQ),
stored redacted, and are deleted after two days. That collection isn't
exposed over MCP.

The owner-only rule is unchanged: anyone else, or you in a group, gets no
reply and costs no call. If the model fails or times out (25 s), you get a
one-line reason, and the call still counts toward the daily limit.

## Measuring the posts

Three sources, all saved in the database so the history outlives Postiz, which
fetches stats live and keeps none:

- **Post checkpoints.** The hourly `socialStats` job (at :45) saves each
  published post's Postiz stats 24 hours, 3 days and 7 days after it went out,
  to `hq-social-stats`. Measuring every post at the same ages is what makes them
  comparable. Postiz answers `[]` until a post is live and matched, so an empty
  reply is retried hourly for 48 hours, then skipped. A gap is never stored as
  zeros. Before that, each run reads every scheduled post's time back from
  Postiz: a post dragged to another day in the Postiz calendar is followed
  (`publishAt` and `scheduledFor` move with it), so it is measured from when it
  really went out and the brief lists it on the right day. Postiz's public API
  cannot move a post, so moving one is done in Postiz, not here.
- **Account snapshots.** Once a day, in the 6 AM Miami hour before the brief,
  each account's last seven days are saved. The brief's **Socials** section
  reads the latest one.
- **Tracking links.** Bio links and post links go through `/go/...` and are
  counted in `hq-clicks`. Link previews and crawlers are not counted:

  | Link | Use it for |
  | --- | --- |
  | `flamingocounty.com/links?from=ig` | Instagram bio (the link page, see *The link page*) |
  | `flamingocounty.com/links?from=tt` | TikTok bio |
  | `flamingocounty.com/links?from=fb` | Facebook page's website link |
  | `flamingocounty.com/go/fb/<draft id>` | a link inside Facebook post #id |
  | `flamingocounty.com/go/qr?to=/es/events` | a flyer or QR code, landing on events |

  The visitor lands on `to` (the home page by default) tagged with
  `utm_source`, `utm_medium` and `utm_campaign`. `to` must be a path on the
  site, so the link can't be turned into an open redirect. The one exception
  is an https:// address that is a button on the published link page; any
  other address lands on the link page.

  A bio link opens the link page and counts nothing by itself; each button
  tapped there is one click, under the bio's platform (`instagram`,
  `tiktok`, `facebook`), or `bio` when the link had no `from`. The older
  `/go/ig` and `/go/tt` still work and land on the home page, counted the
  same way.

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
the brief, work the task queue, write social drafts, and pull traffic and post
results for the growth review.

**Connect it.**
1. In the admin, open **MCP → API Keys** and create a key. Tick only what it
   should use. For Claude, tick:
   - **find, create and update** on HQ events, tasks and social drafts
   - **find, create and update** on events, weekly events, stories,
     spotlights and listings (drafts only; see *Drafts and publishing*)
   - **find** on HQ media, social stats and clicks, cities and categories
   - **find and update** on listing requests
   - **find and update** on the HQ playbook (the growth review's notes)
   - **find and update** on the link page (drafts only; see *The link page*).
     These start unticked on an existing key.
   - **find** on HQ visits, and **find, create and update** on HQ experiments
     (the growth review's ledger). These start unticked on an existing key.
   - **find** on media (the public site's photos, to reuse a venue photo
     already imported). It starts unticked on an existing key.
   - all the **tools** (a new tool, like `hqAddSiteMediaFromUrl`, starts
     ticked)
   Copy the key; it's shown once.
2. On the Mac, run:

   ```sh
   claude mcp add --transport http flamingo-hq https://flamingocounty.com/api/mcp \
     --header "Authorization: Bearer <key>"
   ```

**What it can and can't reach.** Two layers: the list in `payload.config.ts`
is what's possible at all, and a key's ticked boxes are what that key may
use. `users`, `members`, `subscribers` and the jobs are not in the list, so
no key can reach member data or visitor emails. The public `media` is there
for **find** only: it is public-read anyway. Delete is off everywhere.

There are two ways in to the public `media`: `hqAddSiteMediaFromUrl` (see
*Venue photos*), which takes licensed photos from three archives only, and
`hqStartSiteArtworkUpload` (see *Our own artwork*), which takes only artwork
we made, credited to us.

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
| `hqSocialReport` | Every post in the last N days: pillar, language, time, furthest checkpoint per platform, clicks; plus account snapshots and bio clicks. Part of the growth review's input. |
| `hqGrowthContext` | The growth review's whole input in one call: 28 days of site traffic, what's live, what shipped, intake counts, the experiment ledger, open tasks, and everything `hqWeeklyReviewContext` returns. See *Growth review*. |
| `hqWeeklyReviewContext` | The social part of that: the 28-day report, the playbook, published events in the next 14 days, the newest published stories, and drafts still pending. |
| `hqRequestPublish` / `hqPublishStatus` | Ask you to publish a site draft (you tap Publish in Telegram), and check the answer. |
| `hqSendTelegram` | Sends one plain-text message to your Telegram chat, headed "Claude", when you ask Claude to hand something over. It goes only to you (no chat id parameter), is escaped, refused rather than trimmed when too long, has no buttons, and is limited to 10 per 10 minutes. |
| `hqAddDraftMediaFromUrl` | Downloads a public https JPEG, PNG or MP4 into HQ media for a draft. It refuses private and loopback hosts and doesn't follow redirects, so the server can't be pointed at itself. |
| `hqAddDraftMediaFromUpload` | Adds a JPEG, PNG or MP4 sent straight from the caller's computer (base64) into HQ media, for a finished video that is on no public link. Checked by its real bytes (a mislabelled file or a .mov is refused), up to 50 MB, a PNG is stored as JPEG, and sending the same file twice returns the stored one. The file goes over the authenticated MCP connection only; it is never put on a public address. Nothing is posted. |
| `hqAddSiteMediaFromUrl` | Imports a licensed venue photo into the public site's media, with its credit, licence and source, for an event's `image`. See *Venue photos*. |
| `hqStartSiteArtworkUpload` | Starts adding artwork Flamingo County made (a drawn cover, our own photo) to the public site's media, credited to us with what it was drawn from, within the 400 KB image budget. Returns a one-time upload link the file is PUT to with curl. See *Our own artwork*. |
| `hqSiteArtworkUploadChunk` / `hqFinishSiteArtworkUpload` | The pieces of an upload, for a client with no shell, and the upload's result. |
| `hqAddSiteArtworkFromUpload` | The same in one call, with the file as base64 in the call: for a small file only. |

### Venue photos

An event can show a real photo of its venue, if the photo's licence allows it.
The owner's rule: **public domain, or Creative Commons that allows commercial
reuse, always credited.** Never Google Maps or Street View, Yelp, news sites
or organizer flyers.

**How Claude adds one.**
1. Find the photo on Wikimedia Commons, Flickr or the Library of Congress, and
   read its licence on the description page.
2. Call `hqAddSiteMediaFromUrl` with:
   - the direct file URL
   - alt text in both languages
   - the credit (author)
   - the licence
   - the description page
   - optionally a focal point for the crop
3. Set the returned id as the event's `image`, in a draft.
4. Ask for the publish with `hqRequestPublish`.

Before importing, check `findMedia`: the photo may already be there.

**What the tool refuses:**
- **Hosts.** Only `upload.wikimedia.org`, `live.staticflickr.com`,
  `tile.loc.gov` and `loc.gov`, matched exactly.
- **Fetching.** Only https, with no redirects and no private addresses, the
  same as the draft-media tool.
- **Files.** Only JPEG or PNG, under 40 MB and at least 1000 px wide.
- **Licences.** Only public domain, CC0, CC BY and CC BY-SA, versions 2.0 to
  4.0. There is no NC or ND value, so neither can be stored. A licence URL that
  names a different licence is refused.
- **Credit and source.** A credit is required, and the source must be the
  photo's description page on Commons, Flickr or loc.gov.

**Where the photo goes.**
- The file lands in the public media library, so it has a URL from then on.
- It shows on a page only once an event that uses it is published, which is
  your Publish tap. Setting `image` over MCP is a draft edit like any other.
- Nothing is published around you. The drafts-only rule is about what the
  site shows, and an imported photo shows nowhere until you publish an event
  that uses it.

**The credit, wherever the photo appears.** For example, "Foto: Phillip Pessar
· CC BY 2.0 · recortada", with the name linked to the description page and the
licence to its deed. It appears:
- **Under the hero** on the event page.
- **On the events board and the seasonal guides,** under the card.
- **On the generated cards** (link preview, board, Instagram), printed on the
  photo. A card made from a CC BY-SA photo is a derivative, so its line adds
  "tarjeta CC BY-SA 4.0": the card is shared under the same licence.
- **In the auto-drafted social post,** as a last line: "📷 Foto: Phillip
  Pessar, CC BY 2.0 (https://creativecommons.org/licenses/by/2.0/)".

The site crops every photo it shows, so "recortada" / "cropped" is always
there. CC 3.0 and 4.0 require saying a photo was changed.

### Our own artwork

A cover we drew (the Hialeah Park listing's, say) or a photo we took goes into
the public media library through an upload link. The archive tool above can't
take it, since it only downloads licensed photos from three hosts.

**How Claude adds one.**
1. Call `hqStartSiteArtworkUpload` with the picture's details (no file):
   - `filename` and `mimeType` (`image/jpeg` or `image/png`)
   - `origin`: `own-illustration` (we drew it) or `own-photo` (we took it)
   - alt text in both languages
   - `basedOnEs` / `basedOnEn`: what it was drawn from, as the credit should
     say it, e.g. "basada en fotos del Historic American Buildings Survey
     (dominio público)". Use "original" for a drawing made from nothing.
   - optionally a focal point for the crop

   It checks them and returns `uploadId`, a one-time `uploadUrl`
   (`https://flamingocounty.com/api/hq/artwork-upload/<token>`) and the exact
   command to send the file.
2. Send the file from the shell:

   ```sh
   curl -sS -X PUT --data-binary @hialeah-park-clubhouse.jpg \
     -H 'Content-Type: image/jpeg' '<uploadUrl>'
   ```

   The answer is `{id, filename, width, height, filesize}`.
   `hqFinishSiteArtworkUpload(uploadId)` reads the same result over MCP.
3. Set the id on the draft: a listing's `gallery`, a story's cover or an
   event's `image`.
4. Ask for the publish with `hqRequestPublish`.

**Why a link and not the file in the call.** `hqAddSiteArtworkFromUpload`
takes the file as base64 inside the tool call, and a model has to write that
argument out character by character. A 72 KB drawing is about 96,000
characters, and one wrong character corrupts the picture, so in practice it
only works for a tiny file. It is still there for one, but the link is the way.

**The link.** A random 32-byte token in the path is the only credential, so
the PUT needs no API key. It works once, for 15 minutes, and only its sha256 is
stored (`hq-artwork-uploads`, hidden in the admin), so the table can't be
turned back into working links. Neither the route nor anything else logs it.
The route refuses cheaply and in order: a rate limit (20 tries per address and
100 overall in 10 minutes), the token's shape, one indexed lookup, and only
then reads the body, cut off past 25 MB as it streams in.

| Answer | Means |
| --- | --- |
| 201 | Stored. The body is the media record's id and size. |
| 400 | Empty body. |
| 404 | No such link. |
| 410 | The link was used, or expired. Start a new one. |
| 413 | Over 25 MB. |
| 415 | Not a JPEG or PNG, or not the type the link was started for. The link isn't spent: send the right file. |
| 422 | The picture failed a check (too small, over budget even at 1920 px). The link is spent: fix the file and start again. |
| 429 | Too many tries. Wait a few minutes. |

**Cloudflare.** Checked on 2026-10-07: a plain curl PUT to `/api/hq/...`
reaches the site (Next answered 404 for an unknown path, with no Cloudflare
challenge), so no WAF rule is needed. Use curl: a script's default user agent
(Python's `urllib`, for one) can be refused by Cloudflare with a 403 before
it reaches the site.

**No shell?** Send the file over MCP in pieces instead. Base64 it, cut the
base64 into pieces of at most 20,000 characters (on a multiple of 4), and send
each with `hqSiteArtworkUploadChunk`: `uploadId`, `index` from 0, `total`, the
piece, and the sha256 of that piece's decoded bytes. A piece that doesn't
match its sha256 is refused, and only that piece needs resending. Then
`hqFinishSiteArtworkUpload` puts them together, checks the whole file against
its `sha256` when given, and stores it. Pieces are kept server-side, never on
a public address, up to 2 MB in all; anything bigger goes by the link.

Rows are removed a day after they expire, whenever a new link is issued.

**What every way in refuses or decides for you:**
- **Whose it is.** Only `own-illustration` or `own-photo`. The credit is
  always "Flamingo County" and is not a parameter, so a third party's picture
  can't be passed off as ours. An archive photo goes through
  `hqAddSiteMediaFromUrl`, with its licence.
- **Where it came from.** `basedOn` is required in both languages, so an
  illustration drawn from someone else's photos still credits them.
- **Files.** JPEG or PNG by their real bytes, at least 1000 px wide, up to
  25 MB sent. It's re-encoded with no metadata, at most 2560 px, stepped down
  in quality until it fits the site's **400 KB image budget**, then stored as
  WebP like every upload. The stored file is checked against the budget too.
  If it can't fit even at 1920 px, it's refused, not crushed.

**The credit** reads "Ilustración: Flamingo County · basada en fotos del
Historic American Buildings Survey (dominio público)" (or "Foto: Flamingo
County" for our own photo), wherever the photo credit appears: under an event
hero, on the board and the cards, and on the auto-drafted social post's last
line. The media record keeps `origin` and the localized `basedOn`.

## Growth review

The goal is traffic: more people from Miami-Dade reading the site. The growth
review is how HQ learns what brings them. It runs **only when you ask**. Nothing
schedules it.

1. **You ask.** Send `/review` to the bot. It files one `hq-tasks` row,
   "Growth review (asked <date>)", for Claude, and answers at once with the
   last 7 days of visits. A second `/review` points at the open one.
2. **Claude runs it** in the next Claude session on Flamingo County. The MCP
   server's instructions and `HQ-HANDOFF.md` both say to do that task first.
   It follows [`hq/growth-review.md`](hq/growth-review.md):
   - read `hqGrowthContext`
   - judge the experiments that are due
   - rewrite the playbook
   - pick at most three next moves, each as an experiment with the number that
     decides it, and a task for whoever does it
   - optionally draft social posts for your Approve tap
3. **You get one Telegram message**, headed "Claude · Growth review".

**The experiment ledger** (**HQ → Hq Experiments**, `hq-experiments`) is what
makes it self-improving. Each experiment has six parts:
- a hypothesis
- the one metric that decides it
- the baseline
- what would count as working
- a check date
- the result and a verdict: worked, no effect, worse, or inconclusive

Only judged experiments feed the playbook (**HQ → Growth playbook**,
`hq-playbook`). So over time the playbook becomes what actually worked here,
with numbers, rather than opinions. Change how the review works by editing
`hq/growth-review.md`.

It never approves, publishes or schedules anything. Drafts still need your tap.

**Replaced:** this used to be a weekly cloud routine (W4). On 2026-10-01 the
owner chose to ask with `/review` instead of a schedule. `hqWeeklyReviewContext`
and the playbook stayed; the routine, and the dedicated key it needed, were
never created.

### The site's visit counter

**What it does.** Every public page sends one beacon to `/api/view`
(`components/Pageview.tsx`). That becomes an `hq-visits` row
(`lib/visits.ts`): the path, whether it was the first page of a visit, and for
that first page where it came from:
- a known source: `google`, `facebook`, `chatgpt`…
- a referring site's hostname, which marks a backlink
- a `utm_source` tag, which the `/go/` links set
- or `direct`

It also keeps a mobile/desktop flag and Cloudflare's country.

**No cookie, storage, IP, user agent or visitor id.** Two views can't be tied
to one person.

**Not counted:**
- crawlers and link previews (`isBot`)
- Lighthouse and other audit tools
- headless browsers (`navigator.webdriver`)
- cross-site posts
- **anyone signed in to the admin**: log in once on your phone and your own
  visits stop counting

**Where to see it.** The brief has a **Site** section with the last 7 days, and
`hqGrowthContext` has the full 28-day report.

**City and region.** These need Cloudflare to send its location headers: Rules →
Transform Rules → Managed Transforms → **Add visitor location headers**, which
is free. Until then, place is country only, and "how much of it is Miami-Dade"
can't be answered. Turning it on is an owner task.

**Searches aren't here.** Search queries, impressions and Google's own click
counts are in Search Console. Task G2 brings them into HQ, once the owner grants
read-only access (H7).

## Drafts and publishing

**The rule: drafts are free, going live needs you.** It's the same for the site
and for social posts.

| | Claude does freely | Needs your tap in Telegram |
| --- | --- | --- |
| Social posts | write and edit drafts | **Approve** schedules it in Postiz |
| Site content (events, weekly events, stories, spotlights, listings, the link page) | create and edit drafts | **Publish** makes it live |

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

**A published event or story gets a social draft.** When an event or story
goes from draft to published (your Publish tap, or Publish in the admin),
`src/lib/autoDraft.ts` writes one pending `hq-social-drafts` entry, and its
preview arrives in Telegram for Approve / Reject like any other draft:
- **Caption.** Spanish, then English, made only from the page's own fields:
  title, date, time, venue, who gets in and the note for an event; title and
  standfirst for a story. A field that names a price is left out, and a
  missing translation is left out rather than repeating the English. It ends
  with a `/go/fb/<draft id>` link to the Spanish page.
- **Photo.** An event gets its generated card (`src/lib/eventCard.tsx`, the
  1080×1350 "social" size, in Spanish). It has the event's photo framed on it,
  with the credit printed, or the mascot when there is no photo. A story's
  cover photo is re-encoded as a JPEG. Either way the picture goes into HQ
  media for Facebook and Instagram. A story with no cover gets no draft
  at all, because Facebook posts are never text only (see *Facebook rule*). A credited photo adds a last line to the caption (see *Venue photos*).
  An event with no photo has a poster that stands on a drawn scene
  (`src/lib/eventSetting.ts`). The event's **Setting** field (sidebar) picks
  one, or "None" for the flat city-colour poster. Left empty, the venue's name
  picks it (biblioteca/library, city hall, museo/arts/teatro,
  iglesia/church, salón de fiestas/ballroom, bar/lounge, restaurante/café,
  parque/park, calle/street), then a listing's category (restaurants, bars),
  then the city: Main Street plaza for Miami Lakes, the city gateway for
  Hialeah, a Calle Ocho street for Little Havana. Hialeah Park (the racetrack)
  is not a park. The scenes are generic places, never a real business; the
  three real public places have blank signs and no artwork. Locked in the
  brand kit, bundled under `src/assets/og/settings/`. The wide sizes are
  always flat.
- **Time.** The next 11:30 or 19:00 Miami slot at least 30 minutes away,
  skipping any slot within 3 hours of another pending, approved or scheduled
  draft. An event more than 3 days out is posted in its last 72 hours: the
  first free slot from then to the start, or if those are all taken, the
  nearest free one before (up to two weeks). So a class on the 31st published
  on the 5th goes out the week of the 31st, and dates published together each
  get their own week. An event's post never goes out after the event starts: if the first
  free slot is too late, the first slot at all; if even that is too late, it
  posts as soon as you approve. A run that has already started (an exhibit)
  can post until the evening of its last day. Drafts are written one at a
  time, so pages published together get different slots.
- **When it doesn't draft.** A republish never drafts a page twice. A draft
  save and an event that is over, cancelled or postponed draft nothing.
  Neither does a page created already published: the seed, and **Publish on
  a never-saved page in the admin**. To get a social draft there, save a
  draft first, then publish.

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

## The link page

`flamingocounty.com/links` is what the bios point to, because Instagram and
TikTok captions can't hold a link. It follows the site's language like every
page (`/links` goes to `/es/links` or `/en/links`), and each bio adds its
platform: `/links?from=ig`, `?from=tt`, `?from=fb`.

**What's on it.** The **Link page (bio)** global, under *Page copy* in the
admin: a one-line tagline, then sections in order, each with an emoji, a title
in both languages and its buttons. A button has:
- an emoji and a short label, Spanish and English side by side (two plain
  fields, not Payload's translations: see below)
- a link: a path on the site **without** the language (`/events`,
  `/list-your-spot?type=listing`; the page adds `/es` or `/en`), or a full
  `https://` address. Or the kind **The newest published story**, which is
  looked up on every visit and shows the story's title under the label.
- **Featured**: shown as a big button at the top, above the sections.
- **Starts on / Ends on** (optional): shown only on those Miami days, both
  included. Set a seasonal button up ahead and it appears and goes by itself.

A section whose buttons are all featured or out of their dates isn't shown.
The first version was seeded by the migration `20261009_191159_seed_link_page`.
"This week" goes to the events board until there is a this-week page. Little
Havana is left off the page for now.

**Editing it.** It has drafts like the site's content:
- In the admin: **Save draft**, then **Publish** when it's right.
- Claude, over MCP: `findLinkPage` (with `draft: true`) to read it, then
  `updateLinkPage` with `draft: true` (anything else is refused) and the
  **whole** `sections` array with the change made: rows left out are removed.
  Then `hqRequestPublish` with `collection: "link-page"` (no id). You get one
  line per changed button in Telegram and tap Publish, as for any page.
  A link with `/es` or `/en` in it, or that is neither a site path nor
  `https://`, is refused even in a draft.

  Why two plain fields per language: the MCP tools drop array rows' ids and
  write one language per call, so a translated label inside these lists
  could not be changed over MCP without losing the other language.
  Tick **find** and **update** on *Link Page* for Claude's API key; new boxes
  start unticked.

**Clicks.** Every button goes through `/go/<from>?to=…` and is counted in
`hq-clicks` with the button's destination as `to`, so the growth review can
tell which buttons people use. Nothing is stored on the visitor.

## Things that are deliberate

- **The brief runs every hour and sends once.** The jobs queue has no timezone
  setting, and croner reads cron in the server's local zone: UTC on Railway,
  Eastern on a dev Mac. So the job runs every hour at :30 and only the 7 AM
  Miami run sends, which also stays correct across daylight saving. Completed
  jobs are deleted, so the other 23 runs leave nothing behind. This was found by
  running it: a fixed `11,12` UTC schedule queued for 15:30 UTC on a Mac.
- **The evening wrap follows the same pattern**, at :00, sending only in the
  8 PM Miami hour. It logs `wrap.sent`, which neither the brief nor the wrap
  lists as news. The brief counts its window only from `brief.sent`, so a wrap
  never moves it.
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

2. **MCP for Claude**: built; see *Claude over MCP*. The growth review is
   built too (see *Growth review*). It runs when the owner sends `/review`.
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
4. **A chat model in the bot**: built; see *Chatting with the bot*. It goes
   live when the owner sets `OPENROUTER_API_KEY` and `HQ_CHAT_MODEL` (H5).
5. **A dashboard view** in the admin, or the Voysi dashboard reading HQ over the
   API.
6. **Customer-facing agents**, and with them roles, least-privilege tools, evals
   and red-team tests.

## Story pipeline

A produced story (research, script, voice, cut) is made on the owner's Mac in
content-marketing-system, with its own approval gates. HQ can't read that repo, so a story
crosses over as one JSON **story pack**, generated from the approved topic by
`scripts/story_pack.py` and never edited by hand. HQ turns it into drafts:

| In the pack | Becomes | Goes live by |
| --- | --- | --- |
| Site story, English and Spanish | a `stories` draft | your **Publish** tap |
| "Did you know?" posts | `hq-social-drafts`, pillar `story`, pending | your **Approve** tap |
| A stage waiting on you | an `hq-events` row and an open task, shown in the brief | you deciding |

```sh
pnpm tsx scripts/import-story-pack.ts path/to/story-pack.json                 # dry run, needs no database
pnpm tsx scripts/import-story-pack.ts path/to/story-pack.json --apply --limit 2
```

`--only site,social,stage` imports part of it. `--start 2026-10-06` sets the Miami date of the first
post (11:30 AM, one every two days). Each pending post sends a Telegram preview as it is created,
so import a few at a time with `--limit`.

**What an import refuses**, in `src/lib/storyPack.ts`:
- a script that no longer hashes to the approval recorded when the owner said yes
- an article block marked as narration that is not, word for word, the approved script line
- a post that states a year, price or phone number its listed facts don't contain
- a post that leans on a *Reported* fact without saying who reported it
- an Instagram or TikTok post with no media

**What it never does:** publish, overwrite, or send anything on its own. A story with the same
slug, a post with the same caption or a task with the same title is skipped, not replaced, because
you may have edited it since. The caption rules mirror the Studio gate in the postiz repo
(`telegram-bridge/src/studio/gate.mjs`) and are kept in step by hand.

**Not built yet:** video. HQ downloads draft media from a public https URL, and a story's videos
are local files, so they need somewhere to be hosted until they are approved. Until then only text
posts (Facebook) are imported.

### Sending a finished video to HQ

A video made on the owner's computer reaches a draft in two steps, neither of which publishes anything:

1. `hqAddDraftMediaFromUpload` stores the file in `hq-media` and returns its id. In the content repo,
   `scripts/hq_upload.py FILE --delivery` makes a smaller delivery copy (Telegram previews are limited to 50 MB, and
   the upload to 50 MB) and sends it with the key from the Claude config.
2. The draft's `media` field takes that id (as for any media). The owner sees the video in Telegram with Approve and
   Reject, exactly as for a photo, and Approve uploads it to Postiz.

Instagram and TikTok drafts need the video attached, so this is the step that unblocks them.

## Facebook rule

Standing rule from the owner (2026-10-06): **a Facebook post is never text
only.** Every Facebook post carries a photo or video **and** a
flamingocounty.com link. It is enforced in code, not by habit:

- Saving a draft that includes Facebook needs at least one media file, and a
  caption with a flamingocounty.com link (`facebookProblem` in
  `src/lib/postiz.ts`). This covers Claude, the admin and the importers.
  HQ's own two-step auto-draft writes skip only the link check, since the
  tracking link is written in a second step.
- Approve checks it again, so an old or edited draft that breaks the rule is
  refused in Telegram instead of reaching Postiz.
- A page with no picture gets no auto-draft. Give the story a cover and
  publish it again.
- The Studio's Facebook channel has `requiresMedia: true`.

## Published status

A draft moves to `published` on its own. The hourly stats job asks Postiz for
each scheduled draft whose time has passed; when every one of its posts reports
`PUBLISHED`, the draft is marked published and a `social.published` event is
logged. A post Postiz does not list, or one that is queued or errored, leaves
the draft `scheduled`. Published drafts keep getting their 24 h, 3 d and 7 d
stats and still appear in the social report. Drafts older than about nine days
are not looked at.

