import type { Payload } from 'payload'

import type { Event, HqSocialDraft } from '../payload-types'
import { eventEndDay, todayISO } from './dates'

/**
 * The owner's rule (2026-10-19): nothing outdated goes out. An event post is
 * stale when its event is over, cancelled or postponed, or, for a post that
 * names no single event (the week's carousel), when it is approved long after
 * the time it was made for: "this week" read on Thursday is wrong.
 */

/** How late a carousel can still be approved. A time a few minutes back is how a draft says "post it when I tap". */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000

const EVENT_PAGE = /\/(?:es|en)\/events\/([\w-]+)/i

/** The single event a draft is about: its source, or the one event page its caption links to. */
export async function eventForDraft(
  payload: Payload,
  draft: Pick<HqSocialDraft, 'sourceCollection' | 'sourceId' | 'caption' | 'dedupeKey'>,
): Promise<Event | null> {
  const fromKey = /^event-story:(\d+)$/.exec(draft.dedupeKey ?? '')?.[1]
  const id = draft.sourceCollection === 'events' && draft.sourceId ? draft.sourceId : fromKey
  if (id) {
    return (await payload
      .findByID({ collection: 'events', id: Number(id), depth: 0, overrideAccess: true })
      .catch(() => null)) as Event | null
  }
  const pages = new Set([...(draft.caption ?? '').matchAll(new RegExp(EVENT_PAGE, 'gi'))].map((m) => m[1]))
  if (pages.size !== 1) return null
  const { docs } = await payload.find({
    collection: 'events',
    where: { slug: { equals: [...pages][0] } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return (docs[0] as Event | undefined) ?? null
}

/** Why the event is no longer worth announcing, or null while it is. */
export function eventGone(ev: Pick<Event, 'date' | 'endDate' | 'startTime' | 'endTime' | 'eventStatus' | '_status'>, now: Date): string | null {
  if (ev._status === 'draft') return 'its event is no longer on the site'
  if (ev.eventStatus === 'cancelled') return 'its event was cancelled'
  if (ev.eventStatus === 'postponed') return 'its event was postponed'
  if (eventEndDay(ev) < todayISO(now)) return 'its event is over'
  return null
}

/** Why an event draft is outdated, or null. Other pillars are never outdated by this rule. */
export async function outdatedProblem(payload: Payload, draft: HqSocialDraft, now: Date = new Date()): Promise<string | null> {
  if (draft.pillar !== 'event') return null
  const ev = await eventForDraft(payload, draft)
  if (ev) return eventGone(ev, now)
  if (new Date(draft.scheduledFor).getTime() < now.getTime() - STALE_AFTER_MS) return 'it was made for an earlier time and is out of date'
  return null
}

/**
 * The event's stories still waiting to go out: pending, or scheduled in
 * Postiz. Found by the key HQ gives them, or by the event page in the caption
 * (stories drafted before the key existed).
 */
export async function waitingStories(payload: Payload, ev: Pick<Event, 'id' | 'slug'>): Promise<HqSocialDraft[]> {
  const { docs } = await payload.find({
    collection: 'hq-social-drafts',
    where: {
      and: [
        { status: { in: ['pending', 'scheduled'] } },
        { or: [{ dedupeKey: { equals: `event-story:${ev.id}` } }, { caption: { contains: `/events/${ev.slug}` } }] },
      ],
    },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  // `contains` would also match a longer slug that starts with this one.
  return (docs as HqSocialDraft[]).filter(
    (d) => d.dedupeKey === `event-story:${ev.id}` || [...(d.caption ?? '').matchAll(new RegExp(EVENT_PAGE, 'gi'))].some((m) => m[1] === ev.slug),
  )
}
