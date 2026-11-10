import type { Payload } from 'payload'

import { noPrice } from '../fields/shared'
import { clientAddress, getPublishedPoll, miamiDay } from './storyPolls'
import { isBot, isSourceSlug } from './tracking'
import { classifySource, isStaff, normalizeHost } from './visits'

/**
 * "Suggest a story", the small box under the weekly vote (lib/storyPolls.ts):
 * a fan types a Miami story they want told. Not a fifth option — ideas for
 * next week's. Stored like a ranking nomination (lib/rankingNominations.ts):
 * no IP, cookie, user agent or visitor id; a small per-address cap held in
 * memory. Unchecked text, so never shown publicly; read over MCP
 * (story-poll-suggestions) or in the admin.
 */

const PER_MINUTE = 300
// Per address, per poll, per Miami day: a few ideas, not a flood.
const PER_ADDRESS_PER_DAY = 3
export const SUGGESTION_MAX = 140

let minuteStart = 0
let inMinute = 0
const byAddress = new Map<string, number>()
let addressDay = ''

export function resetSuggestionLimits() {
  minuteStart = 0
  inMinute = 0
  byAddress.clear()
  addressDay = ''
}

function underLimit(headers: Headers, pollId: number, now: number): boolean {
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

const LINK = /https?:|www\.|\.(?:com|net|org|co|io|us|biz|info|me)\b|@/i
const PHONE = /(?:\d[\s().-]*){7,}/

/** The suggestion as it should be stored, or null when it isn't just words about a story (a link, a phone, a price, too short or long). */
export function cleanSuggestion(v: unknown): string | null {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
  if (s.length < 3 || s.length > SUGGESTION_MAX || LINK.test(s) || PHONE.test(s) || noPrice(s) !== true) return null
  return s
}

export type SuggestionInput = { slug?: unknown; text?: unknown; lang?: unknown; ref?: unknown; utm?: unknown }
export type SuggestionResult = { ok: true } | { ok: false; reason: 'not-found' | 'invalid' | 'refused' | 'busy' }

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * One suggestion, on a published poll whatever its phase: someone arriving
 * after the vote closed can still say what they want next. `preview` (an
 * admin checked by the route) suggests on the saved draft, always as a test.
 */
export async function suggestStory(
  payload: Payload,
  input: SuggestionInput,
  headers: Headers,
  now: number = Date.now(),
  { preview = false }: { preview?: boolean } = {},
): Promise<SuggestionResult> {
  const slug = typeof input.slug === 'string' && SLUG.test(input.slug) ? input.slug : null
  if (!slug) return { ok: false, reason: 'not-found' }
  if (isBot(headers.get('user-agent'))) return { ok: false, reason: 'refused' }
  const site = headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return { ok: false, reason: 'refused' }

  const poll = await getPublishedPoll(payload, slug, undefined, { draft: preview })
  if (!poll) return { ok: false, reason: 'not-found' }
  const text = cleanSuggestion(input.text)
  if (!text) return { ok: false, reason: 'invalid' }

  if (!underLimit(headers, poll.id, now)) return { ok: false, reason: 'busy' }

  const utm = typeof input.utm === 'string' && isSourceSlug(input.utm.toLowerCase()) ? input.utm.toLowerCase() : null
  const ref = normalizeHost(input.ref)
  const own = normalizeHost(headers.get('x-forwarded-host') ?? headers.get('host'))
  await payload.create({
    collection: 'story-poll-suggestions',
    data: {
      poll: poll.id,
      text,
      source: classifySource(ref && ref !== own ? ref : null, utm),
      lang: input.lang === 'en' ? 'en' : 'es',
      test: preview || isStaff(headers),
    },
    overrideAccess: true,
  })
  return { ok: true }
}
