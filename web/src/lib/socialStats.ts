import type { Payload } from 'payload'

import type { HqSocialDraft } from '../payload-types'
import { miamiHour } from './brief'
import { HQ_INTERNAL, recordEvent } from './hq'
import {
  channelAnalytics,
  connectedChannels,
  findPostIds,
  listPostStates,
  listPostTimes,
  postAnalytics,
  postizConfigured,
  summarizeMetrics,
  type CreatedPost,
  type Platform,
} from './postiz'

/**
 * When a post is measured, counted from `publishAt`. Comparing every post at
 * the same ages is what makes a Tuesday photo comparable with a Saturday reel.
 */
export const CHECKPOINTS = [
  { key: '24h', hours: 24 },
  { key: '3d', hours: 72 },
  { key: '7d', hours: 168 },
] as const
export type Checkpoint = (typeof CHECKPOINTS)[number]['key']

/**
 * How long a checkpoint keeps being retried. Postiz answers `[]` until a post
 * is live and matched to the platform's copy, so an empty reply means "ask
 * again next hour", not "zero". After this, the checkpoint is skipped rather
 * than recorded as zeros — a missing reading is honest, an invented one is not.
 */
const RETRY_HOURS = 48

const HOUR = 60 * 60 * 1000
/** Oldest publish time still worth looking at: last checkpoint plus retries. */
const LOOKBACK_MS = (168 + RETRY_HOURS) * HOUR

/** Checkpoints that have come due, are still within their retry window, and are not yet taken. */
export function dueCheckpoints(publishAt: Date, now: Date, taken: Set<string>): Checkpoint[] {
  const age = now.getTime() - publishAt.getTime()
  return CHECKPOINTS.filter(
    (c) => age >= c.hours * HOUR && age < (c.hours + RETRY_HOURS) * HOUR && !taken.has(c.key),
  ).map((c) => c.key)
}

/** Days of history to ask Postiz for at a checkpoint: the post's whole life so far, plus one. */
const daysFor = (c: Checkpoint) => (c === '24h' ? 2 : c === '3d' ? 4 : 8)

async function idsFor(
  payload: Payload,
  draft: HqSocialDraft,
  channels: () => Promise<Partial<Record<Platform, string>>>,
): Promise<CreatedPost[]> {
  const saved = (draft.postizPosts ?? []).map((p) => ({ platform: p.platform as Platform, postId: p.postId }))
  if (saved.length || !draft.publishAt) return saved

  const found = await findPostIds(await channels(), (draft.platforms ?? []) as Platform[], new Date(draft.publishAt))
  if (found.length) {
    await payload.update({
      collection: 'hq-social-drafts',
      id: draft.id,
      data: { postizPosts: found },
      overrideAccess: true,
      context: { [HQ_INTERNAL]: true },
    })
  }
  return found
}

/** How far ahead a moved post is looked for: the calendar is planned about a month out. */
const AHEAD_MS = 90 * 24 * HOUR

/**
 * Bring each scheduled draft's `publishAt` and `scheduledFor` up to date with
 * Postiz. A post dragged to another day in the Postiz calendar keeps its id,
 * but HQ would go on measuring it from the old time: its checkpoints would
 * come due before it was live and be skipped, and the brief would list it on
 * the wrong day. A draft's posts go out together, so the earliest one counts.
 * Returns how many drafts moved.
 */
