import type { Payload, Where } from 'payload'

import type { StoryPoll } from '../payload-types'
import { PUBLISHED } from '../fields/shared'
import { isBot, isSourceSlug } from './tracking'
import { classifySource, isStaff, normalizeHost } from './visits'

/**
 * The weekly story vote: four Miami stories, fans pick one on the site (most
 * arrive from the reel's comment-to-DM link), and the winner is next
 * Wednesday's reel. The poll's own dates move it along — no job:
 *
 *   upcoming  before opensAt: the options, no buttons
 *   open      one tap votes; after it, the live split
 *   closed    from closesAt: the winner and the final split
 *
 * The split is the site's votes (staff tests left out) plus each option's
 * `commentVotes`, counted by hand from the Instagram comments. The most votes
 * wins; a tie goes to the option listed first.
 *
 * One vote per browser per poll, and no changing it. Changing a pick would
 * mean knowing which stored vote was yours, and, like the rankings
 * (lib/rankings.ts), a vote is stored with no IP, cookie, user agent or
 * visitor id. So:
 *   - after a vote the browser keeps a cookie `fc.poll.<id>` holding only the
 *     key picked; with it the API refuses a second vote and the page opens
 *     on the split. It lives on the visitor's phone and is never stored here.
 *   - a per-address cap per poll per Miami day, held in memory (an IP is
 *     never written down), is the backstop for a cleared cookie. Phones on
 *     one carrier often share an address, so it is a ceiling, not "one".
 *     It resets on a deploy.
 *   - staff and owner devices vote as `test`, which no count includes.
 */

export type PollPhase = 'upcoming' | 'open' | 'closed'
export type PollOption = NonNullable<StoryPoll['options']>[number]
/** Votes per option key. */
export type PollCounts = Record<string, number>
export type PollTally = { counts: PollCounts; total: number }

const time = (v: string | null | undefined) => (v ? new Date(v).getTime() : NaN)

/** Where a poll is right now, from its dates. A poll missing a date never opens. */
export function pollPhase(poll: Pick<StoryPoll, 'opensAt' | 'closesAt'>, now: number = Date.now()): PollPhase {
  const opens = time(poll.opensAt)
  const closes = time(poll.closesAt)
  if (!(now >= opens)) return 'upcoming'
  return now < closes ? 'open' : 'closed'
}

/**
 * The split shown on the page: each option's site votes plus its counted
 * comments, in option order. Votes for a key no longer in the poll don't count.
 */
export function pollTally(poll: Pick<StoryPoll, 'options'>, siteVotes: PollCounts): PollTally {
  const counts: PollCounts = {}
  let total = 0
  for (const o of poll.options ?? []) {
    const n = (siteVotes[o.key] ?? 0) + Math.max(0, Math.floor(o.commentVotes ?? 0))
    counts[o.key] = n
    total += n
  }
  return { counts, total }
}

/** The most votes; a tie goes to the option listed first. Nobody wins a poll without votes. */
export function pollWinner(poll: Pick<StoryPoll, 'options'>, tally: PollTally): PollOption | null {
  let best: PollOption | null = null
  for (const o of poll.options ?? []) {
    if ((tally.counts[o.key] ?? 0) > (best ? (tally.counts[best.key] ?? 0) : 0)) best = o
  }
  return best
}

/* ------------------------------------------------------------------ reading */

/**
 * The live poll. With `draft`, the latest saved version instead, published or
 * not: only for a signed-in admin's preview (?preview=1), never the public.
 */
export async function getPublishedPoll(
  payload: Payload,
  slug: string,
  lang?: 'es' | 'en',
  { draft = false }: { draft?: boolean } = {},
): Promise<StoryPoll | null> {
  const { docs } = await payload.find({
    collection: 'story-polls',
    where: draft ? { slug: { equals: slug } } : { and: [PUBLISHED, { slug: { equals: slug } }] },
    draft,
    locale: lang,
    // A field left blank in one language shows the other's, never nothing.
    fallbackLocale: lang === 'en' ? 'es' : 'en',
    limit: 1,
    depth: 2,
    overrideAccess: true,
  })
  return docs[0] ?? null
}

/**
 * The poll /es/vota sends to, so the link in the DM never changes: the one
 * open now (the latest to open, if two overlap), else the one that closed
 * last (it shows the winner), else the next to open. Published polls only.
 */
export async function currentPollSlug(payload: Payload, now: number = Date.now()): Promise<string | null> {
  const at = new Date(now).toISOString()
  const find = async (where: Where, sort: string) => {
    const { docs } = await payload.find({
      collection: 'story-polls',
      where: { and: [PUBLISHED, where] },
      sort,
      limit: 1,
      depth: 0,
      select: { slug: true },
      overrideAccess: true,
    })
    return docs[0]?.slug ?? null
  }
  return (
    (await find({ and: [{ opensAt: { less_than_equal: at } }, { closesAt: { greater_than: at } }] }, '-opensAt')) ??
    (await find({ closesAt: { less_than_equal: at } }, '-closesAt')) ??
    (await find({ opensAt: { greater_than: at } }, 'opensAt'))
  )
}

