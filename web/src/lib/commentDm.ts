import type { Payload } from 'payload'

import type { HqCommentCampaign, HqCommentReply, HqSocialDraft } from '../payload-types'
import { HQ_INTERNAL, miamiTime, recordEvent } from './hq'
import {
  FLAMINGO_IG_USERNAME,
  GraphError,
  MAX_PAGES,
  graphConfigured,
  graphGet,
  graphPost,
  graphUsagePct,
  isInvalidParam,
  isPermissionError,
  isRateLimited,
  listMeAccounts,
  otherManagedUsernames,
  pickFlamingoAccount,
  type GraphAccount,
  type Paged,
} from './metaGraph'
import { esc, sendMessage, telegramConfigured, type InlineKeyboard } from './telegram'

/**
 * "Comment CHACAL and we'll DM you", end to end. Every two minutes the
 * `commentDm` job (jobs/commentDm.ts) runs `runCommentDm`:
 *
 *   1. Nothing at all — no network call, no Graph lookup — unless a campaign
 *      in `hq-comment-campaigns` is active and not past `endsAt`, and
 *      META_GRAPH_TOKEN is set.
 *   2. For each campaign post, read its comments (GET /{media}/comments, with
 *      the commenter's `from{id,username}`). A comment with the keyword as a
 *      word of its own, case and accents aside, from someone other than us,
 *      becomes an `hq-comment-replies` row, due a random 5–12 minutes later,
 *      and the owner gets a Telegram alert right away, with a "No DM" button.
 *   3. Rows that are due get ONE private reply each through Instagram's
 *      Private Replies API (POST /{ig-user-id}/messages, recipient
 *      `{ comment_id }`). Meta allows one per comment, within 7 days of it.
 *
 * One DM per person per campaign: the row's unique `dedupeKey` is
 * `<campaign>:<commenter>`, so a second comment from the same person is kept
 * as `skipped`. At most `hourlyCap` DMs an hour per campaign; past it the
 * rest wait for the next run, and the owner is told once.
 *
 * Nothing is retried. A send is claimed (pending → sending) before the
 * request goes out, and whatever happens to it — Meta refuses, the token
 * lacks instagram_manage_messages, the request times out — the row ends
 * `sent` or `manual`. Manual means the owner got the handle, the post and the
 * exact DM text in Telegram to paste himself. Every failure reaches Telegram;
 * repeated run errors at most once an hour each, a missing permission once.
 *
 * Only @flamingo.county: the account comes from the token by name
 * (`pickFlamingoAccount`), a media id set by hand is checked to be ours before
 * its comments are read, and comments from us or from any other account the
 * token manages are never answered.
 *
 * Official API only. No browser, no scraping.
 */

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** Instagram's limit for a private reply: within 7 days of the comment. */
export const PRIVATE_REPLY_WINDOW_MS = 7 * DAY
/** Not right at the edge: a request in flight at 6d 23h 59m could land late. */
const WINDOW_MARGIN_MS = 15 * MIN
/** How far a draft's publishAt and the Instagram media's timestamp may differ to be the same post. */
export const DRAFT_MATCH_MS = 3 * MIN
/** Graph budget used (0–100) above which a run reads nothing more. */
const USAGE_STOP_PCT = 80
/** At most this many matches per Telegram alert, so its buttons stay usable. */
const ALERT_BATCH = 8

/* ------------------------------------------------------------------------ */
/* Pure rules                                                                */
/* ------------------------------------------------------------------------ */

/** Lowercase, accents off: "CHACÁL" → "chacal". Emoji and punctuation stay, and are not letters. */
export function normalize(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
}

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The keyword as a word of its own: "chacal", "CHACAL!", "Chacal 🔥",
 * "#chacal" and "@chacal…" match; "chacales" and "elchacal" do not.
 */
