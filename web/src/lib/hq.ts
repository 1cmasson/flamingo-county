import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import path from 'path'
import type { Payload, PayloadRequest } from 'payload'

import { hqMediaDir } from '../collections/HqMedia'
import type { HqMedia, HqSocialDraft } from '../payload-types'
import { SITE_TZ } from './dates'
import {
  buildPostBody,
  connectedChannels,
  createPost,
  deletePost,
  findPostIds,
  postIdsFrom,
  uploadMedia,
  type Platform,
  facebookProblem,
} from './postiz'
import {
  FILE_UPLOAD_LIMIT,
  PHOTO_UPLOAD_LIMIT,
  esc,
  notifyOwner,
  sendMedia,
  sendMessage,
  telegramConfigured,
  type InlineKeyboard,
} from './telegram'

/**
 * Set on writes HQ makes to its own records, so the collection hooks that
 * react to a draft being created or reset do not fire again on the bookkeeping
 * update that follows (storing the Telegram message id, a status change).
 */
export const HQ_INTERNAL = 'hqInternal'

type EventInput = {
  type: string
  summary: string
  refCollection?: string
  refId?: string | number
  data?: Record<string, unknown>
}

/**
 * Write one `hq-events` row, then optionally ping Telegram.
 *
 * Built for hooks on the public path: it never throws, and the ping is not
 * awaited, so neither a Telegram outage nor a slow API can fail or delay a
 * visitor's form submit. (The SQLite adapter runs without transactions — no
 * `transactionOptions` in payload.config — so passing the hook's `req` only
 * carries its context; there is no rollback to join or to break.)
 */
export async function recordEvent(
  payload: Payload,
  event: EventInput,
  opts: { req?: PayloadRequest; ping?: string } = {},
): Promise<void> {
  try {
    await payload.create({
      collection: 'hq-events',
      data: {
        type: event.type,
        summary: event.summary,
        refCollection: event.refCollection,
        refId: event.refId === undefined ? undefined : String(event.refId),
        data: event.data,
        status: 'new',
      },
      req: opts.req,
    })
  } catch (err) {
    console.error('[hq] could not record event', event.type, err)
  }
  if (opts.ping) void notifyOwner(opts.ping)
}

/** "Thu Oct 1, 7:30 PM" in Miami time — the only clock the owner reads. */
export function miamiTime(d: Date | string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: SITE_TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(d))
}

/* ------------------------------------------------------------------------ */
/* Social drafts                                                             */
/* ------------------------------------------------------------------------ */

export type DraftAction = 'approve' | 'reject'

/**
 * Inline-button payloads. Telegram caps `callback_data` at 64 bytes, so a
 * short `sd:a:<id>` rather than JSON.
 */
export function draftCallback(action: DraftAction, id: number | string): string {
  return `sd:${action === 'approve' ? 'a' : 'r'}:${id}`
}

export function parseDraftCallback(data: string | undefined): { action: DraftAction; id: number } | null {
  const m = /^sd:([ar]):(\d+)$/.exec(data ?? '')
  if (!m) return null
  return { action: m[1] === 'a' ? 'approve' : 'reject', id: Number(m[2]) }
}

function draftKeyboard(id: number): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: '✅ Approve', callback_data: draftCallback('approve', id) },
        { text: '✖️ Reject', callback_data: draftCallback('reject', id) },
      ],
    ],
  }
}

async function draftMedia(payload: Payload, draft: HqSocialDraft): Promise<HqMedia[]> {
  const ids = (draft.media ?? []).map((m) => (typeof m === 'object' ? m.id : m))
  if (!ids.length) return []
  const { docs } = await payload.find({
    collection: 'hq-media',
    where: { id: { in: ids } },
    limit: ids.length,
    depth: 0,
    overrideAccess: true,
  })
  // `in` does not preserve order; the first file is the cover everywhere.
  return ids.map((id) => docs.find((d) => d.id === id)).filter((d): d is HqMedia => Boolean(d))
}

async function readMedia(doc: HqMedia): Promise<Blob> {
  if (!doc.filename) throw new Error(`hq-media ${doc.id} has no file`)
  const buf = await readFile(path.join(hqMediaDir(), doc.filename))
  return new Blob([buf], { type: doc.mimeType ?? 'application/octet-stream' })
}

/**
 * Everything Approve would send to Postiz. Stored as `previewedHash` when the
 * preview goes out and compared again at approval, so what gets posted is
 * always exactly what the owner saw.
 */
export function draftFingerprint(draft: Pick<HqSocialDraft, 'caption' | 'media' | 'platforms' | 'scheduledFor'>): string {
  const media = (draft.media ?? []).map((m) => (typeof m === 'object' ? m.id : m))
  return createHash('sha256')
    .update(
      JSON.stringify([draft.caption, media, [...(draft.platforms ?? [])].sort(), new Date(draft.scheduledFor).toISOString()]),
    )
    .digest('hex')
}

/**
 * Two posts closer together than this bury each other. Auto-drafts keep this
 * far apart (lib/autoDraft.ts); a hand-made draft sets its own time, so its
 * preview warns instead.
 */