/** Site votes that count (staff tests left out), per option key. */
export async function siteVotesFor(payload: Payload, pollId: number): Promise<PollCounts> {
  const { docs } = await payload.find({
    collection: 'story-poll-votes',
    where: { and: [{ poll: { equals: pollId } }, { test: { not_equals: true } }] },
    select: { option: true },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const out: PollCounts = {}
  for (const v of docs) out[v.option] = (out[v.option] ?? 0) + 1
  return out
}

/* ------------------------------------------------------------------- voting */

/** The cookie a browser keeps after voting: the poll's id in the name, the key picked as the value. */
export const votedCookie = (pollId: number) => `fc.poll.${pollId}`

/** The key this browser already voted for in the poll, from its cookie header; null if none (or not one of the options). */
export function votedFor(poll: Pick<StoryPoll, 'id' | 'options'>, cookieHeader: string | null | undefined): string | null {
  const name = votedCookie(poll.id)
  for (const part of (cookieHeader ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k !== name) continue
    const key = decodeURIComponent(v.join('='))
    return (poll.options ?? []).some((o) => o.key === key) ? key : null
  }
  return null
}

const PER_MINUTE = 600
// Per address, per poll, per Miami day. The cookie is what keeps it to one
// vote per browser; this is only the backstop for a cleared cookie. Higher
// than the rankings' 8 because the reel's DM sends everyone at once, and
// phones on one carrier often share an address (as does a household's Wi-Fi).
const PER_ADDRESS_PER_DAY = 30

let minuteStart = 0
let inMinute = 0
const byAddress = new Map<string, number>()
let addressDay = ''

export function resetPollVoteLimits() {
  minuteStart = 0
  inMinute = 0
  byAddress.clear()
  addressDay = ''
}

export const miamiDay = (now: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(now),
  )

/** The visitor's address, as the proxy in front of us reports it; empty when unknown. Never stored. */
export const clientAddress = (headers: Headers) =>
  (headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0] ?? '').trim()

function underVoteLimit(headers: Headers, pollId: number, now: number): boolean {
  if (now - minuteStart >= 60_000) {
    minuteStart = now
    inMinute = 0
  }
  if (++inMinute > PER_MINUTE) return false
  const day = miamiDay(now)
  if (day !== addressDay) {
    byAddress.clear()
    addressDay = day
  }
  const addr = clientAddress(headers)
  if (!addr) return true
  const key = `${addr} ${pollId}`
  if (byAddress.size > 50_000) byAddress.clear()
  const n = (byAddress.get(key) ?? 0) + 1
  byAddress.set(key, n)
  return n <= PER_ADDRESS_PER_DAY
}

export type PollVoteInput = { slug?: unknown; pick?: unknown; lang?: unknown; ref?: unknown; utm?: unknown }
export type PollVoteResult =
  | ({ ok: true; pollId: number; pick: string; closesAt: string } & PollTally)
  /** This browser already voted in the poll: its pick and the split, which the page shows. */
  | ({ ok: false; reason: 'already'; pick: string } & PollTally)
  | { ok: false; reason: 'not-found' | 'closed' | 'invalid' | 'refused' | 'busy' }

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * One vote in an open poll. Answers with the new split (the voter's own vote
 * in it, a staff test's too), which the page shows. `preview` (an admin
 * checked by the route) votes on the saved draft, always as a test, and is
 * never refused for having voted before.
 */
export async function castPollVote(
  payload: Payload,
  input: PollVoteInput,
  headers: Headers,
  now: number = Date.now(),
  { preview = false }: { preview?: boolean } = {},
): Promise<PollVoteResult> {
  const slug = typeof input.slug === 'string' && SLUG.test(input.slug) ? input.slug : null
  if (!slug) return { ok: false, reason: 'not-found' }
  if (isBot(headers.get('user-agent'))) return { ok: false, reason: 'refused' }
  const site = headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return { ok: false, reason: 'refused' }

  const poll = await getPublishedPoll(payload, slug, undefined, { draft: preview })
  if (!poll) return { ok: false, reason: 'not-found' }
  if (pollPhase(poll, now) !== 'open') return { ok: false, reason: 'closed' }
  const chosen = (poll.options ?? []).find((o) => o.key === input.pick)
  if (!chosen) return { ok: false, reason: 'invalid' }

  const earlier = preview ? null : votedFor(poll, headers.get('cookie'))
  if (earlier) return { ok: false, reason: 'already', pick: earlier, ...pollTally(poll, await siteVotesFor(payload, poll.id)) }

  if (!underVoteLimit(headers, poll.id, now)) return { ok: false, reason: 'busy' }

  const utm = typeof input.utm === 'string' && isSourceSlug(input.utm.toLowerCase()) ? input.utm.toLowerCase() : null
  const ref = normalizeHost(input.ref)
  const own = normalizeHost(headers.get('x-forwarded-host') ?? headers.get('host'))
  const test = preview || isStaff(headers)
  await payload.create({
    collection: 'story-poll-votes',
    data: {
      poll: poll.id,
      option: chosen.key,
      source: classifySource(ref && ref !== own ? ref : null, utm),
      lang: input.lang === 'en' ? 'en' : 'es',
      test,
    },
    overrideAccess: true,
  })

  const counted = await siteVotesFor(payload, poll.id)
  // The voter sees their own vote in the split, a staff test too; only the stored counts leave tests out.
  if (test) counted[chosen.key] = (counted[chosen.key] ?? 0) + 1
  return { ok: true, pollId: poll.id, pick: chosen.key, closesAt: poll.closesAt, ...pollTally(poll, counted) }
}
