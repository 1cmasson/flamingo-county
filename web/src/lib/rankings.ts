import type { Payload } from 'payload'

import type { Ranking } from '../payload-types'
import { PUBLISHED } from '../fields/shared'
import { notifyOwner } from './telegram'
import { isBot, isSourceSlug } from './tracking'
import { classifySource, isStaff, normalizeHost } from './visits'

/**
 * "Hialeah decide": the neighbors pick the best croquetas (or Colombian
 * food, or…) of a city. Three phases, worked out from the dates on the
 * ranking itself — no job moves it along:
 *
 *   nominating  people name places in the comments of our post; we seed the
 *               most-named 8 (or 4) into the ranking's `entrants`, best first
 *   voting      a bracket, one round at a time (8 → 4 → 2 → 1), on the site
 *   results     the winner and the order, with every round's real vote count
 *
 * A vote is stored like a site use (lib/uses.ts): no IP, cookie, user agent
 * or visitor id. What keeps it fair is the page saying how many votes there
 * were, a per-address cap held in memory (an IP is never written down), one
 * vote per matchup per day remembered in the browser, and a Telegram note
 * when one place gets a burst. Staff and owner devices vote as `test`, which
 * no count includes.
 *
 * Partners never get a better seed or a vote: being a partner adds a coupon
 * to their entry, nothing else.
 */

export type Stage = 'qf' | 'sf' | 'final'
export type Phase = 'nominating' | 'voting' | 'between' | 'results'

export type Entrant = NonNullable<Ranking['entrants']>[number]
type Round = NonNullable<Ranking['rounds']>[number]

/** The rounds a bracket of this size plays, first to last. */
export function stagesFor(size: number): Stage[] {
  if (size >= 8) return ['qf', 'sf', 'final']
  if (size >= 4) return ['sf', 'final']
  return size >= 2 ? ['final'] : []
}

/** Only 2, 4 or 8 places make a bracket; any extra past the last full size sit out. */
export function bracketSize(entrants: number): number {
  return entrants >= 8 ? 8 : entrants >= 4 ? 4 : entrants >= 2 ? 2 : 0
}

/**
 * Seeds in bracket order, so the top two can only meet in the final:
 * 8 → 1 8 4 5 2 7 3 6, read in pairs (1 v 8, 4 v 5, 2 v 7, 3 v 6).
 */
export function seedOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const n = order.length * 2
    order = order.flatMap((s) => [s, n + 1 - s])
  }
  return order
}

const time = (v: string | null | undefined) => (v ? new Date(v).getTime() : NaN)

export function roundFor(ranking: Pick<Ranking, 'rounds'>, stage: Stage): Round | null {
  return ranking.rounds?.find((r) => r.stage === stage) ?? null
}

export const roundOpen = (r: Round | null, now: number) => Boolean(r && time(r.opensAt) <= now && now < time(r.closesAt))
export const roundClosed = (r: Round | null, now: number) => Boolean(r && time(r.closesAt) <= now)

/** Where a ranking is today, from its rounds' dates. */
export function phaseOf(ranking: Pick<Ranking, 'rounds' | 'entrants'>, now: number = Date.now()): Phase {
  const stages = stagesFor(bracketSize(ranking.entrants?.length ?? 0))
  if (!stages.length) return 'nominating'
  const rounds = stages.map((s) => roundFor(ranking, s))
  if (rounds.some((r) => !r)) return 'nominating'
  if (now < time(rounds[0]!.opensAt)) return 'nominating'
  if (roundClosed(rounds[rounds.length - 1]!, now)) return 'results'
  return rounds.some((r) => roundOpen(r, now)) ? 'voting' : 'between'
}

/** Votes per entrant key, for one round's matchup. */
export type Tally = Record<string, number>
/** All the votes of a ranking: stage → matchup index → tally. */
export type Tallies = Partial<Record<Stage, Tally[]>>

export type Matchup = {
  stage: Stage
  index: number
  /** Null while the round before hasn't finished. */
  a: Entrant | null
  b: Entrant | null
  votes: [number, number]
  open: boolean
  closed: boolean
  /** Decided once the round closes: more votes wins, a tie goes to the better seed. */
  winner: Entrant | null
}

