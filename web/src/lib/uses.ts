import type { Payload } from 'payload'

import { UNINCORPORATED } from './civicSync'
import { CITY_MAYORS } from './mayors'
import { deviceOf, shouldCount } from './visits'
import { detectWebview } from './webview'
import { USE_ACTIONS, USE_BROWSERS, USE_SECTIONS, type UseAction, type UseBrowser, type UseSection } from './useKinds'

export { USE_ACTIONS, USE_BROWSERS, USE_SECTIONS, type UseAction, type UseBrowser, type UseSection }

/**
 * How people use the address tool, the counter's other half: `hq-visits` says
 * someone opened /address, this says what they did there. Looked an address
 * up, found nothing, added the trash days to their calendar, got stuck in
 * Instagram's browser and copied the link out, opened the flood or voting
 * card's links. One `hq-uses` row per action.
 *
 * The same rules as the visit counter (lib/visits.ts): no IP, no user agent,
 * no cookie, no visitor id, and never the address itself. The only thing
 * kept about the address is its municipality ("HIALEAH"), so two actions can
 * never be tied to a person or a house. Bots, staff, the owner's devices and
 * other sites' posts are not counted (`shouldCount`).
 *
 * The browser's own page sends most rows through `/api/use`
 * (components/UseTracker.tsx); the calendar download is counted where the
 * file is served (api/address/calendar), because a tap is not a download.
 */

/** Every municipality the county names, plus the unincorporated county. Anything else is dropped. */
const AREAS = new Set([UNINCORPORATED, ...CITY_MAYORS.map((m) => m.munic)])

export type UseInput = {
  action: UseAction
  section?: UseSection
  /** The county's municipality name for the address ("HIALEAH"). Never the address. */
  area?: string
  lang?: 'es' | 'en'
}

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v)

/**
 * A use from an untrusted body, or null. Only known actions, sections and
 * municipalities get through, so nobody can write their own strings into the
 * table; a `link` must say which card.
 */
export function normalizeUse(raw: unknown): UseInput | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  if (!isOneOf(USE_ACTIONS, b.action)) return null
  const section = isOneOf(USE_SECTIONS, b.section) ? b.section : undefined
  if (b.action === 'link' && !section) return null
  return {
    action: b.action,
    section: b.action === 'link' ? section : undefined,
    area: typeof b.area === 'string' && AREAS.has(b.area) ? b.area : undefined,
    lang: b.lang === 'es' || b.lang === 'en' ? b.lang : undefined,
  }
}

/** The browser from its user agent; only the app's name is kept. */
export function browserOf(userAgent: string | null): UseBrowser {
  const w = detectWebview(userAgent)
  if (!w) return 'browser'
  const app = w.app.toLowerCase()
  return isOneOf(USE_BROWSERS, app) ? app : 'other-app'
}

/** Like the visit counter's cap: only bounds how fast the table could be filled on purpose. */
const PER_MINUTE = 240
let windowStart = 0
let inWindow = 0

export function resetUseLimit() {
  windowStart = 0
  inWindow = 0
}

function underLimit(now: number): boolean {
  if (now - windowStart >= 60_000) {
    windowStart = now
    inWindow = 0
  }
  inWindow += 1
  return inWindow <= PER_MINUTE
}

/**
 * Store one use. Never throws: a visitor's page must not care whether the
 * count worked. Returns whether a row was written.
 */
export async function recordUse(
  payload: Payload,
  raw: unknown,
  headers: Headers,
  now: number = Date.now(),
): Promise<boolean> {
  const use = normalizeUse(raw)
  if (!use) return false
  if (!shouldCount(headers) || !underLimit(now)) return false
  const ua = headers.get('user-agent')
  try {
    await payload.create({
      collection: 'hq-uses',
      data: {
        tool: 'address',
        action: use.action,
        section: use.section,
        area: use.area,
        lang: use.lang,
        browser: browserOf(ua),
        device: deviceOf(ua),
        country: headers.get('cf-ipcountry')?.slice(0, 2) || undefined,
      },
      overrideAccess: true,
      depth: 0,
    })
    return true
  } catch (err) {
    console.error('[hq] use not recorded:', err instanceof Error ? err.message : err)
    return false
  }
}

const count = <K extends string>(rows: K[]) =>
  Object.fromEntries(
    Object.entries(
      rows.reduce<Record<string, number>>((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {}),
    ).sort((a, b) => b[1] - a[1]),
  )

/**
 * The address tool over the last `days`, for the growth review: how many
 * lookups, how many ended in the calendar, how many were stuck in an app's
 * browser and what they did about it, and which cards' links get opened.
 */
export async function toolUseReport(payload: Payload, days: number, now: Date = new Date()) {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
  const res = await payload.find({
    collection: 'hq-uses',
    where: { createdAt: { greater_than_equal: since } },
    limit: 20_000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { action: true, section: true, area: true, browser: true },
  })
  const rows = res.docs
  const of = (a: UseAction) => rows.filter((r) => r.action === a)
  const lookups = of('lookup')
  return {
    days,
    note: 'Address tool use (hq-uses), one row per action, nothing identifying and never the address; bots and staff not counted. lookup = a report was shown; calendar = the .ics was downloaded (the "it worked" moment); open_chrome / copy_link = ways out of an app\'s built-in browser, where the calendar button is hidden. Someone who escapes an app\'s browser loads the same report again in Safari or Chrome, so they count as two lookups (one in the app, one in a browser): read calendarPerLookup for reel traffic with that in mind. Counted from the day this shipped.',
    actions: count(rows.map((r) => r.action)),
    lookupsByBrowser: count(lookups.map((r) => r.browser ?? 'browser')),
    lookupsByArea: count(lookups.map((r) => r.area ?? 'unknown')),
    linksBySection: count(of('link').map((r) => r.section ?? 'unknown')),
    calendarPerLookup: lookups.length ? Math.round((of('calendar').length / lookups.length) * 100) / 100 : null,
  }
}
