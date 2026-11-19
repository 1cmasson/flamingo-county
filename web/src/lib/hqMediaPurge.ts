import type { Payload } from 'payload'

import { recordEvent } from './hq'

/**
 * Frees space on the volume by deleting old reel videos from hq-media.
 *
 * The 5 GB volume also holds the site's database, and on 2026-11-18 it was at
 * 4.93 GB, almost all of it draft reels that had already gone out. The
 * finished reels live on the owner's computer (~/Movies/Flamingo County Reels)
 * and in Postiz, so the server copy is only needed until the post is out.
 *
 * Only for videos (photos are small, and HQ renders some itself, so the
 * server's copy can be the only one). Refuses a video that is newer than
 * MIN_AGE_DAYS, or that a draft may still post or re-send: a pending or
 * approved draft, a scheduled one whose time is in the future or within the
 * last RECENT_DAYS, or an email still waiting on the owner. Deleting the doc
 * deletes the file and drops it from the old drafts' media lists.
 *
 * Dry run by default: the caller sees what would go before anything does.
 */

export const MIN_AGE_DAYS = 7
export const RECENT_DAYS = 2
export const MAX_IDS = 100

type Verdict = { id: number; filename?: string; bytes: number; reason?: string }
export type PurgeResult = {
  dryRun: boolean
  deleted: Verdict[]
  refused: Verdict[]
  freedBytes: number
  freedMB: number
}

const DAY = 86_400_000

/** Media ids a draft or an email may still need. */
async function mediaStillNeeded(payload: Payload, now: Date): Promise<Map<number, string>> {
  const need = new Map<number, string>()
  const recent = new Date(now.getTime() - RECENT_DAYS * DAY).toISOString()
  const drafts = await payload.find({
    collection: 'hq-social-drafts',
    where: {
      or: [
        { status: { in: ['pending', 'approved'] } },
        { and: [{ status: { equals: 'scheduled' } }, { scheduledFor: { greater_than_equal: recent } }] },
      ],
    },
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
    select: { media: true, status: true },
  })
  for (const d of drafts.docs) {
    for (const m of (d.media ?? []) as (number | { id: number })[]) {
      need.set(typeof m === 'object' ? m.id : m, `used by ${d.status} draft #${d.id}`)
    }
  }
  const emails = await payload.find({
    collection: 'hq-email-approvals',
    where: { decidedAt: { exists: false } },
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
    select: { attachments: true },
  })
  for (const e of emails.docs) {
    for (const m of (e.attachments ?? []) as (number | { id: number })[]) {
      need.set(typeof m === 'object' ? m.id : m, `attached to email #${e.id} awaiting the owner`)
    }
  }
  return need
}

export async function purgeDraftVideos(
  payload: Payload,
  ids: number[],
  opts: { dryRun?: boolean; now?: Date } = {},
): Promise<PurgeResult> {
  const dryRun = opts.dryRun !== false
  const now = opts.now ?? new Date()
  const unique = [...new Set(ids)]
  if (!unique.length) throw new Error('Give at least one hq-media id.')
  if (unique.length > MAX_IDS) throw new Error(`At most ${MAX_IDS} ids per call.`)

  const need = await mediaStillNeeded(payload, now)
  const cutoff = now.getTime() - MIN_AGE_DAYS * DAY
  const deleted: Verdict[] = []
  const refused: Verdict[] = []

  for (const id of unique) {
    const m = await payload
      .findByID({ collection: 'hq-media', id, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (!m) {
      refused.push({ id, bytes: 0, reason: 'not found' })
      continue
    }
    const v: Verdict = { id, filename: m.filename ?? undefined, bytes: m.filesize ?? 0 }
    if (m.mimeType !== 'video/mp4') v.reason = 'not a video'
    else if (new Date(m.createdAt).getTime() > cutoff) v.reason = `newer than ${MIN_AGE_DAYS} days`
    else if (need.has(id)) v.reason = need.get(id)
    if (v.reason) {
      refused.push(v)
      continue
    }
    if (!dryRun) {
      try {
        await payload.delete({ collection: 'hq-media', id, overrideAccess: true })
      } catch (err) {
        refused.push({ ...v, reason: `delete failed: ${err instanceof Error ? err.message : String(err)}` })
        continue
      }
    }
    deleted.push(v)
  }

  const freedBytes = deleted.reduce((s, v) => s + v.bytes, 0)
  const freedMB = Math.round(freedBytes / 1e5) / 10
  if (!dryRun && deleted.length) {
    await recordEvent(payload, {
      type: 'media.purged',
      summary: `Deleted ${deleted.length} old reel video${deleted.length === 1 ? '' : 's'} from the server (${freedMB} MB freed)`,
      refCollection: 'hq-media',
      data: { ids: deleted.map((v) => v.id), freedBytes },
    })
  }
  return { dryRun, deleted, refused, freedBytes, freedMB }
}
