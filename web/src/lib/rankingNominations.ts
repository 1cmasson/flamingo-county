import type { Payload } from 'payload'

import type { Ranking } from '../payload-types'
import { getPublishedRanking, phaseOf } from './rankings'
import { isBot, isSourceSlug } from './tracking'
import { classifySource, isStaff, normalizeHost } from './visits'

/**
 * Nominations for a neighbors' ranking (lib/rankings.ts), taken on the
 * ranking's own page while it is nominating: a neighbor types a place and,
 * if they like, its street. Stored like a vote: no IP, cookie, user agent or
 * visitor id; a small per-address cap is held in memory. The names are
 * unchecked text, so the page only ever shows how many there are; the
 * most-named (see `nominationTally`) become the ranking's entrants.
 */

const PER_MINUTE = 300
// Per address, per ranking, per Miami day: room for a family on one Wi-Fi to
// name their places, not for one person to fill the list.
const PER_ADDRESS_PER_DAY = 3
const MAX = 80

let minuteStart = 0
let inMinute = 0
const byAddress = new Map<string, number>()
let addressDay = ''

export function resetNominationLimits() {
  minuteStart = 0
  inMinute = 0
  byAddress.clear()
  addressDay = ''
}

const miamiDay = (now: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(now),
  )

function underLimit(headers: Headers, rankingId: number, now: number): boolean {
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
  const key = `${addr} ${rankingId}`
  if (byAddress.size > 50_000) byAddress.clear()
  const n = (byAddress.get(key) ?? 0) + 1
  byAddress.set(key, n)
  return n <= PER_ADDRESS_PER_DAY
}

/** Open while the ranking is nominating, has no places yet, and its closing day (if set) hasn't passed in Miami. */
export function nominationsOpen(ranking: Pick<Ranking, 'rounds' | 'entrants' | 'nominationsCloseOn'>, now: number = Date.now()): boolean {
  if (ranking.entrants?.length) return false
  if (phaseOf(ranking, now) !== 'nominating') return false
  // A day-only date is stored at noon or midnight UTC: its UTC date is the day.
  return !ranking.nominationsCloseOn || miamiDay(now) <= ranking.nominationsCloseOn.slice(0, 10)
}

const LINK = /https?:|www\.|\.(?:com|net|org|co|io|us|biz|info|me)\b|@/i
const PHONE = /(?:\d[\s().-]*){7,}/

/** The text as it should be stored, or null when it isn't just a place's name (a link, a phone number, too short or long). */
export function cleanPlaceText(v: unknown, { required }: { required: boolean }): string | null | false {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
  if (!s) return required ? false : null
  if (s.length < 2 || s.length > MAX || LINK.test(s) || PHONE.test(s)) return false
  return s
}

export type NominationInput = { slug?: unknown; name?: unknown; area?: unknown; lang?: unknown; ref?: unknown; utm?: unknown }
export type NominationResult =
  | { ok: true; count: number }
  | { ok: false; reason: 'not-found' | 'closed' | 'invalid' | 'refused' | 'busy' }

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * One nomination. Answers with how many there are now (the neighbor's own
 * included, a staff test too). `preview` (an admin checked by the route)
 * nominates on the saved draft, always as a test.
 */
export async function nominate(
  payload: Payload,
  input: NominationInput,
  headers: Headers,
  now: number = Date.now(),
  { preview = false }: { preview?: boolean } = {},
): Promise<NominationResult> {
  const slug = typeof input.slug === 'string' && SLUG.test(input.slug) ? input.slug : null
  if (!slug) return { ok: false, reason: 'not-found' }
  if (isBot(headers.get('user-agent'))) return { ok: false, reason: 'refused' }
  const site = headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return { ok: false, reason: 'refused' }

  const ranking = await getPublishedRanking(payload, slug, undefined, { draft: preview })
  if (!ranking) return { ok: false, reason: 'not-found' }
  if (!nominationsOpen(ranking, now)) return { ok: false, reason: 'closed' }

  const name = cleanPlaceText(input.name, { required: true })
  const area = cleanPlaceText(input.area, { required: false })
  if (!name || area === false) return { ok: false, reason: 'invalid' }

  if (!underLimit(headers, ranking.id, now)) return { ok: false, reason: 'busy' }

  const utm = typeof input.utm === 'string' && isSourceSlug(input.utm.toLowerCase()) ? input.utm.toLowerCase() : null
  const ref = normalizeHost(input.ref)
  const own = normalizeHost(headers.get('x-forwarded-host') ?? headers.get('host'))
  const test = preview || isStaff(headers)
  await payload.create({
    collection: 'ranking-nominations',
    data: {
      ranking: ranking.id,
      name,
      area,
      source: classifySource(ref && ref !== own ? ref : null, utm),
      lang: input.lang === 'en' ? 'en' : 'es',
      test,
    },
    overrideAccess: true,
  })
  return { ok: true, count: (await nominationCount(payload, ranking.id)) + (test ? 1 : 0) }
}

/** Nominations that count (staff tests left out). The page shows this number, never the names. */
export async function nominationCount(payload: Payload, rankingId: number): Promise<number> {
  const { totalDocs } = await payload.count({
    collection: 'ranking-nominations',
    where: { and: [{ ranking: { equals: rankingId } }, { test: { not_equals: true } }] },
    overrideAccess: true,
  })
  return totalDocs
}

/**
 * The same place however it was typed: "Molina's Ranch", "molinas ranch" and
 * "MOLINA’S RANCH" fold together, as do "La Ventanita" and "ventanita".
 * Accents, case, punctuation and a leading article don't count.
 */
export function foldPlace(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`´]/g, '')
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
    .replace(/^(?:el|la|los|las|the) /, '')
}

export type NominatedPlace = { name: string; count: number; areas: string[] }

/**
 * The places named for a ranking, most-named first, each under its most common
 * spelling. What seeding reads; a close call (one place typed two ways the fold
 * doesn't catch) is a person's decision.
 */
export async function nominationTally(payload: Payload, rankingId: number): Promise<NominatedPlace[]> {
  const { docs } = await payload.find({
    collection: 'ranking-nominations',
    where: { and: [{ ranking: { equals: rankingId } }, { test: { not_equals: true } }] },
    select: { name: true, area: true },
    // Oldest first, so a tie between two spellings goes to the one named first.
    sort: 'createdAt',
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const groups = new Map<string, { count: number; spellings: Map<string, number>; areas: Set<string> }>()
  for (const d of docs) {
    const key = foldPlace(d.name)
    if (!key) continue
    const g = groups.get(key) ?? { count: 0, spellings: new Map(), areas: new Set() }
    g.count++
    g.spellings.set(d.name, (g.spellings.get(d.name) ?? 0) + 1)
    if (d.area) g.areas.add(d.area)
    groups.set(key, g)
  }
  return [...groups.values()]
    .map((g) => ({
      name: [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
      count: g.count,
      areas: [...g.areas],
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