export function matchesKeyword(text: string | null | undefined, keyword: string | null | undefined): boolean {
  const kw = normalize((keyword ?? '').trim())
  if (!kw || !text) return false
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRx(kw)}(?![\\p{L}\\p{N}])`, 'u').test(normalize(text))
}

/** A random wait between `min` and `max` minutes, inclusive, in whole seconds. `rng` is Math.random's shape. */
export function pickDelayMs(minMinutes: number, maxMinutes: number, rng: () => number = Math.random): number {
  const lo = Math.max(0, Math.min(minMinutes, maxMinutes))
  const hi = Math.max(0, Math.max(minMinutes, maxMinutes))
  const r = Math.min(Math.max(rng(), 0), 1)
  return Math.round((lo + (hi - lo) * r) * 60) * 1000
}

/** Can a private reply still be sent at `at` for a comment made at `commentedAt`? */
export function withinReplyWindow(commentedAt: Date | string | null | undefined, at: Date): boolean {
  if (!commentedAt) return true // Graph always gives a timestamp; without one, trust Meta to refuse
  return at.getTime() - new Date(commentedAt).getTime() < PRIVATE_REPLY_WINDOW_MS - WINDOW_MARGIN_MS
}

export type IgCommenter = { id: string; text?: string; timestamp?: string; username?: string; from?: { id?: string; username?: string } }

const handleOf = (c: IgCommenter) => (c.from?.username ?? c.username ?? '').trim().replace(/^@/, '').toLowerCase()

/** Written by @flamingo.county itself, or by another account the same token manages. */
export function isOwnComment(c: IgCommenter, account: Pick<GraphAccount, 'igUserId'>, otherManaged: string[] = []): boolean {
  const handle = handleOf(c)
  return (
    (c.from?.id !== undefined && c.from.id === account.igUserId) ||
    handle === FLAMINGO_IG_USERNAME ||
    (handle !== '' && otherManaged.includes(handle))
  )
}

/** Who a commenter is, for "one DM per person": their Instagram-scoped id, else their handle. */
export function commenterKey(c: IgCommenter): string | null {
  if (c.from?.id) return `id:${c.from.id}`
  const h = handleOf(c)
  return h ? `u:${h}` : null
}

export type PlannedComment = { comment: IgCommenter; key: string | null; action: 'queue' | 'repeat' }

/**
 * Which of a post's comments are new matches, and which of those are a person
 * already queued (in this campaign, or earlier in the same batch). Comments
 * already saved, without the keyword, or from us are left out entirely.
 */
export function planComments(
  comments: IgCommenter[],
  opts: {
    keyword: string
    account: Pick<GraphAccount, 'igUserId'>
    otherManaged?: string[]
    knownCommentIds: Set<string>
    knownPeople: Set<string>
  },
): PlannedComment[] {
  const out: PlannedComment[] = []
  const seen = new Set(opts.knownPeople)
  // Oldest first, so a person's first comment is the one answered.
  const sorted = [...comments].sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''))
  for (const c of sorted) {
    if (opts.knownCommentIds.has(c.id)) continue
    if (!matchesKeyword(c.text, opts.keyword)) continue
    if (isOwnComment(c, opts.account, opts.otherManaged)) continue
    const key = commenterKey(c)
    if (key && seen.has(key)) {
      out.push({ comment: c, key, action: 'repeat' })
      continue
    }
    if (key) seen.add(key)
    out.push({ comment: c, key, action: 'queue' })
  }
  return out
}

/** How many more DMs this hour: the cap less those already handled in the last 60 minutes. */
export const capRoom = (handledLastHour: number, cap: number | null | undefined) => Math.max(0, (cap ?? 30) - handledLastHour)

/**
 * The draft's Instagram media: the account's media nearest its publishAt,
 * within three minutes. Two in that window are told apart by the caption's
 * opening; still two is no answer (the owner sets the media id by hand).
 */
export function matchDraftMedia(
  draft: Pick<HqSocialDraft, 'publishAt' | 'caption'>,
  media: IgMediaLite[],
  taken: Set<string>,
): IgMediaLite | null {
  if (!draft.publishAt) return null
  const at = new Date(draft.publishAt).getTime()
  const near = media.filter((m) => !taken.has(m.id) && Math.abs(new Date(m.timestamp).getTime() - at) <= DRAFT_MATCH_MS)
  if (near.length <= 1) return near[0] ?? null
  const opening = (s: string | null | undefined) => normalize(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
  const mine = opening(draft.caption)
  const same = near.filter((m) => {
    const theirs = opening(m.caption)
    const n = Math.min(theirs.length, mine.length)
    return n >= 12 && theirs.slice(0, n) === mine.slice(0, n)
  })
  return same.length === 1 ? same[0] : null
}

/* ------------------------------------------------------------------------ */
/* Graph calls                                                               */
/* ------------------------------------------------------------------------ */

export type IgMediaLite = { id: string; caption?: string; timestamp: string; permalink?: string; username?: string }

const COMMENT_FIELDS = 'id,text,timestamp,username,from{id,username}'
const COMMENT_FIELDS_BASIC = 'id,text,timestamp,username'

/** Top-level comments on one of our posts, with who wrote each. Throws GraphError. */
export async function listCommenters(mediaId: string, token: string): Promise<IgCommenter[]> {
  const read = async (fields: string) => {
    const out: IgCommenter[] = []
    let after: string | undefined
    for (let i = 0; i < MAX_PAGES; i++) {
      const params: Record<string, string> = { fields, limit: '50' }
      if (after) params.after = after
      const res = await graphGet<Paged<IgCommenter>>(`/${mediaId}/comments`, params, token)
      out.push(...(res.data ?? []))
      after = res.paging?.cursors?.after
      if (!after || !res.data?.length) break
    }
    return out
  }
  try {
    return await read(COMMENT_FIELDS)
  } catch (err) {
    if (!isInvalidParam(err)) throw err
    return read(COMMENT_FIELDS_BASIC)
  }
}

/** The permissions the token was granted, or null if Graph will not say. */
export async function grantedScopes(token: string): Promise<Set<string> | null> {
  try {
    const res = await graphGet<{ data?: { permission: string; status: string }[] }>('/me/permissions', {}, token)
    if (!res.data?.length) return null
    return new Set(res.data.filter((p) => p.status === 'granted').map((p) => p.permission))
  } catch {
    return null
  }
}

/**
 * One private reply. With a Page-linked Instagram account Meta wants the
 * Page's token (Facebook Login); a system user token is the fallback when
 * /me/accounts gave none.
 */
export async function sendPrivateReply(
  account: GraphAccount,
  commentId: string,
  text: string,
  userToken: string,
): Promise<{ recipient_id?: string; message_id?: string }> {
  const token = account.pageToken ?? userToken
  return graphPost(`/${account.igUserId}/messages`, { recipient: { comment_id: commentId }, message: { text } }, token, [token, userToken])
}

/* ------------------------------------------------------------------------ */
/* Telegram, said once                                                       */
/* ------------------------------------------------------------------------ */

const lastSaid = new Map<string, number>()
const sendRefused = { until: 0 }
let scopesCheckedAt = 0
let scopes: Set<string> | null = null
const verifiedMedia = new Map<string, IgMediaLite | false>()
let busy = false

/** For tests: forget what this process has said and learned, as a restart would. */
export function resetCommentDmState() {
  lastSaid.clear()
  sendRefused.until = 0
  scopesCheckedAt = 0
  scopes = null
  verifiedMedia.clear()
  busy = false
}

async function tell(text: string, keyboard?: InlineKeyboard): Promise<number | null> {
  if (!telegramConfigured()) {
    console.error('[hq] comment DM (no Telegram to tell):', text.replace(/<[^>]+>/g, ''))
    return null
  }
  try {
    return (await sendMessage(text, { keyboard })).message_id
  } catch (err) {
    console.error('[hq] comment DM Telegram failed:', err instanceof Error ? err.message : err)
    return null
  }
}

/** At most once per `everyMs` per key in this process: run errors that repeat every two minutes. */
async function tellThrottled(key: string, text: string, now: Date, everyMs = HOUR): Promise<void> {
  if ((lastSaid.get(key) ?? 0) + everyMs > now.getTime()) return
  lastSaid.set(key, now.getTime())
  await tell(text)
}

/**
 * The token lacks a permission this feature needs: one hq-events row and one
 * Telegram message, ever (checked against the database, so a restart does not
 * say it again).
 */
async function noteScopeOnce(payload: Payload, feature: string, scope: string, what: string, err?: unknown): Promise<void> {
  const seen = await payload.count({
    collection: 'hq-events',
    where: { and: [{ type: { equals: 'graph.scope_missing' } }, { refId: { equals: feature } }] },
    overrideAccess: true,
  })
  if (seen.totalDocs) return
  const how = 'Meta Business Settings → System users → Insights Reader → Generate new token with it ticked → paste it into META_GRAPH_TOKEN in Railway.'
  await recordEvent(payload, {
    type: 'graph.scope_missing',
    summary: `Comment DMs: ${what} needs ${scope} on META_GRAPH_TOKEN. ${how}`,
    refId: feature,
    data: {
      scope,
      code: err instanceof GraphError ? (err.code ?? null) : null,
      subcode: err instanceof GraphError ? (err.subcode ?? null) : null,
    },
  })
  await tell(`🔑 <b>Comment DMs: ${esc(what)} needs <code>${esc(scope)}</code></b>\n${esc(how)}\n\n<i>Until then${feature === 'comment-dm.send' ? ' each DM comes to you here to paste' : ' no comments can be read'}. Said once.</i>`)
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300)
const errCode = (err: unknown) =>
  err instanceof GraphError && err.code !== undefined ? `${err.code}${err.subcode ? `/${err.subcode}` : ''}` : undefined

/* ------------------------------------------------------------------------ */
/* The run                                                                   */
/* ------------------------------------------------------------------------ */

type Post = { mediaId: string; language: 'es' | 'en'; permalink: string | null }

export type CommentDmResult = { campaigns: number; posts: number; matched: number; sent: number; manual: number; skipped: number }
const NOTHING: CommentDmResult = { campaigns: 0, posts: 0, matched: 0, sent: 0, manual: 0, skipped: 0 }

const idOf = (v: unknown): number | null =>
  typeof v === 'number' ? v : v && typeof v === 'object' && 'id' in v ? Number((v as { id: unknown }).id) : null

/** Is a hand-set media id ours? Asked once per process per id. */
async function verifyMedia(mediaId: string, token: string): Promise<IgMediaLite | null> {
  const known = verifiedMedia.get(mediaId)
  if (known !== undefined) return known || null
  const m = await graphGet<IgMediaLite>(`/${mediaId}`, { fields: 'id,caption,timestamp,permalink,username' }, token).catch((err) => {
    if (err instanceof GraphError && !isRateLimited(err)) return null
    throw err
  })
  const ours = m && (m.username ?? '').toLowerCase() === FLAMINGO_IG_USERNAME ? m : null
  verifiedMedia.set(mediaId, ours ?? false)
  return ours
}

/**
 * A campaign's posts as media ids we may read. Draft-named posts are matched
 * to the account's own media (so they are ours by construction) and the id is
 * written back to the campaign; hand-set ids are checked.
 */
async function resolvePosts(payload: Payload, c: HqCommentCampaign, account: GraphAccount, token: string, now: Date): Promise<Post[]> {
  const rows = c.posts ?? []
  const taken = new Set(rows.map((r) => r.mediaId?.trim()).filter((x): x is string => Boolean(x)))
  let recent: IgMediaLite[] | null = null
  let changed = false
  const out: Post[] = []
  const next = []
  for (const r of rows) {
    const row = { ...r }
    const draftId = idOf(r.draft)
    const draft = draftId
      ? ((await payload.findByID({ collection: 'hq-social-drafts', id: draftId, depth: 0, overrideAccess: true }).catch(() => null)) as HqSocialDraft | null)
      : null
    const language = (r.language ?? (draft?.language === 'es' || draft?.language === 'en' ? draft.language : null)) as 'es' | 'en' | null
    if (!row.mediaId?.trim() && draft) {
      if (draft.publishAt && new Date(draft.publishAt).getTime() <= now.getTime()) {
        recent ??= (
          await graphGet<Paged<IgMediaLite>>(`/${account.igUserId}/media`, { fields: 'id,caption,timestamp,permalink', limit: '25' }, token)
        ).data ?? []
        const m = matchDraftMedia(draft, recent, taken)
        if (m) {
          row.mediaId = m.id
          row.permalink = m.permalink ?? null
          taken.add(m.id)
          verifiedMedia.set(m.id, m)
          changed = true
        } else {
          await tellThrottled(
            `unmatched:${c.id}:${draftId}`,
            `⚠️ <b>Comment DMs: can't find the Instagram post for draft #${draftId}</b> (${esc(c.name)}). Set its media id on the campaign in the admin.`,
            now,
            6 * HOUR,
          )
        }
      }
    }
    next.push(row)
    const mediaId = row.mediaId?.trim()
    if (!mediaId) continue
    if (!language) {
      await tellThrottled(`nolang:${c.id}:${mediaId}`, `⚠️ <b>Comment DMs:</b> post ${esc(mediaId)} in “${esc(c.name)}” has no language. Set it in the admin.`, now, 6 * HOUR)
      continue
    }
    const m = await verifyMedia(mediaId, token)
    if (!m) {
      await tellThrottled(
        `notours:${c.id}:${mediaId}`,
        `⛔ <b>Comment DMs:</b> media ${esc(mediaId)} in “${esc(c.name)}” is not a @flamingo.county post (or Graph can't see it). Skipped.`,
        now,
        6 * HOUR,
      )
      continue
    }
    if (!row.permalink && m.permalink) {
      row.permalink = m.permalink
      changed = true
    }
    out.push({ mediaId, language, permalink: row.permalink ?? m.permalink ?? null })
  }
  if (changed) {
    await payload.update({
      collection: 'hq-comment-campaigns',
      id: c.id,
      data: { posts: next },
      overrideAccess: true,
      context: { [HQ_INTERNAL]: true },
    })
  }
  return out
}