export async function syncPublishTimes(payload: Payload, now: Date = new Date()): Promise<number> {
  const drafts = await payload.find({
    collection: 'hq-social-drafts',
    where: {
      and: [
        { status: { equals: 'scheduled' } },
        { publishAt: { greater_than: new Date(now.getTime() - LOOKBACK_MS).toISOString() } },
      ],
    },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  const withPosts = drafts.docs.filter((d) => d.postizPosts?.length && d.publishAt)
  if (!withPosts.length) return 0

  const times = await listPostTimes(new Date(now.getTime() - LOOKBACK_MS), new Date(now.getTime() + AHEAD_MS))
  let moved = 0
  for (const draft of withPosts) {
    const found = (draft.postizPosts ?? []).map((p) => times.get(p.postId)).filter((t): t is Date => !!t)
    if (!found.length) continue // deleted in Postiz, or outside the window: leave it
    const at = new Date(Math.min(...found.map((t) => t.getTime())))
    if (Math.abs(at.getTime() - new Date(draft.publishAt!).getTime()) < 60_000) continue
    await payload.update({
      collection: 'hq-social-drafts',
      id: draft.id,
      data: { publishAt: at.toISOString(), scheduledFor: at.toISOString() },
      overrideAccess: true,
      context: { [HQ_INTERNAL]: true },
    })
    moved++
  }
  return moved
}

/**
 * Mark a scheduled draft `published` once Postiz reports every one of its
 * posts as PUBLISHED. Only a draft whose time has passed is looked at, and a
 * post Postiz does not list (deleted, or outside the window) leaves the draft
 * as it was. Returns how many drafts changed.
 */
export async function markPublished(payload: Payload, now: Date = new Date()): Promise<number> {
  const drafts = await payload.find({
    collection: 'hq-social-drafts',
    where: {
      and: [
        { status: { equals: 'scheduled' } },
        { publishAt: { greater_than: new Date(now.getTime() - LOOKBACK_MS).toISOString() } },
        { publishAt: { less_than: now.toISOString() } },
      ],
    },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  const due = drafts.docs.filter((d) => d.postizPosts?.length)
  if (!due.length) return 0

  const states = await listPostStates(new Date(now.getTime() - LOOKBACK_MS), now)
  let changed = 0
  for (const draft of due) {
    const mine = (draft.postizPosts ?? []).map((p) => states.get(p.postId))
    if (!mine.every((st) => st === 'PUBLISHED')) continue
    await payload.update({
      collection: 'hq-social-drafts',
      id: draft.id,
      data: { status: 'published' },
      overrideAccess: true,
      context: { [HQ_INTERNAL]: true },
    })
    await recordEvent(payload, {
      type: 'social.published',
      summary: `Draft #${draft.id} is live on ${(draft.platforms ?? []).join(', ')}`,
      refCollection: 'hq-social-drafts',
      refId: draft.id,
    })
    changed++
  }
  return changed
}

/** Take every post checkpoint that has come due. Returns how many were saved. */
export async function collectPostStats(payload: Payload, now: Date = new Date()): Promise<number> {
  try {
    await syncPublishTimes(payload, now)
  } catch (err) {
    console.error('[hq] syncing post times from Postiz failed:', err instanceof Error ? err.message : err)
  }
  try {
    await markPublished(payload, now)
  } catch (err) {
    console.error('[hq] marking published drafts failed:', err instanceof Error ? err.message : err)
  }
  const drafts = await payload.find({
    collection: 'hq-social-drafts',
    where: {
      and: [
        { status: { in: ['scheduled', 'published'] } },
        { publishAt: { greater_than: new Date(now.getTime() - LOOKBACK_MS).toISOString() } },
        { publishAt: { less_than: new Date(now.getTime() - CHECKPOINTS[0].hours * HOUR).toISOString() } },
      ],
    },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })

  // Looked up at most once per run, and only if some draft needs it.
  let channelsOnce: Promise<Partial<Record<Platform, string>>> | undefined
  const channels = () => (channelsOnce ??= connectedChannels())

  let saved = 0
  for (const draft of drafts.docs) {
    try {
      const existing = await payload.find({
        collection: 'hq-social-stats',
        where: { and: [{ kind: { equals: 'post' } }, { draft: { equals: draft.id } }] },
        limit: 50,
        depth: 0,
        overrideAccess: true,
      })
      const posts = await idsFor(payload, draft, channels)
      for (const post of posts) {
        const taken = new Set(
          existing.docs.filter((s) => s.platform === post.platform).map((s) => s.checkpoint ?? ''),
        )
        for (const checkpoint of dueCheckpoints(new Date(draft.publishAt!), now, taken)) {
          const raw = await postAnalytics(post.postId, daysFor(checkpoint))
          if (!raw?.length) continue // not live or not matched yet; next hour
          await payload.create({
            collection: 'hq-social-stats',
            data: {
              kind: 'post',
              platform: post.platform,
              checkpoint,
              draft: draft.id,
              postizPostId: post.postId,
              metrics: summarizeMetrics(raw),
              raw: raw as never,
            },
            overrideAccess: true,
          })
          saved++
        }
      }
    } catch (err) {
      console.error(`[hq] stats for draft #${draft.id} failed:`, err instanceof Error ? err.message : err)
    }
  }
  return saved
}

/**
 * Snapshot each account's last seven days, once a day. Taken in the 6 AM Miami
 * hour so the 7:30 brief reads fresh numbers — or at the first run after that
 * if the server was down, so a missed morning is not a missed day.
 */
export async function collectChannelStats(payload: Payload, now: Date = new Date()): Promise<number> {
  const recent = await payload.count({
    collection: 'hq-social-stats',
    where: {
      and: [
        { kind: { equals: 'channel' } },
        { createdAt: { greater_than: new Date(now.getTime() - 20 * HOUR).toISOString() } },
      ],
    },
    overrideAccess: true,
  })
  if (recent.totalDocs) return 0
  const stale = await payload.count({
    collection: 'hq-social-stats',
    where: {
      and: [
        { kind: { equals: 'channel' } },
        { createdAt: { greater_than: new Date(now.getTime() - 26 * HOUR).toISOString() } },
      ],
    },
    overrideAccess: true,
  })
  if (stale.totalDocs && miamiHour(now) !== 6) return 0

  let saved = 0
  for (const [platform, id] of Object.entries(await connectedChannels()) as [Platform, string][]) {
    try {
      const raw = await channelAnalytics(id, 7)
      if (!raw?.length) continue
      await payload.create({
        collection: 'hq-social-stats',
        data: { kind: 'channel', platform, metrics: summarizeMetrics(raw), raw: raw as never },
        overrideAccess: true,
      })
      saved++
    } catch (err) {
      console.error(`[hq] channel stats for ${platform} failed:`, err instanceof Error ? err.message : err)
    }
  }
  return saved
}

export async function collectSocialStats(payload: Payload, now: Date = new Date()) {
  if (!postizConfigured()) return { posts: 0, channels: 0 }
  const posts = await collectPostStats(payload, now)
  const channels = await collectChannelStats(payload, now)
  return { posts, channels }
}