/** Every matchup of every round, as far as the dates and the votes have decided them. */
export function bracket(ranking: Pick<Ranking, 'rounds' | 'entrants'>, tallies: Tallies, now: number = Date.now()): Matchup[][] {
  const size = bracketSize(ranking.entrants?.length ?? 0)
  const field = (ranking.entrants ?? []).slice(0, size)
  const stages = stagesFor(size)
  const out: Matchup[][] = []
  let slots: (Entrant | null)[] = seedOrder(size).map((seed) => field[seed - 1] ?? null)
  for (const stage of stages) {
    const round = roundFor(ranking, stage)
    const open = roundOpen(round, now)
    const closed = roundClosed(round, now)
    const games: Matchup[] = []
    for (let i = 0; i < slots.length; i += 2) {
      const a = slots[i]
      const b = slots[i + 1]
      const t = tallies[stage]?.[i / 2] ?? {}
      const votes: [number, number] = [a ? (t[a.key] ?? 0) : 0, b ? (t[b.key] ?? 0) : 0]
      // Earlier in the list = the better seed, so it wins a tie.
      const winner = closed && a && b ? (votes[1] > votes[0] ? b : a) : null
      games.push({ stage, index: i / 2, a, b, votes, open, closed, winner })
    }
    out.push(games)
    slots = games.map((g) => g.winner)
  }
  return out
}

/** The champion, then the other finalist, then the semifinal losers, then the rest — each group in seed order. */
export function finalOrder(ranking: Pick<Ranking, 'entrants'>, rounds: Matchup[][]): Entrant[] {
  const champion = rounds.at(-1)?.[0]?.winner
  if (!champion) return []
  const seed = (e: Entrant) => (ranking.entrants ?? []).findIndex((x) => x.key === e.key)
  const seen = new Set<string>([champion.key])
  const order: Entrant[] = [champion]
  for (let r = rounds.length - 1; r >= 0; r--) {
    const out = rounds[r].flatMap((g) => [g.a, g.b]).filter((e): e is Entrant => Boolean(e && !seen.has(e.key)))
    for (const e of out.sort((x, y) => seed(x) - seed(y))) {
      seen.add(e.key)
      order.push(e)
    }
  }
  return order
}

/* ------------------------------------------------------------------ reading */

export async function getPublishedRanking(payload: Payload, slug: string, lang?: 'es' | 'en'): Promise<Ranking | null> {
  const { docs } = await payload.find({
    collection: 'rankings',
    where: { and: [PUBLISHED, { slug: { equals: slug } }] },
    locale: lang,
    // A field left blank in one language shows the other's, never nothing.
    fallbackLocale: lang === 'en' ? 'es' : 'en',
    limit: 1,
    depth: 2,
    overrideAccess: true,
  })
  return docs[0] ?? null
}