const shortText = (s: string | null | undefined, n = 200) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}
const at = (handle: string | null | undefined) => (handle ? `@${handle}` : 'someone')
const postLabel = (r: Pick<HqCommentReply, 'language' | 'permalink'>) => {
  const name = `${(r.language ?? '?').toUpperCase()} post`
  return r.permalink ? `<a href="${esc(r.permalink).replace(/"/g, '&quot;')}">${name}</a>` : name
}
const dmFor = (c: HqCommentCampaign, language: 'es' | 'en') => (language === 'es' ? c.dmTextEs : c.dmTextEn)

/** Callback data for "No DM": `cd:x:<reply id>`, well under Telegram's 64 bytes. */
export const noDmCallback = (id: number) => `cd:x:${id}`
export function parseNoDmCallback(data: string | undefined): number | null {
  const m = /^cd:x:(\d+)$/.exec(data ?? '')
  return m ? Number(m[1]) : null
}

/** The "No DM" buttons for the matches of one alert still waiting to be sent. */
function noDmKeyboard(rows: Pick<HqCommentReply, 'id' | 'username'>[]): InlineKeyboard {
  return { inline_keyboard: rows.map((r) => [{ text: `🚫 No DM ${at(r.username)}`.slice(0, 60), callback_data: noDmCallback(r.id) }]) }
}

