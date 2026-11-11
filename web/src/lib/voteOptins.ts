import type { Payload } from 'payload'

import { storyPollCopy } from './storyPollCopy'
import { clientAddress, getPublishedPoll, miamiDay, pollPhase } from './storyPolls'
import { isBot, isSourceSlug } from './tracking'
import { classifySource, isStaff, normalizeHost } from './visits'

/**
 * "Want to vote every week?": after voting, a visitor can leave their WhatsApp
 * number so we can tell them when the next vote opens and who won. One row
 * per number in `vote-whatsapp-optins`, with the exact consent sentence they
 * ticked and when. Nothing is sent from here: the rows wait for the WhatsApp
 * API. Staff-only, and off MCP.
 *
 * Same guards as a vote (lib/storyPolls.ts): no bots, same-origin only, the
 * poll must be open, and a per-address cap held in memory (the address is
 * never written down). Asking again with the same number updates its language
 * and poll instead of adding a row.
 */

/**
 * A WhatsApp number as typed, in E.164 ("+17869774602"), or null. A number
 * with no country code is a US one (+1). Another country starts with "+",
 * "00" or "011". 7 to 15 digits in all, and a +1 number has exactly 11.
 */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const typed = raw.trim()
  if (!typed || typed.length > 32 || /[^\d\s+().\-/]/.test(typed)) return null
  if (typed.indexOf('+') > 0 || typed.split('+').length > 2) return null
  let digits = typed.replace(/\D/g, '')
  if (typed.startsWith('+')) {
    // Already international.
  } else if (digits.startsWith('011')) {
    digits = digits.slice(3)
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2)
  } else if (digits.length === 10) {
    digits = `1${digits}`
  } else if (!(digits.length === 11 && digits.startsWith('1'))) {
    return null
  }
  if (digits.length < 7 || digits.length > 15 || digits.startsWith('0')) return null
  if (digits.startsWith('1') && digits.length !== 11) return null
  return `+${digits}`
}

const PER_MINUTE = 120
// Per address, per Miami day. A household or a carrier can share an address,
// so it's a ceiling, not "one".
const PER_ADDRESS_PER_DAY = 10

let minuteStart = 0
let inMinute = 0
const byAddress = new Map<string, number>()
let addressDay = ''

export function resetOptinLimits() {
  minuteStart = 0
  inMinute = 0
  byAddress.clear()
  addressDay = ''
}

function underLimit(headers: Headers, now: number): boolean {
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
  if (byAddress.size > 50_000) byAddress.clear()
  const n = (byAddress.get(addr) ?? 0) + 1
  byAddress.set(addr, n)
  return n <= PER_ADDRESS_PER_DAY
}

export type OptinInput = { slug?: unknown; phone?: unknown; consent?: unknown; lang?: unknown; ref?: unknown; utm?: unknown }
export type OptinResult =
  | { ok: true; created: boolean }
  | { ok: false; reason: 'not-found' | 'closed' | 'phone' | 'consent' | 'refused' | 'busy' }

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Save (or refresh) one number's opt-in. The consent sentence stored is the
 * site's own for that language, never anything the browser sent. A number
 * already on the list keeps its first consent date; one that had opted out
 * and ticks the box again is active again, from now.
 */
export async function saveVoteOptin(
  payload: Payload,
  input: OptinInput,
  headers: Headers,
  now: number = Date.now(),
  { preview = false }: { preview?: boolean } = {},
): Promise<OptinResult> {
  const slug = typeof input.slug === 'string' && SLUG.test(input.slug) ? input.slug : null
  if (!slug) return { ok: false, reason: 'not-found' }
  if (isBot(headers.get('user-agent'))) return { ok: false, reason: 'refused' }
  const site = headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return { ok: false, reason: 'refused' }

  const poll = await getPublishedPoll(payload, slug, undefined, { draft: preview })
  if (!poll) return { ok: false, reason: 'not-found' }
  if (pollPhase(poll, now) !== 'open') return { ok: false, reason: 'closed' }
  if (input.consent !== true) return { ok: false, reason: 'consent' }
  const phone = normalizePhone(input.phone)
  if (!phone) return { ok: false, reason: 'phone' }
  if (!underLimit(headers, now)) return { ok: false, reason: 'busy' }

  const lang = input.lang === 'en' ? 'en' : 'es'
  const consentText = storyPollCopy(lang).optinConsent
  const at = new Date(now).toISOString()
  const test = preview || isStaff(headers)

  const { docs } = await payload.find({
    collection: 'vote-whatsapp-optins',
    where: { phone: { equals: phone } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const existing = docs[0]
  if (existing) {
    const again = existing.status === 'unsubscribed'
    await payload.update({
      collection: 'vote-whatsapp-optins',
      id: existing.id,
      data: {
        lang,
        poll: poll.id,
        ...(again ? { status: 'active', consentText, consentAt: at } : {}),
      },
      overrideAccess: true,
      depth: 0,
    })
    return { ok: true, created: false }
  }

  const utm = typeof input.utm === 'string' && isSourceSlug(input.utm.toLowerCase()) ? input.utm.toLowerCase() : null
  const ref = normalizeHost(input.ref)
  const own = normalizeHost(headers.get('x-forwarded-host') ?? headers.get('host'))
  try {
    await payload.create({
      collection: 'vote-whatsapp-optins',
      data: {
        phone,
        lang,
        poll: poll.id,
        consentText,
        consentAt: at,
        source: classifySource(ref && ref !== own ? ref : null, utm),
        status: 'active',
        test,
      },
      overrideAccess: true,
      depth: 0,
    })
  } catch (err) {
    // Two taps at once with the same number: the unique index keeps one row, which is the point.
    const dupe = await payload.count({ collection: 'vote-whatsapp-optins', where: { phone: { equals: phone } }, overrideAccess: true })
    if (dupe.totalDocs > 0) return { ok: true, created: false }
    throw err
  }
  return { ok: true, created: true }
}