/** Every vote that counts (staff tests left out), as stage → matchup → entrant → votes. */
export async function talliesFor(payload: Payload, rankingId: number): Promise<Tallies> {
  const { docs } = await payload.find({
    collection: 'ranking-votes',
    where: { and: [{ ranking: { equals: rankingId } }, { test: { not_equals: true } }] },
    select: { stage: true, matchup: true, entrant: true },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const out: Tallies = {}
  for (const v of docs) {
    const stage = v.stage as Stage
    const games = (out[stage] ??= [])
    const t = (games[v.matchup] ??= {})
    t[v.entrant] = (t[v.entrant] ?? 0) + 1
  }
  return out
}

/* ------------------------------------------------------------------- voting */

const PER_MINUTE = 600
// Per address, per matchup, per Miami day. Phones on one carrier often share an
// address (and a household shares its Wi-Fi), so this is a ceiling, not "one".
const PER_ADDRESS_PER_MATCHUP = 8
const BURST_WINDOW_MS = 10 * 60_000
const BURST_VOTES = 60

let minuteStart = 0
let inMinute = 0
const byAddress = new Map<string, number>()
let addressDay = ''
const bursts = new Map<string, { start: number; n: number; told: boolean }>()

export function resetVoteLimits() {
  minuteStart = 0
  inMinute = 0
  byAddress.clear()
  addressDay = ''
  bursts.clear()
}

const miamiDay = (now: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(now),
  )

function underVoteLimit(headers: Headers, matchup: string, now: number): boolean {
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
  const addr = (headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0] ?? '').trim()
  if (!addr) return true
  const key = `${addr} ${matchup}`
  if (byAddress.size > 50_000) byAddress.clear()
  const n = (byAddress.get(key) ?? 0) + 1
  byAddress.set(key, n)
  return n <= PER_ADDRESS_PER_MATCHUP
}

/** A burst of votes for one place is either a business rallying its customers or someone stuffing: the owner looks. */
function noteBurst(ranking: Ranking, entrant: Entrant, now: number) {
  const key = `${ranking.id} ${entrant.key}`
  const b = bursts.get(key)
  if (!b || now - b.start >= BURST_WINDOW_MS) {
    bursts.set(key, { start: now, n: 1, told: false })
    return
  }
  if (++b.n < BURST_VOTES || b.told) return
  b.told = true
  void notifyOwner(
    `⚠️ ${BURST_VOTES} votes for ${entrant.name} in under 10 minutes (${ranking.slug}). A business sharing its link, or someone stuffing: look before the round closes.`,
  )
}

export type VoteInput = { slug?: unknown; matchup?: unknown; pick?: unknown; lang?: unknown; ref?: unknown; utm?: unknown }
export type VoteResult =
  | { ok: true; stage: Stage; matchup: number; votes: [number, number] }
  | { ok: false; reason: 'not-found' | 'closed' | 'invalid' | 'refused' | 'busy' }

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** One vote in an open round. Answers with the matchup's new count, which the page shows. */
export async function castVote(payload: Payload, input: VoteInput, headers: Headers, now: number = Date.now()): Promise<VoteResult> {
  const slug = typeof input.slug === 'string' && SLUG.test(input.slug) ? input.slug : null
  if (!slug) return { ok: false, reason: 'not-found' }
  if (isBot(headers.get('user-agent'))) return { ok: false, reason: 'refused' }
  const site = headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return { ok: false, reason: 'refused' }

  const ranking = await getPublishedRanking(payload, slug)
  if (!ranking) return { ok: false, reason: 'not-found' }
  const index = typeof input.matchup === 'number' && Number.isInteger(input.matchup) ? input.matchup : -1
  const pick = typeof input.pick === 'string' ? input.pick : ''

  const tallies = await talliesFor(payload, ranking.id)
  // Only one round is ever open, so the index names the game.
  const game = bracket(ranking, tallies, now)
    .flat()
    .find((g) => g.open && g.index === index)
  if (!game || !game.a || !game.b) return { ok: false, reason: 'closed' }
  const chosen = game.a.key === pick ? game.a : game.b.key === pick ? game.b : null
  if (!chosen) return { ok: false, reason: 'invalid' }

  if (!underVoteLimit(headers, `${ranking.id}:${game.stage}:${index}`, now)) return { ok: false, reason: 'busy' }

  const utm = typeof input.utm === 'string' && isSourceSlug(input.utm.toLowerCase()) ? input.utm.toLowerCase() : null
  const ref = normalizeHost(input.ref)
  const own = normalizeHost(headers.get('x-forwarded-host') ?? headers.get('host'))
  const test = isStaff(headers)
  await payload.create({
    collection: 'ranking-votes',
    data: {
      ranking: ranking.id,
      stage: game.stage,
      matchup: index,
      entrant: chosen.key,
      source: classifySource(ref && ref !== own ? ref : null, utm),
      lang: input.lang === 'en' ? 'en' : 'es',
      test,
    },
    overrideAccess: true,
  })
  if (!test) noteBurst(ranking, chosen, now)

  const votes: [number, number] = [game.votes[0], game.votes[1]]
  if (!test) votes[chosen === game.a ? 0 : 1]++
  return { ok: true, stage: game.stage, matchup: index, votes }
}