/**
 * The owner tapped "No DM" on an alert. Returns the outcome line, and the
 * buttons to leave on that alert: those of its other matches still pending.
 */
export async function skipCommentDm(payload: Payload, id: number, alertMessageId?: number): Promise<{ outcome: string; keep: InlineKeyboard }> {
  const r = (await payload.findByID({ collection: 'hq-comment-replies', id, depth: 0, overrideAccess: true }).catch(() => null)) as HqCommentReply | null
  let outcome: string
  if (!r) outcome = `No comment #${id}.`
  else if (r.status !== 'pending') outcome = `${esc(at(r.username))}: already ${esc(r.status)}.`
  else {
    const res = await payload.update({
      collection: 'hq-comment-replies',
      where: { and: [{ id: { equals: id } }, { status: { equals: 'pending' } }] },
      data: { status: 'skipped', skipReason: 'You tapped No DM.', handledAt: new Date().toISOString() },
      overrideAccess: true,
    })
    outcome = res.docs.length ? `🚫 No DM for ${esc(at(r.username))}.` : `${esc(at(r.username))}: already on its way.`
  }
  const others = alertMessageId
    ? ((
        await payload.find({
          collection: 'hq-comment-replies',
          where: { and: [{ alertMessageId: { equals: alertMessageId } }, { status: { equals: 'pending' } }] },
          limit: ALERT_BATCH,
          depth: 0,
          overrideAccess: true,
          select: { username: true },
        })
      ).docs as Pick<HqCommentReply, 'id' | 'username'>[])
    : []
  return { outcome, keep: noDmKeyboard(others) }
}

