# Postiz Cloud migration plan (2026-11-03)

Goal: Flamingo County posts through **Postiz Cloud** (api.postiz.com), not the
Hetzner Postiz. Facebook is dropped. YouTube comes later. Nothing goes live
without the owner's Telegram tap, the same as now.

## Where things stand

| | Hetzner (postiz.flamingocounty.com) | Postiz Cloud |
|---|---|---|
| Instagram | `instagram` (FB login), **dead** since the Nov 3 FB lock | `instagram-standalone` ✅ connected |
| TikTok | `tiktok`, unaudited app, private-only | `tiktok-business` ✅ connected (audit unconfirmed) |
| Facebook | dead (lock), **dropped by owner Nov 3** | none |
| Reddit | none | `reddit` ✅ connected (u/flamingo_county) |
| YouTube | none | later |
| Club de la Amistad (FB) | stays here for now | none |

Cloud has no posts yet. HQ (`web/src/lib/postiz.ts`) still points at Hetzner.
18 approved Instagram posts are queued on Hetzner for Nov 4–8 (16 ES stories
plus Primo Flacko ep. 3 #289 and #291). They will fail there. FB #290 is also
queued, and FB drafts #236, #238 and #292 are pending.

## Cloud API facts (docs.postiz.com, checked Nov 3)

- Base `https://api.postiz.com/public/v1`. It has no `/api` segment, unlike self-hosted.
- The key goes in `Authorization` raw, with no `Bearer`.
- `settings.__type` = the provider identifier: `instagram-standalone`, `tiktok-business`, `reddit`, `youtube`.
- Rate limit: the docs say 90–100/h on create-post only in one place and 30/h on everything in another. **Measure it before cutover.**
- There's no date-change endpoint. Moving a post = delete + re-create.
- TikTok Business only has the commercial music library. Our reels carry their own audio, so that's fine.

## Phase 0: before anything moves (tonight)

1. Owner pastes the Cloud API key. Store it in Keychain as `flamingo-county-postiz-cloud`.
2. Owner runs `! railway login` (the CLI token expired).
3. One `GET /integrations` with the key. Record any rate-limit headers.
4. Validate the payloads with `POST /posts` `type: "draft"` for instagram-standalone and tiktok-business. A draft never publishes. Then delete it. Never use the claude.ai Postiz MCP's schedule tool for this.

### Phase 0 results (Nov 3, ~8:50 PM ET): all passed

- The key is in Keychain as `flamingo-county-postiz-cloud` (account `flamingo-county`). Railway CLI is logged in.
- `GET /integrations` → 200, with no rate-limit headers on reads. Channel ids:
  - instagram-standalone `cmw1ebv7606g5pl07ndhl7oq1`
  - tiktok-business `cmw1ec7qp06tola07pk2chykx`
  - reddit `cmw1ecoia06tula0722nf08vi`
- **Rate limit = 100/hour on `POST /posts`** (`X-RateLimit-Limit: 100`, reset 3600 s). Uploads, lists and deletes sent no limit headers.
- `POST /upload` (multipart `file`) → 201 `{id, path: https://uploads.postiz.com/…}`. Same shape HQ reads today.
- `POST /posts` `type: "draft"` → 201 `[{postId, integration}]` for:
  - an IG feed post (`instagram-standalone`, `post_type: post`)
  - an IG story (`post_type: story`)
  - a TikTok video (`tiktok-business`, HQ's full toggle set)
  - Cloud stored each as DRAFT with the settings intact. `DELETE /posts/:id` → 200, and the list came back empty afterwards.
- TikTok Business has no privacy field for **video** posts (privacy_level only applies to photos). Videos go out with the account default, so the TikTok account itself must be public.

## Phase 1: HQ code (one PR, tests first)

**Shipped tonight (Nov 3), cut to what the Nov 4 9 AM stories need:**

- **Env is additive, not a rename**, so setting it never changes what the running image does:
  - `POSTIZ_API_URL/KEY` stay Hetzner.
  - `POSTIZ_CLOUD_API_URL/KEY` = Cloud.
  - `POSTIZ_NEW_POSTS=cloud` picks Cloud for newly approved drafts. **Rollback = unset it.**
- **`postizBackend`** on hq-social-drafts (`cloud` | `hetzner`, empty = hetzner). It's set at approval.
  - Cancel, settle (`markPublished`), time sync, post stats and the `findPostIds` fallback all go to the draft's own backend.
  - Each sweep asks each backend only about its own ids.
- **Platform map:** HQ keeps `instagram` / `tiktok`. Cloud gets `instagram-standalone` / `tiktok-business`.
  - `connectedChannels(backend)` maps them back to HQ's names.
  - Facebook on Cloud throws ("no facebook channel").
- **Channel stats** read the new-posts backend.
- **Facebook out of auto-drafts:** the event/story auto-draft and the Monday/Thursday roundup are Instagram only.
- **`hqMoveDraftToCloud`** (MCP). It refuses unless the draft is all of these:
  - scheduled
  - Instagram only
  - not already on Cloud
  - due more than 2 minutes out

  Order: create on Cloud, save Cloud ids + `postizBackend: cloud`, then delete on Hetzner. A failed Hetzner delete is reported, so the post can't go out twice unnoticed.

**Deferred:**
- **Reddit:** adds a platform enum, migration risk.
- **TikTok on reels by default:** wait for the first live TikTok test. A TikTok failure inside an IG+TikTok group would ping a draft whose IG side went out.
- **The Phase 3 items.**

### Original Phase 1 design


- **Two backends:**
  - `POSTIZ_API_URL/KEY` = Cloud.
  - `POSTIZ_LEGACY_API_URL/KEY` = Hetzner (today's values).
- **`postizPosts[].backend`** (`cloud` | `hetzner`): the migration defaults existing rows to `hetzner`. Cancel, settle and stats route by the tag, so old drafts keep working.
- **Platform map per backend:** HQ keeps `instagram` / `tiktok` / `reddit`. Cloud gets `instagram-standalone` / `tiktok-business` / `reddit`. `connectedChannels` and `settingsFor` use the map.
- **Facebook out of new drafts:**
  - `autoDraft.ts`, `weeklyRoundup.ts` and `storyPack.ts` default to Instagram (+ TikTok for reels).
  - `facebookProblem` stays for any old FB draft.
- **Reddit:** platform + settings only (subreddit, title, flair per draft). It's never auto-drafted, and each Reddit post is its own draft.
- **Reroute tool** (admin/MCP, scheduled drafts only): create the same content/media/time on Cloud, then cancel the Hetzner post, then save the Cloud ids. It works in that order, so a failure leaves the original in place.
- **Rollback:** point new approvals back at legacy with one env var.

## Phase 2: cutover

1. Set the Railway env (Cloud + legacy pairs). Deploy. Check the build ([[railway-build-flake]]).
2. Reroute the 18 IG posts (owner OK'd this Nov 3, existing approvals). Confirm 18 QUEUE on Cloud at the right times, and that none are left on Hetzner.
   - If Phase 1 isn't live by Nov 4 14:00 UTC, the first 3 stories fail on Hetzner. #146 pings, and they get redrafted.
3. FB #290 (queued) and #236/#238/#292 (pending): cancel/reject. **Ask before cancelling.**
4. **First live test:** one TikTok PUBLIC video through HQ after the owner's tap. This proves Cloud's TikTok app is audited. Do it during the trial.

## Phase 3: everything around HQ

- **telegram-bridge `bridge-flamingo`** (Mini App + post alerts) and the Studio hardcode `${url}/api/public/v1`.
  - Either fix the base URL and give them the Cloud key, or retire `bridge-flamingo`. HQ already pings on ERROR (#146).
  - Watch the read budget if the alerts poll Cloud.
- **content-marketing-system:**
  - `milestone_watch.py` SSHes to Hetzner for the IG count over the FB-linked token, which is dead. Switch it to Cloud `GET /analytics/<instagram-standalone id>`.
  - Update CLAUDE.md and docs that say Hetzner is the posting path.
- **Meta Graph telemetry** (`metaGraph.ts`, `hqReelNow`) needs the FB Page token. With FB gone it stays dead.
  - IG numbers come from Cloud analytics.
  - Check which KPIs ([[official-kpis]]) lose data.
- **MCP connectors:** retire `postiz-flamingo-county` (Hetzner) in ~/.claude.json. The claude.ai Postiz connector = Cloud, for **reads only**.

## Phase 4: wind down Hetzner (after 2–3 weeks of clean Cloud posting)

- Disconnect the Flamingo channels on Hetzner. Take a final `pg_dumpall`.
- The server stays up for the Club's FB bridge, until the Club gets its own decision.
- Cloud billing: Standard $29/mo. The trial end date is the owner's.
