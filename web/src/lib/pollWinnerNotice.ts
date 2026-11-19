import type { Payload } from 'payload'

import { PUBLISHED } from '../fields/shared'
import type { StoryPoll } from '../payload-types'
import { SITE_TZ } from './dates'
import { pollTally, pollWinner, siteVotesFor } from './storyPolls'
import { esc, sendMessage, telegramConfigured } from './telegram'
import { resultAudienceCount, resultKeyboard, voteBroadcastEnabled } from './voteWhatsapp'
import { restConfigured } from './whatsapp'

/**
 * When a weekly story vote closes, tell the owner who won (owner, Nov 17:
 * "automate the process… even deciding who the final voter is").
 *
 * The site already decides the winner (lib/storyPolls.ts `pollWinner`: most
 * votes, site plus counted comments; a tie goes to the option listed first).
 * This only announces it: one Telegram message with the split, and an open
 * `hq-tasks` row for Claude to build the winning story for its Wednesday.
 * Nothing is drafted or posted.
 *
 * Once per poll: the hourly `pollWinner` job claims an `hq-events` row of type
 * `poll.closed` with the poll id as `refId` *before* sending, so a later hour,
 * a retry or a restart finds it and stops. A send that fails removes the row,
 * so the next hour tries again. Polls that closed more than `LOOKBACK_MS` ago
 * are left alone, so a first deploy doesn't announce old votes.
 *
 * Off with `HQ_POLL_WINNER=off`.
 */

export const POLL_CLOSED_EVENT = 'poll.closed'
export const POLL_TASK_PREFIX = 'Build the fan-vote winner: '
const LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000

export function pollWinnerEnabled(): boolean {
  return !/^(off|false|0|no)$/i.test((process.env.HQ_POLL_WINNER ?? '').trim())
}

const day = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat('en-US', { timeZone: SITE_TZ, weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(iso))
    : null

type Poll = Pick<StoryPoll, 'id' | 'slug' | 'title' | 'options' | 'winnerPostsOn'>

/** The message: winner first, then every option's count in ballot order. */
export function winnerText(poll: Poll, counts: Record<string, number>, total: number): string {
  const tally = { counts, total }
  const win = pollWinner(poll, tally)
  const pct = (n: number) => (total ? Math.round((100 * n) / total) : 0)
  const lines = [`🗳️ <b>Vote closed: ${esc(poll.title)}</b>`]
  if (!win) {
    lines.push('No votes, so no winner. Pick the story yourself.')
  } else {
    const n = counts[win.key] ?? 0
    lines.push(`🏆 <b>${esc(win.title)}</b>: ${n} of ${total} vote${total === 1 ? '' : 's'} (${pct(n)}%)`)
    const posts = day(poll.winnerPostsOn)
    if (posts) lines.push(`Posts ${posts}.`)
  }
  lines.push('')
  for (const o of poll.options ?? []) lines.push(`• ${esc(o.title)}: ${counts[o.key] ?? 0} (${pct(counts[o.key] ?? 0)}%)`)
  lines.push('', `https://flamingocounty.com/en/vota/${encodeURIComponent(poll.slug)}`)
  return lines.join('\n')
}

/** Announces every poll that closed since the last run. Returns how many were announced. */
export async function announcePollWinners(payload: Payload, now: Date = new Date()): Promise<number> {
  if (!pollWinnerEnabled() || !telegramConfigured()) return 0
  const at = now.getTime()
  const { docs } = await payload.find({
    collection: 'story-polls',
    where: {
      and: [
        PUBLISHED,
        { closesAt: { less_than_equal: new Date(at).toISOString() } },
        { closesAt: { greater_than: new Date(at - LOOKBACK_MS).toISOString() } },
      ],
    },
    locale: 'en',
    fallbackLocale: 'es',
    depth: 0,
    limit: 20,
    overrideAccess: true,
  })

  let sent = 0
  for (const poll of docs) {
    const ref = String(poll.id)
    const seen = await payload.count({
      collection: 'hq-events',
      where: { and: [{ type: { equals: POLL_CLOSED_EVENT } }, { refId: { equals: ref } }] },
      overrideAccess: true,
    })
    if (seen.totalDocs) continue

    const { counts, total } = pollTally(poll, await siteVotesFor(payload, poll.id))
    const win = pollWinner(poll, { counts, total })
    const claim = await payload.create({
      collection: 'hq-events',
      data: {
        type: POLL_CLOSED_EVENT,
        summary: `Vote closed: ${poll.title}${win ? `, winner ${win.title}` : ', no votes'}`,
        refCollection: 'story-polls',
        refId: ref,
        status: 'seen',
        data: { counts, total, winner: win?.key ?? null },
      },
      overrideAccess: true,
    })
    try {
      // The WhatsApp subscribers tied to this vote get the winner only on his tap.
      const n = win && voteBroadcastEnabled() && restConfigured() ? await resultAudienceCount(payload, poll.id) : 0
      await sendMessage(winnerText(poll, counts, total), n ? { keyboard: resultKeyboard(poll.id, n) } : undefined)
    } catch (err) {
      await payload.delete({ collection: 'hq-events', id: claim.id, overrideAccess: true }).catch(() => undefined)
      throw err
    }
    if (win) {
      const posts = day(poll.winnerPostsOn)
      await payload.create({
        collection: 'hq-tasks',
        data: {
          title: `${POLL_TASK_PREFIX}${win.title}${posts ? ` (${posts})` : ''}`,
          detail: `Fan vote "${poll.title}" (${poll.slug}) closed: ${win.title} won with ${counts[win.key] ?? 0} of ${total} votes. Build it as that Wednesday's Primo Flacko episode, show the cut in chat, then draft EN 4 PM / ES 5 PM. Open the next poll so the reel's "comment VOTE" ending has somewhere to go.`,
          assignee: 'claude',
          status: 'open',
        },
        overrideAccess: true,
      })
    }
    sent++
  }
  return sent
}