export const POST_GAP_MS = 3 * 60 * 60_000

export type DraftClash = { id: number; scheduledFor: string; caption: string }

/**
 * Other drafts waiting to go out (pending, approved or scheduled) within
 * `POST_GAP_MS` of this one. Several agents write drafts; this is how a
 * double-booking shows up before the owner taps Approve.
 */
export async function draftClashes(payload: Payload, draft: Pick<HqSocialDraft, 'id' | 'scheduledFor'>): Promise<DraftClash[]> {
  const at = new Date(draft.scheduledFor).getTime()
  if (!Number.isFinite(at)) return []
  const { docs } = await payload.find({
    collection: 'hq-social-drafts',
    where: {
      and: [
        { id: { not_equals: draft.id } },
        { status: { in: ['pending', 'approved', 'scheduled'] } },
        { scheduledFor: { greater_than: new Date(at - POST_GAP_MS).toISOString() } },
        { scheduledFor: { less_than: new Date(at + POST_GAP_MS).toISOString() } },
      ],
    },
    select: { scheduledFor: true, caption: true },
    sort: 'scheduledFor',
    limit: 10,
    depth: 0,
    overrideAccess: true,
  })
  return docs.map((d) => ({ id: d.id, scheduledFor: d.scheduledFor, caption: d.caption ?? '' }))
}

export function draftPreviewText(draft: HqSocialDraft, extraFiles: number, clashes: DraftClash[] = []): string {
  const lines = [
    `<b>📣 Social draft #${draft.id}</b>`,
    `${(draft.platforms ?? []).join(' · ')} — ${esc(miamiTime(draft.scheduledFor))}`,
  ]
  for (const c of clashes) {
    const first = c.caption.split('\n')[0].trim()
    const title = first.length > 60 ? `${first.slice(0, 59).trimEnd()}…` : first
    lines.push(`⚠️ Within 3 h of draft #${c.id} (${esc(miamiTime(c.scheduledFor))}): ${esc(title)}`)
  }
  if (extraFiles > 0) lines.push(`<i>+${extraFiles} more file${extraFiles === 1 ? '' : 's'} (see admin)</i>`)
  // The caption goes last: `clip` can only cut safely after every tag closes.
  lines.push('', esc(draft.caption))
  return lines.join('\n')
}

/**
 * Show a draft in Telegram with Approve / Reject buttons. The cover file is
 * uploaded with the message, so what the owner approves is what they saw.
 */
export async function sendDraftPreview(payload: Payload, draft: HqSocialDraft): Promise<void> {
  if (!telegramConfigured()) return
  const media = await draftMedia(payload, draft)
  const cover = media[0]
  const keyboard = draftKeyboard(draft.id)

  // A failed lookup must not stop the preview: the warning is a nicety.
  const clashes = await draftClashes(payload, draft).catch(() => [])
  let text = draftPreviewText(draft, Math.max(0, media.length - 1), clashes)
  let messageId: number

  const kind = cover?.mimeType?.startsWith('video/') ? 'video' : 'photo'
  const limit = kind === 'video' ? FILE_UPLOAD_LIMIT : PHOTO_UPLOAD_LIMIT
  if (cover && (cover.filesize ?? 0) <= limit) {
    const sent = await sendMedia({
      kind,
      file: await readMedia(cover),
      filename: cover.filename ?? `draft-${draft.id}`,
      caption: text,
      keyboard,
    })
    messageId = sent.message_id
  } else {
    if (cover) text += '\n\n<i>(cover file is too large to preview here — check the admin)</i>'
    messageId = (await sendMessage(text, { keyboard })).message_id
  }

  await payload.update({
    collection: 'hq-social-drafts',
    id: draft.id,
    data: { telegramMessageId: messageId, previewedHash: draftFingerprint(draft) },
    overrideAccess: true,
    context: { [HQ_INTERNAL]: true },
  })
}

async function setDraft(payload: Payload, id: number, data: Partial<HqSocialDraft>) {
  return payload.update({
    collection: 'hq-social-drafts',
    id,
    data,
    overrideAccess: true,
    context: { [HQ_INTERNAL]: true },
  })
}

/**
 * Approve or reject a pending draft. Returns a one-line outcome for Telegram.
 *
 * Only a `pending` draft moves. The status flips to `approved` *before* the
 * Postiz calls, so a later tap — or Telegram redelivering the webhook — finds
 * it no longer pending; a tap *during* the calls is stopped by `deciding`.
 * Either way the post is scheduled once.
 */
export async function decideDraft(
  payload: Payload,
  id: number,
  action: DraftAction,
): Promise<string> {
  // Read-then-write is not atomic, and Telegram delivers webhooks concurrently,
  // so two taps can both read `pending`. One process serves every request
  // (SQLite pins the service to a single instance), so an in-memory guard
  // closes that gap.
  if (deciding.has(id)) return `Draft #${id} is already being handled.`
  deciding.add(id)
  try {
    return await decide(payload, id, action)
  } finally {
    deciding.delete(id)
  }
}

const deciding = new Set<number>()