/** The manual fallback: everything the owner needs to send it himself. */
function manualText(r: HqCommentReply, why: string): string {
  return [
    `✍️ <b>DM by hand: ${esc(at(r.username))}</b>`,
    `<i>${esc(why)}</i>`,
    '',
    `On the ${postLabel(r)}: “${esc(shortText(r.commentText))}”`,
    r.username ? `Profile: https://www.instagram.com/${esc(r.username)}/` : '',
    '',
    'Send this (Instagram → the comment → Send private reply, or a DM):',
    `<code>${esc(r.dmText)}</code>`,
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n')
}

async function setReply(payload: Payload, id: number, data: Partial<HqCommentReply>) {
  await payload.update({ collection: 'hq-comment-replies', id, data, overrideAccess: true })
}

export async function runCommentDm(
  payload: Payload,
  now: Date = new Date(),
  opts: { rng?: () => number } = {},
): Promise<CommentDmResult> {
  const campaigns = (
    await payload.find({
      collection: 'hq-comment-campaigns',
      where: { and: [{ active: { equals: true } }, { or: [{ endsAt: { exists: false } }, { endsAt: { equals: null } }, { endsAt: { greater_than: now.toISOString() } }] }] },
      limit: 20,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as HqCommentCampaign[]
  if (!campaigns.length) return { ...NOTHING }
  const out: CommentDmResult = { ...NOTHING, campaigns: campaigns.length }

  if (!graphConfigured()) {
    await tellThrottled('no-token', '⚠️ <b>Comment DMs are on but META_GRAPH_TOKEN is not set.</b> Nothing is read or sent.', now, 6 * HOUR)
    return out
  }
  if (busy) return out // the last run is still going
  busy = true
  try {
    const token = process.env.META_GRAPH_TOKEN!.trim()
    let account: GraphAccount | null
    let others: string[]
    try {
      const pages = await listMeAccounts(token)
      account = pickFlamingoAccount(pages)
      others = otherManagedUsernames(pages)
    } catch (err) {
      await tellThrottled('lookup', `⚠️ <b>Comment DMs: Graph account lookup failed.</b> ${esc(errText(err))}`, now)
      return out
    }
    if (!account) {
      await tellThrottled('no-account', '⚠️ <b>Comment DMs:</b> META_GRAPH_TOKEN reaches no single Flamingo County Page with @flamingo.county. Nothing is read or sent.', now, 6 * HOUR)
      return out
    }

    // What the token may do, asked once an hour. Null: Graph won't say; learn from the errors.
    if (now.getTime() - scopesCheckedAt > HOUR) {
      scopes = await grantedScopes(token)
      scopesCheckedAt = now.getTime()
    }
    let canRead = !scopes || scopes.has('instagram_manage_comments')
    if (!canRead) await noteScopeOnce(payload, 'comment-dm.read', 'instagram_manage_comments', 'reading comments')
    if (scopes && !scopes.has('instagram_manage_messages')) {
      sendRefused.until = now.getTime() + HOUR
      await noteScopeOnce(payload, 'comment-dm.send', 'instagram_manage_messages', 'sending DMs')
    }

    /* -------- 1. read comments, queue matches, alert -------- */
    for (const c of campaigns) {
      if (!canRead) break
      if (graphUsagePct() >= USAGE_STOP_PCT) {
        await tellThrottled('usage', `⏳ Comment DMs: Meta's API budget is ${graphUsagePct()}% used, so reading pauses until it drops.`, now)
        break
      }
      let posts: Post[]
      try {
        posts = await resolvePosts(payload, c, account, token, now)
      } catch (err) {
        await tellThrottled(`resolve:${c.id}`, `⚠️ <b>Comment DMs: couldn't look up the posts of “${esc(c.name)}”.</b> ${esc(errText(err))}`, now)
        continue
      }
      out.posts += posts.length

      const existing = (
        await payload.find({
          collection: 'hq-comment-replies',
          where: { campaign: { equals: c.id } },
          limit: 5000,
          depth: 0,
          overrideAccess: true,
          select: { commentId: true, dedupeKey: true },
        })
      ).docs
      const knownCommentIds = new Set(existing.map((r) => r.commentId))
      const prefix = `${c.id}:`
      const knownPeople = new Set(existing.map((r) => r.dedupeKey).filter((k): k is string => Boolean(k?.startsWith(prefix))).map((k) => k.slice(prefix.length)))

      for (const post of posts) {
        const fresh: HqCommentReply[] = []
        let comments: IgCommenter[]
        try {
          comments = await listCommenters(post.mediaId, token)
        } catch (err) {
          if (isPermissionError(err)) {
            canRead = false
            await noteScopeOnce(payload, 'comment-dm.read', 'instagram_manage_comments', 'reading comments', err)
            break
          }
          await tellThrottled(`read:${post.mediaId}`, `⚠️ <b>Comment DMs: couldn't read the comments of the ${post.language.toUpperCase()} post.</b> ${esc(errText(err))}`, now)
          continue
        }
        const plan = planComments(comments, { keyword: c.keyword, account, otherManaged: others, knownCommentIds, knownPeople })
        for (const p of plan) {
          // The next post of the same campaign knows this person too.
          if (p.key) knownPeople.add(p.key)
          const handle = handleOf(p.comment) || null
          const base = {
            campaign: c.id,
            commentId: p.comment.id,
            username: handle,
            igUserId: p.comment.from?.id ?? null,
            language: post.language,
            mediaId: post.mediaId,
            permalink: post.permalink,
            commentText: shortText(p.comment.text, 2200),
            commentedAt: p.comment.timestamp && !Number.isNaN(Date.parse(p.comment.timestamp)) ? new Date(p.comment.timestamp).toISOString() : null,
          }
          knownCommentIds.add(p.comment.id)
          if (p.action === 'repeat') {
            await payload
              .create({
                collection: 'hq-comment-replies',
                data: { ...base, dedupeKey: `skip:${p.comment.id}`, status: 'skipped', skipReason: 'Same person commented before: one DM per person.', handledAt: now.toISOString() },
                overrideAccess: true,
              })
              .then(() => out.skipped++)
              .catch((err) => console.error('[hq] comment DM row not saved:', errText(err)))
            continue
          }
          const late = !withinReplyWindow(p.comment.timestamp, now)
          const scheduledAt = new Date(now.getTime() + pickDelayMs(c.delayMinMinutes ?? 5, c.delayMaxMinutes ?? 12, opts.rng))
          try {
            const row = (await payload.create({
              collection: 'hq-comment-replies',
              data: {
                ...base,
                // Payload's unique check counts empty as a value, so a row that holds no person gets its own key.
                dedupeKey: p.key && !late ? `${c.id}:${p.key}` : `skip:${p.comment.id}`,
                dmText: dmFor(c, post.language),
                ...(late
                  ? { status: 'skipped', skipReason: 'Older than Instagram’s 7 days for a private reply.', handledAt: now.toISOString() }
                  : { status: 'pending', scheduledAt: scheduledAt.toISOString() }),
              },
              overrideAccess: true,
            })) as HqCommentReply
            if (late) out.skipped++
            else {
              fresh.push(row)
              out.matched++
            }
          } catch (err) {
            // A unique key held by a row written in between: that person is already queued.
            console.error('[hq] comment DM row not saved:', errText(err))
          }
        }
        // One alert per post and batch, each match with its own No DM button.
        for (let i = 0; i < fresh.length; i += ALERT_BATCH) {
          const batch = fresh.slice(i, i + ALERT_BATCH)
          const lines = batch.map((r) => {
            const mins = Math.round((new Date(r.scheduledAt!).getTime() - now.getTime()) / MIN)
            return `• <b>${esc(at(r.username))}</b>: “${esc(shortText(r.commentText, 160))}”\n  DM ~${esc(miamiTime(r.scheduledAt!))} (in ${mins} min)`
          })
          const head = `💬 <b>${batch.length === 1 ? 'A' : batch.length} “${esc(c.keyword)}” comment${batch.length === 1 ? '' : 's'}</b> on the ${postLabel(batch[0])} · ${esc(c.name)}`
          const text = [head, '', ...lines, '', `<i>DM: ${esc(shortText(dmFor(c, post.language), 300))}</i>`].join('\n')
          const messageId = await tell(text, noDmKeyboard(batch))
          if (messageId) for (const r of batch) await setReply(payload, r.id, { alertMessageId: messageId })
        }
      }

    }

    /* -------- 2. send what is due -------- */
    const sentLines: string[] = []
    for (const c of campaigns) {
      const due = (
        await payload.find({
          collection: 'hq-comment-replies',
          where: { and: [{ campaign: { equals: c.id } }, { status: { equals: 'pending' } }, { scheduledAt: { less_than_equal: now.toISOString() } }] },
          sort: ['scheduledAt', 'commentedAt'],
          limit: 100,
          depth: 0,
          overrideAccess: true,
        })
      ).docs as HqCommentReply[]
      if (!due.length) continue
      const handled = await payload.count({
        collection: 'hq-comment-replies',
        where: {
          and: [
            { campaign: { equals: c.id } },
            { status: { in: ['sent', 'manual', 'sending'] } },
            { handledAt: { greater_than: new Date(now.getTime() - HOUR).toISOString() } },
          ],
        },
        overrideAccess: true,
      })
      let room = capRoom(handled.totalDocs, c.hourlyCap)
      for (const r of due) {
        if (!withinReplyWindow(r.commentedAt, now)) {
          await setReply(payload, r.id, { status: 'skipped', skipReason: 'Older than Instagram’s 7 days for a private reply.', handledAt: now.toISOString() })
          await tell(manualText({ ...r, dmText: r.dmText }, 'Past Instagram’s 7 days, so HQ can no longer send a private reply. A normal DM may still work.'))
          out.skipped++
          continue
        }
        if (room <= 0) {
          const waiting = due.length - due.indexOf(r)
          await tellThrottled(
            `cap:${c.id}`,
            `🚦 <b>Comment DMs hit ${c.hourlyCap ?? 30} this hour</b> (${esc(c.name)}). ${waiting} waiting; they go out as the hour frees up.`,
            now,
          )
          break
        }
        // Claim it: only the run that moves it out of pending sends it.
        const claimed = await payload.update({
          collection: 'hq-comment-replies',
          where: { and: [{ id: { equals: r.id } }, { status: { equals: 'pending' } }] },
          data: { status: 'sending', handledAt: now.toISOString() },
          overrideAccess: true,
        })
        if (!claimed.docs.length) continue
        room--
        const text = r.dmText || dmFor(c, r.language === 'en' ? 'en' : 'es')

        let why: string | null = null
        let error: { message: string; code?: string } | null = null
        if (sendRefused.until > now.getTime()) {
          why = 'The token can’t send DMs yet (instagram_manage_messages).'
        } else {
          try {
            const res = await sendPrivateReply(account, r.commentId, text, token)
            await setReply(payload, r.id, {
              status: 'sent',
              handledAt: now.toISOString(),
              messageId: res.message_id ?? null,
              recipientId: res.recipient_id ?? null,
              dmText: text,
            })
            sentLines.push(`• ${esc(at(r.username))} (${(r.language ?? '?').toUpperCase()})`)
            out.sent++
            continue
          } catch (err) {
            error = { message: errText(err), code: errCode(err) }
            if (err instanceof GraphError && err.code !== undefined && err.code >= 200 && err.code < 300) {
              sendRefused.until = now.getTime() + HOUR
              await noteScopeOnce(payload, 'comment-dm.send', 'instagram_manage_messages', 'sending DMs', err)
              why = `Meta refused: ${error.message}`
            } else if (err instanceof GraphError) {
              why = `Meta refused this one: ${error.message}`
            } else {
              why = `The request to Meta failed (${error.message}). It may or may not have gone out: check the DMs before pasting.`
            }
          }
        }
        const notified = (await tell(manualText({ ...r, dmText: text }, why))) !== null
        await setReply(payload, r.id, {
          status: notified ? 'manual' : 'failed',
          handledAt: now.toISOString(),
          dmText: text,
          ownerNotified: notified,
          error: error?.message ?? why,
          errorCode: error?.code ?? null,
        })
        out.manual++
      }
    }
    if (sentLines.length) await tell(`✅ <b>DM sent</b>\n${sentLines.join('\n')}`)

    /* -------- 3. manual DMs the owner never got: try telling him again -------- */
    const untold = (
      await payload.find({
        collection: 'hq-comment-replies',
        where: { and: [{ status: { equals: 'failed' } }, { ownerNotified: { equals: false } }, { handledAt: { greater_than: new Date(now.getTime() - DAY).toISOString() } }] },
        limit: 10,
        depth: 0,
        overrideAccess: true,
      })
    ).docs as HqCommentReply[]
    for (const r of untold) {
      if (!telegramConfigured()) break
      if ((await tell(manualText(r, r.error ?? 'HQ could not send it.'))) !== null) {
        await setReply(payload, r.id, { status: 'manual', ownerNotified: true })
      }
    }
    return out
  } finally {
    busy = false
  }
}