async function decide(payload: Payload, id: number, action: DraftAction): Promise<string> {
  const draft = await payload
    .findByID({ collection: 'hq-social-drafts', id, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!draft) return `Draft #${id} no longer exists.`
  if (draft.status !== 'pending') return `Draft #${id} is already ${draft.status}.`

  if (action === 'reject') {
    await setDraft(payload, id, { status: 'rejected' })
    await recordEvent(payload, {
      type: 'social.rejected',
      summary: `Rejected social draft #${id}`,
      refCollection: 'hq-social-drafts',
      refId: id,
    })
    return `✖️ Draft #${id} rejected. Nothing was sent to Postiz.`
  }

  if (draft.previewedHash !== draftFingerprint(draft)) {
    // Edited after the preview the owner tapped. Show the current version
    // instead of posting something they have not seen.
    void sendDraftPreview(payload, draft).catch((err) =>
      console.error('[hq] draft preview failed:', err instanceof Error ? err.message : err),
    )
    return `Draft #${id} changed since that preview, so nothing was posted. The current version is below — approve that one.`
  }

  const rule = facebookProblem(draft.platforms, Array.isArray(draft.media) ? draft.media.length : 0, draft.caption)
  if (rule) return `🚫 Draft #${id} was not posted. ${rule} Edit it in the admin and approve the new preview.`

  await setDraft(payload, id, { status: 'approved', error: null })
  try {
    const platforms = (draft.platforms ?? []) as Platform[]
    const channels = await connectedChannels()
    const uploaded = []
    for (const doc of await draftMedia(payload, draft)) {
      uploaded.push(await uploadMedia(await readMedia(doc), doc.filename ?? `hq-${doc.id}`))
    }
    const body = buildPostBody({
      caption: draft.caption,
      platforms,
      integrations: channels,
      media: uploaded,
      scheduledFor: new Date(draft.scheduledFor),
    })
    const response = await createPost(body)

    // Saved for the stats job: when it went out, and which Postiz post is
    // which platform. An empty `postizPosts` is filled in later by
    // `findPostIds` if the reply carried no ids.
    await setDraft(payload, id, {
      status: 'scheduled',
      publishAt: body.date,
      postizPosts: postIdsFrom(response, channels),
      postizResponse: response as never,
    })
    const when = body.type === 'now' ? 'now' : miamiTime(body.date)
    await recordEvent(payload, {
      type: 'social.scheduled',
      summary: `Scheduled draft #${id} to ${platforms.join(', ')} for ${when}`,
      refCollection: 'hq-social-drafts',
      refId: id,
    })
    return `✅ Draft #${id} scheduled on ${esc(platforms.join(', '))} for ${esc(when)}.`
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await setDraft(payload, id, { status: 'failed', error: message })
    await recordEvent(payload, {
      type: 'social.failed',
      summary: `Draft #${id} failed to schedule`,
      refCollection: 'hq-social-drafts',
      refId: id,
      data: { error: message },
    })
    return `⚠️ Draft #${id} failed: ${esc(message)}\nSet it back to Pending in the admin to try again.`
  }
}


/**
 * Cancel a post that is still waiting to go out: remove it from the Postiz
 * calendar, then mark the draft rejected so it cannot be sent again by
 * accident. Refuses a post that has already gone out, since Postiz cannot
 * take it back. If Postiz fails, the draft is left as it was, so the owner can
 * see it is still scheduled.
 */
export async function cancelDraft(payload: Payload, id: number, now: Date = new Date()): Promise<string> {
  const draft = await payload
    .findByID({ collection: 'hq-social-drafts', id, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!draft) throw new Error(`Draft #${id} does not exist.`)
  if (draft.status === 'pending') {
    await setDraft(payload, id, { status: 'rejected' })
    return `Draft #${id} was only pending; it is rejected and nothing was ever sent to Postiz.`
  }
  if (draft.status !== 'scheduled') throw new Error(`Draft #${id} is ${draft.status}, so there is nothing to cancel.`)
  if (draft.publishAt && new Date(draft.publishAt).getTime() <= now.getTime()) {
    throw new Error(`Draft #${id} was due ${miamiTime(draft.publishAt)}, so it has probably gone out. Remove it on the social account.`)
  }

  const platforms = (draft.platforms ?? []) as Platform[]
  let posts = (draft.postizPosts ?? []).filter((p) => p.postId)
  if (!posts.length && draft.publishAt) {
    posts = await findPostIds(await connectedChannels(), platforms, new Date(draft.publishAt))
  }
  if (!posts.length) throw new Error(`Could not find draft #${id}'s post in Postiz. Delete it in the Postiz calendar.`)

  // One call per distinct id: the posts of one draft share a group.
  for (const postId of [...new Set(posts.map((p) => String(p.postId)))]) {
    await deletePost(postId)
  }
  await setDraft(payload, id, { status: 'rejected', error: 'Cancelled after scheduling.' })
  await recordEvent(payload, {
    type: 'social.cancelled',
    summary: `Cancelled scheduled draft #${id} (${platforms.join(', ')})`,
    refCollection: 'hq-social-drafts',
    refId: id,
  })
  return `Draft #${id} is removed from Postiz and marked rejected.`
}
